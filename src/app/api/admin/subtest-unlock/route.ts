import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { isMissingColumnError } from "@/lib/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BUKA KUNCI SUBTES — jawaban untuk audit #8.
//
// Sebelum ini, subtes yang sudah TIME_UP terkunci PERMANEN: tidak ada jalan
// keluar untuk listrik mati lebih dari jatah jeda, siswa sakit di tengah
// subtes, atau salah klik "selesaikan". Endpoint ini memberi waktu tambahan
// terbatas untuk kasus-kasus itu.
//
// Caranya sengaja memakai jalur yang sama dengan timer sadar-jeda: kosongkan
// finishedAt/finishReason lalu set consumedSec = durationSec - extraSec.
// Jadi tidak ada mekanisme baru yang bisa bertabrakan — begitu siswa membuka
// halaman, denyut melanjutkan hitungan dari sisa waktu yang baru. Jawaban yang
// sudah masuk TIDAK disentuh.

const Body = z.object({
  kind: z.enum(["MINAT_BAKAT", "CFIT"]),
  submissionId: z.string().min(1),
  subtestCode: z.string().min(1),
  // Waktu tambahan. Dibatasi 1–60 menit supaya tidak ada "waktu tak terbatas".
  extraSec: z.number().int().min(60).max(3600).optional(),
  // Kalau seluruh sesi sudah tertutup, membuka satu subtes saja tidak cukup.
  reopenSession: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input tidak valid. Butuh kind, submissionId, dan subtestCode." },
      { status: 400 },
    );
  }
  const { kind, submissionId, subtestCode } = parsed.data;
  const extraSec = parsed.data.extraSec ?? 300;
  const isCfit = kind === "CFIT";

  // 1. Sesi harus ada.
  const session = isCfit
    ? await prisma.cfitSubmission.findUnique({
        where: { id: submissionId },
        select: { id: true, fullName: true, finishedAt: true },
      })
    : await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { id: true, fullName: true, finishedAt: true },
      });
  if (!session) return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });

  // 2. Subtes harus ada — durationSec-nya yang jadi dasar hitungan.
  const subtest = isCfit
    ? await prisma.cfitSubtest.findUnique({
        where: { code: subtestCode },
        select: { id: true, name: true, durationSec: true },
      })
    : await prisma.subtest.findUnique({
        where: { code: subtestCode },
        select: { id: true, name: true, durationSec: true },
      });
  if (!subtest) {
    return NextResponse.json({ error: `Subtes "${subtestCode}" tidak ditemukan.` }, { status: 404 });
  }

  // 3. Baris progres harus sudah ada — kalau subtes belum pernah dibuka,
  //    tidak ada yang perlu dibuka kuncinya.
  const where = {
    submissionId_subtestId: { submissionId: session.id, subtestId: subtest.id },
  };
  const progress = isCfit
    ? await prisma.cfitSubtestProgress.findUnique({ where, select: { id: true, finishedAt: true } })
    : await prisma.subtestProgress.findUnique({ where, select: { id: true, finishedAt: true } });
  if (!progress) {
    return NextResponse.json(
      { error: "Subtes ini belum pernah dibuka siswa, jadi tidak terkunci." },
      { status: 409 },
    );
  }

  const now = new Date();
  const consumedSec = Math.max(0, subtest.durationSec - extraSec);
  // Timer MINAT/BAKAT sekarang JAM DINDING MURNI: waktu terpakai dihitung
  // ulang dari startedAt (lihat projectSubtestTime di subtestLock.ts), BUKAN
  // dari kolom consumedSec. Kalau hanya consumedSec yang ditulis, subtes akan
  // langsung terkunci lagi begitu siswa membukanya — tombol "+ WAKTU" jadi
  // tidak berfungsi sama sekali. Karena itu startedAt ikut DIGESER sehingga
  // (now - startedAt) = consumedSec baru = durationSec - extraSec. Jam mulai
  // asli memang berubah, tapi jejak tindakan ini dicatat di log audit bawah.
  const shiftedStartedAt = new Date(now.getTime() - consumedSec * 1000);
  const fullData = {
    finishedAt: null,
    finishReason: null,
    consumedSec,
    lastSeenAt: now,
  };
  // Cadangan kalau migrasi 0007/0009 belum di-apply: minimal kuncinya dibuka.
  const liteData = { finishedAt: null, finishReason: null };
  let partial = false;

  try {
    if (isCfit) {
      // Timer CFIT masih sadar-jeda (akumulasi consumedSec) — startedAt
      // TIDAK perlu digeser.
      await prisma.cfitSubtestProgress.update({ where, data: fullData });
    } else {
      await prisma.subtestProgress.update({
        where,
        data: { ...fullData, startedAt: shiftedStartedAt },
      });
    }
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    partial = true;
    if (isCfit) {
      await prisma.cfitSubtestProgress.update({ where, data: liteData });
    } else {
      // Tanpa kolom timer sadar-jeda pun, geser startedAt tetap bisa — dan
      // memang inilah yang menentukan sisa waktu pada timer jam dinding.
      await prisma.subtestProgress.update({
        where,
        data: { ...liteData, startedAt: shiftedStartedAt },
      });
    }
  }

  // 4. Opsional: buka kembali sesi yang sudah tertutup.
  let sessionReopened = false;
  if (parsed.data.reopenSession && session.finishedAt) {
    if (isCfit) {
      await prisma.cfitSubmission.update({ where: { id: session.id }, data: { finishedAt: null } });
    } else {
      await prisma.submission.update({ where: { id: session.id }, data: { finishedAt: null } });
    }
    sessionReopened = true;
  }

  // Jejak audit: tindakan ini mengubah waktu ujian, jadi harus terlihat di log.
  console.warn(
    `[admin/subtest-unlock] ${kind} sesi=${session.id} (${session.fullName ?? "tanpa nama"}) ` +
      `subtes=${subtestCode} +${extraSec}s reopenSession=${sessionReopened} partial=${partial}`,
  );

  return NextResponse.json({
    ok: true,
    kind,
    subtestCode,
    subtestName: subtest.name,
    wasLocked: !!progress.finishedAt,
    extraSec,
    consumedSec,
    sessionReopened,
    sessionStillFinished: !!session.finishedAt && !sessionReopened,
    // true = kolom timer sadar-jeda belum ada, kunci dibuka tapi sisa waktu
    // belum bisa diatur. Apply prisma/sql/0007_subtestprogress_pause_columns.sql
    // dan prisma/sql/0009_cfit_pause_and_resume.sql.
    partial,
  });
}
