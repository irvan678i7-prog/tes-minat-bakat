import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // List unique (school, grade) pairs with counts.
  const rows = await prisma.submission.groupBy({
    by: ["school", "grade", "testKind"],
    _count: { id: true },
    where: { finishedAt: { not: null } },
    orderBy: [{ school: "asc" }, { grade: "asc" }],
  });
  return NextResponse.json({
    classes: rows.map((r) => ({
      school: r.school || "",
      grade: r.grade || "",
      testKind: r.testKind,
      count: r._count.id,
    })),
  });
}
