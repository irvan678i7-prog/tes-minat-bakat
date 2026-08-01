import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rekap hasil tes IQ CFIT untuk admin — terpisah dari rekap minat-bakat.
// GET ?finishedOnly=0 untuk ikut menampilkan peserta yang belum selesai.
export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const finishedOnly = searchParams.get("finishedOnly") !== "0";

  const submissions = await prisma.cfitSubmission.findMany({
    where: finishedOnly ? { finishedAt: { not: null } } : {},
    orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      form: true,
      fullName: true,
      gender: true,
      age: true,
      grade: true,
      school: true,
      startedAt: true,
      finishedAt: true,
      violationCount: true,
      flaggedCheating: true,
      token: { select: { code: true } },
      result: {
        select: {
          rawScoreA: true,
          rawScoreB: true,
          rawScoreTotal: true,
          iq: true,
          classification: true,
          payload: true,
          generatedAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    count: submissions.length,
    submissions: submissions.map((s) => ({
      ...s,
      tokenCode: s.token.code,
      token: undefined,
    })),
  });
}
