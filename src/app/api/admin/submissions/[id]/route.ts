import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

// Ambil detail log pelanggaran SATU peserta. Dipanggil hanya saat admin
// meng-klik baris — bukan tiap refresh — supaya egress tetap kecil.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sub = await prisma.submission.findUnique({
    where: { id },
    select: { id: true, violationLog: true },
  });
  if (!sub) return NextResponse.json({ error: "Data peserta tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ violationLog: sub.violationLog ?? [] });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const sub = await prisma.submission.findUnique({ where: { id }, select: { id: true, fullName: true } });
  if (!sub) return NextResponse.json({ error: "Data peserta tidak ditemukan" }, { status: 404 });

  // Cascade: result → answers → subtestProgress → submission
  await prisma.$transaction([
    prisma.result.deleteMany({ where: { submissionId: id } }),
    prisma.answer.deleteMany({ where: { submissionId: id } }),
    prisma.subtestProgress.deleteMany({ where: { submissionId: id } }),
    prisma.submission.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true, deleted: { id, fullName: sub.fullName } });
}
