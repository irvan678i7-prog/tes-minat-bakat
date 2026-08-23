import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { ensureResumeCode, signResumeLinkToken } from "@/lib/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PEMULIHAN SESI OLEH PENGAWAS.
//
// GET  → daftar sesi yang BELUM selesai (untuk dicari saat siswa lapor).
// POST → buat link pemulihan sekali-pakai (umur 30 menit) untuk satu sesi.
//
// Link inilah jalan keluar kalau siswa tidak mencatat Kode Lanjut sama sekali.
export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const tokenCode = (req.nextUrl.searchParams.get("tokenCode") ?? "").trim().toUpperCase();

  const rows = await prisma.submission.findMany({
    where: {
      finishedAt: null,
      ...(tokenCode ? { token: { code: tokenCode } } : {}),
      ...(q ? { fullName: { contains: q, mode: "insensitive" as const } } : {}),
    },
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

  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      school: r.school,
      grade: r.grade,
      testKind: r.testKind,
      startedAt: r.startedAt.toISOString(),
      resumeCode: r.resumeCode,
      tokenCode: r.token.code,
      answered: r._count.answers,
    })),
  });
}

const Body = z.object({
  submissionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

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

  const [resumeCode, token] = await Promise.all([
    ensureResumeCode(sub.id),
    Promise.resolve(signResumeLinkToken(sub.id)),
  ]);

  return NextResponse.json({
    ok: true,
    fullName: sub.fullName,
    resumeCode,
    url: `${req.nextUrl.origin}/lanjut?t=${encodeURIComponent(token)}`,
    expiresInMinutes: 30,
  });
}
