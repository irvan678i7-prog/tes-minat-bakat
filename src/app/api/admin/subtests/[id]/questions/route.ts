import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sub = await prisma.subtest.findUnique({ where: { id } });
  if (!sub) return NextResponse.json({ error: "Subtest tidak ditemukan" }, { status: 404 });

  const qs = await prisma.question.findMany({
    where: { subtestId: id },
    orderBy: { questionNo: "asc" },
    select: {
      id: true,
      questionNo: true,
      prompt: true,
      imageUrl: true,
      parts: true,
      options: true,
      correct: true,
      scoringTag: true,
    },
  });
  return NextResponse.json({
    subtest: { id: sub.id, code: sub.code, name: sub.name, testKind: sub.testKind },
    questions: qs,
  });
}
