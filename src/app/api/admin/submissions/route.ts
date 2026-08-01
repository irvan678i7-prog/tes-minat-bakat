import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // PENTING (hemat egress): pakai `select` supaya kolom `violationLog` yang
  // besar TIDAK ikut ditarik dari database. Daftar cukup butuh JUMLAH
  // pelanggaran (`violationCount`), bukan seluruh isinya. Detail log diambil
  // terpisah saat baris di-klik (lihat submissions/[id] GET).
  const subs = await prisma.submission.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
    select: {
      id: true,
      testKind: true,
      fullName: true,
      school: true,
      grade: true,
      startedAt: true,
      finishedAt: true,
      violationCount: true,
      flaggedCheating: true,
      token: { select: { code: true } },
      result: { select: { iqEstimate: true } },
    },
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
      violationCount: s.violationCount,
      flaggedCheating: s.flaggedCheating,
    })),
  });
}
