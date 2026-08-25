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
// Sebelumnya jalur ini hanya ada untuk minat-bakat; sesi tes IQ yang cookienya
// hilang benar-benar tidak bisa dipulihkan oleh siapa pun.

const KIND = z.enum(["MINAT_BAKAT", "CFIT"]);
type Kind = z.infer<typeof KIND>;

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

  const wantMinat = onlyKind === null || onlyKind === "MINAT_BAKAT";
  const wantCfit = onlyKind === null || onlyKind === "CFIT";

  // Sesi minat-bakat.
  const minatRows: Row[] = !wantMinat
    ? []
    : (
        await prisma.submission.findMany({
          where: { finishedAt: null, ...tokenFilter, ...nameFilter },
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
        })
      ).map((r) => ({
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

  // Sesi tes IQ. Dibungkus try/catch: kalau migrasi 0009 belum di-apply,
  // kolom resumeCode belum ada — panel TIDAK BOLEH ikut mati, daftar
  // minat-bakat harus tetap tampil.
  let cfitRows: Row[] = [];
  let cfitUnavailable = false;
  if (wantCfit) {
    try {
      const rows = await prisma.cfitSubmission.findMany({
        where: { finishedAt: null, ...tokenFilter, ...nameFilter },
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
      console.warn(
        "[admin/resume-link] Kolom pemulihan CFIT belum ada. Apply prisma/sql/0009_cfit_pause_and_resume.sql.",
      );
    }
  }

  const sessions = [...minatRows, ...cfitRows].sort((a, b) =>
    (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
  );

  return NextResponse.json({
    sessions,
    // Supaya panel admin bisa memberi tahu pengawas kalau fitur pemulihan
    // tes IQ belum aktif karena migrasi belum dijalankan.
    cfitUnavailable,
  });
}

const Body = z.object({
  submissionId: z.string().min(1),
  kind: KIND.optional(),
});

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
  });
}
