import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subs = await prisma.submission.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
    include: { result: true, token: true },
  });
  return NextResponse.json({
    submissions: subs.map((s) => ({
      id: s.id,
      tokenCode: s.token.code,
      testKind: s.testKind,
      fullName: s.fullName,
      school: s.school,
      grade: s.grade,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      iqEstimate: s.result?.iqEstimate,
      hasResult: !!s.result,
    })),
  });
}
