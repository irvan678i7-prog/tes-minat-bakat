import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hapus satu peserta CFIT beserta SEMUA data terkait (jawaban, progress
// subtes, hasil). Dilakukan dalam satu transaksi — eksplisit deleteMany
// dulu supaya aman walau foreign key tidak memakai ON DELETE CASCADE.
// Token TIDAK ikut dihapus (token kelas bisa dipakai peserta lain).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const sub = await prisma.cfitSubmission.findUnique({
    where: { id },
    select: { id: true, fullName: true },
  });
  if (!sub) return NextResponse.json({ error: "Peserta tidak ditemukan" }, { status: 404 });

  await prisma.$transaction([
    prisma.cfitAnswer.deleteMany({ where: { submissionId: id } }),
    prisma.cfitSubtestProgress.deleteMany({ where: { submissionId: id } }),
    prisma.cfitResult.deleteMany({ where: { submissionId: id } }),
    prisma.cfitSubmission.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true, deletedId: id, fullName: sub.fullName });
}
