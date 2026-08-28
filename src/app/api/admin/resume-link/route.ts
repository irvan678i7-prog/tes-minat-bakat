import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import {
  RESUME_LINK_TTL_MINUTES,
  ensureResumeCode,
  isMissingColumnError,
  issueResumeLinkToken,
} from "@/lib/resume";
import {
  CFIT_RESUME_LINK_TTL_MINUTES,
  ensureCfitResumeCode,
  issueCfitResumeLinkToken,
} from "@/lib/cfit/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PEMULIHAN SESI OLEH PENGAWAS — untuk KEDUA tes (minat-bakat & tes IQ).
//
// GET  → daftar sesi yang BELUM selesai (untuk dicari saat siswa lapor).
// POST → buat link pemulihan SEKALI PAKAI (umur 30 menit) untuk satu sesi.
//
// Link inilah jalan keluar kalau siswa tidak mencatat Kode Lanjut sama sekali.
//
// ── CATATAN BUG PRODUKSI (Agustus 2026) ────────────────────────────────────
// Dulu hanya blok CFIT yang dibungkus try/catch + isMissingColumnError,
// sedangkan query daftar minat-bakat TIDAK — padahal ia men-select kolom
// "resumeCode" yang baru datang dari prisma/sql/0008. Karena repo ini tidak
// memakai `prisma migrate deploy` (build hanya `prisma generate`), SQL di
// prisma/sql/ harus dijalankan manual di Supabase. Kalau lupa:
//
//   * pickFreeResumeCode() → null  → submission dibuat TANPA Kode Lanjut,
//     jadi kode yang dipegang siswa memang tidak pernah ada di database →
//     /lanjut selalu menolak ("kode tidak ditemukan").
//   * GET ini → P2022 → 500 → panel Pemulihan gagal memuat daftar →
//     pengawas tidak bisa mengirim link, padahal POST-nya sanggup jalan.
//
// Sekarang kedua tes memakai pola yang sama dan ada FALLBACK tanpa kolom
// pemulihan: kolom yang belum ada tidak lagi mematikan panel, dan response
// menyebutkan file SQL mana yang perlu di-apply.

const KIND = z.enum(["MINAT_BAKAT", "CFIT"]);
type Kind = z.infer<typeof KIND>;

const SQL_MINAT_RESUME_CODE = "prisma/sql/0008_submission_resume_code.sql";
const SQL_CFIT_RESUME = "prisma/sql/0009_cfit_pause_and_resume.sql";
const SQL_SINGLE_USE = "prisma/sql/0010_resume_link_single_use.sql";

type Row = {
  id: string;
  kind: Kind;
  fullName: string | null;
  school: string | null;
  grade: string | null;
  testKind: string;
  startedAt: string | null;
  resumeCode: string | null;
  tokenCode: string | null;
  answered: number;
};

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const tokenCode = (req.nextUrl.searchParams.get("tokenCode") ?? "").trim().toUpperCase();
  const kindParam = KIND.safeParse(req.nextUrl.searchParams.get("kind") ?? "");
  const onlyKind: Kind | null = kindParam.success ? kindParam.data : null;

  const nameFilter = q ? { fullName: { contains: q, mode: "insensitive" as const } } : {};
  const tokenFilter = tokenCode ? { token: { code: tokenCode } } : {};
  const where = { finishedAt: null, ...tokenFilter, ...nameFilter };

  const wantMinat = onlyKind === null || onlyKind === "MINAT_BAKAT";
  const wantCfit = onlyKind === null || onlyKind === "CFIT";

  // File SQL yang terdeteksi belum di-apply. Dikirim ke panel supaya pengawas
  // tahu persis apa yang harus diminta ke admin teknis.
  const missingMigrations: string[] = [];

  // Sesi minat-bakat.
  let minatRows: Row[] = [];
  let minatUnavailable = false;
  if (wantMinat) {
    try {
      const rows = await prisma.submission.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          fullName: true,
          school: true,
          grade: true,
          testKind: true,
          startedAt: true,
          resumeCode: true,
          token: { select: { code: true } },
          _count: { select: { answers: true } },
        },
      });
      minatRows = rows.map((r) => ({
        id: r.id,
        kind: "MINAT_BAKAT" as const,
        fullName: r.fullName,
        school: r.school,
        grade: r.grade,
        testKind: r.testKind,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        resumeCode: r.resumeCode,
        tokenCode: r.token?.code ?? null,
        answered: r._count.answers,
      }));
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      minatUnavailable = true;
      missingMigrations.push(SQL_MINAT_RESUME_CODE, SQL_SINGLE_USE);
      console.warn(
        `[admin/resume-link] Kolom pemulihan minat-bakat belum ada. Apply ${SQL_MINAT_RESUME_CODE} dan ${SQL_SINGLE_USE}.`,
      );
      // Ulangi TANPA kolom pemulihan. Daftar harus tetap tampil supaya
      // pengawas masih bisa memilih siswa dan menerbitkan link — link tetap
      // berfungsi, hanya belum bisa dibatasi sekali pakai.
      const rows = await prisma.submission.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          fullName: true,
          school: true,
          grade: true,
          testKind: true,
          startedAt: true,
          token: { select: { code: true } },
          _count: { select: { answers: true } },
        },
      });
      minatRows = rows.map((r) => ({
        id: r.id,
        kind: "MINAT_BAKAT" as const,
        fullName: r.fullName,
        school: r.school,
        grade: r.grade,
        testKind: r.testKind,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        resumeCode: null,
        tokenCode: r.token?.code ?? null,
        answered: r._count.answers,
      }));
    }
  }

  // Sesi tes IQ. Pola sama: kolom yang belum ada TIDAK boleh mematikan panel.
  let cfitRows: Row[] = [];
  let cfitUnavailable = false;
  if (wantCfit) {
    try {
      const rows = await prisma.cfitSubmission.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          fullName: true,
          school: true,
          grade: true,
          form: true,
          startedAt: true,
          resumeCode: true,
          token: { select: { code: true } },
          _count: { select: { answers: true } },
        },
      });
      cfitRows = rows.map((r) => ({
        id: r.id,
        kind: "CFIT" as const,
        fullName: r.fullName,
        school: r.school,
        grade: r.grade,
        testKind: `CFIT ${String(r.form).replace("FORM_", "")}`,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        resumeCode: r.resumeCode,
        tokenCode: r.token?.code ?? null,
        answered: r._count.answers,
      }));
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      cfitUnavailable = true;
      missingMigrations.push(SQL_CFIT_RESUME, SQL_SINGLE_USE);
      console.warn(
        `[admin/resume-link] Kolom pemulihan CFIT belum ada. Apply ${SQL_CFIT_RESUME} dan ${SQL_SINGLE_USE}.`,
      );
      try {
        const rows = await prisma.cfitSubmission.findMany({
          where,
          orderBy: { startedAt: "desc" },
          take: 50,
          select: {
            id: true,
            fullName: true,
            school: true,
            grade: true,
            form: true,
            startedAt: true,
            token: { select: { code: true } },
            _count: { select: { answers: true } },
          },
        });
        cfitRows = rows.map((r) => ({
          id: r.id,
          kind: "CFIT" as const,
          fullName: r.fullName,
          school: r.school,
          grade: r.grade,
          testKind: `CFIT ${String(r.form).replace("FORM_", "")}`,
          startedAt: r.startedAt ? r.startedAt.toISOString() : null,
          resumeCode: null,
          tokenCode: r.token?.code ?? null,
          answered: r._count.answers,
        }));
      } catch (fallbackErr) {
        // Tabel/kolom dasarnya pun belum ada — biarkan daftar CFIT kosong,
        // daftar minat-bakat tetap harus tampil.
        if (!isMissingColumnError(fallbackErr)) throw fallbackErr;
      }
    }
  }

  const sessions = [...minatRows, ...cfitRows].sort((a, b) =>
    (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
  );

  return NextResponse.json({
    sessions,
    // Supaya panel admin bisa memberi tahu pengawas kalau fitur pemulihan
    // belum sepenuhnya aktif karena migrasi belum dijalankan.
    cfitUnavailable,
    minatUnavailable,
    missingMigrations: [...new Set(missingMigrations)],
  });
}

const Body = z.object({
  submissionId: z.string().min(1),
  kind: KIND.optional(),
});

function missingColumnWarning(files: string[]): string {
  return (
    "Kode Lanjut belum bisa dibuat karena kolom database-nya belum ada. " +
    "Link di bawah tetap berfungsi, tapi BELUM sekali pakai — jangan sebar ke grup kelas. " +
    `Minta admin teknis menjalankan ${files.join(" dan ")} di Supabase SQL Editor.`
  );
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

  const kind: Kind = parsed.data.kind ?? "MINAT_BAKAT";
  const origin = req.nextUrl.origin;

  if (kind === "CFIT") {
    const sub = await prisma.cfitSubmission.findUnique({
      where: { id: parsed.data.submissionId },
      select: { id: true, fullName: true, finishedAt: true },
    });
    if (!sub) return NextResponse.json({ error: "Sesi tes IQ tidak ditemukan" }, { status: 404 });
    if (sub.finishedAt) {
      return NextResponse.json(
        { error: "Sesi ini sudah selesai — tidak bisa dilanjutkan." },
        { status: 409 },
      );
    }

    // Berurutan, bukan Promise.all: keduanya menulis baris yang sama.
    const resumeCode = await ensureCfitResumeCode(sub.id);
    const token = await issueCfitResumeLinkToken(sub.id);

    return NextResponse.json({
      ok: true,
      kind,
      fullName: sub.fullName,
      resumeCode,
      // k=cfit memberi tahu halaman /lanjut bahwa ini sesi tes IQ.
      url: `${origin}/lanjut?t=${encodeURIComponent(token)}&k=cfit`,
      expiresInMinutes: CFIT_RESUME_LINK_TTL_MINUTES,
      ...(resumeCode ? {} : { warning: missingColumnWarning([SQL_CFIT_RESUME, SQL_SINGLE_USE]) }),
    });
  }

  const sub = await prisma.submission.findUnique({
    where: { id: parsed.data.submissionId },
    select: { id: true, fullName: true, finishedAt: true },
  });
  if (!sub) return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) {
    return NextResponse.json(
      { error: "Sesi ini sudah selesai — tidak bisa dilanjutkan." },
      { status: 409 },
    );
  }

  const resumeCode = await ensureResumeCode(sub.id);
  const token = await issueResumeLinkToken(sub.id);

  return NextResponse.json({
    ok: true,
    kind,
    fullName: sub.fullName,
    resumeCode,
    url: `${origin}/lanjut?t=${encodeURIComponent(token)}`,
    expiresInMinutes: RESUME_LINK_TTL_MINUTES,
    ...(resumeCode
      ? {}
      : { warning: missingColumnWarning([SQL_MINAT_RESUME_CODE, SQL_SINGLE_USE]) }),
  });
}
