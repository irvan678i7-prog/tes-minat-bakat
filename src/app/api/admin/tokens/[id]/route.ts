import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const tok = await prisma.accessToken.findUnique({
    where: { id },
    select: { id: true, code: true, submissions: { select: { id: true } } },
  });
  if (!tok) return NextResponse.json({ error: "Token tidak ditemukan" }, { status: 404 });

  // Cascade: hapus semua submission beserta data turunannya (result, answer,
  // subtestProgress), lalu hapus token itu sendiri.
  const subIds = tok.submissions.map((s) => s.id);
  await prisma.$transaction([
    ...(subIds.length > 0
      ? [
          prisma.result.deleteMany({ where: { submissionId: { in: subIds } } }),
          prisma.answer.deleteMany({ where: { submissionId: { in: subIds } } }),
          prisma.subtestProgress.deleteMany({ where: { submissionId: { in: subIds } } }),
          prisma.submission.deleteMany({ where: { id: { in: subIds } } }),
        ]
      : []),
    prisma.accessToken.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true, deleted: { id, code: tok.code } });
}
