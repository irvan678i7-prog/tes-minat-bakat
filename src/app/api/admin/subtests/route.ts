import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subs = await prisma.subtest.findMany({
    orderBy: [{ testKind: "asc" }, { orderIndex: "asc" }],
    include: { _count: { select: { questions: true } } },
  });
  return NextResponse.json({
    subtests: subs.map((s) => ({
      id: s.id,
      code: s.code,
      testKind: s.testKind,
      name: s.name,
      description: s.description,
      instructions: s.instructions ?? "",
      durationSec: s.durationSec,
      orderIndex: s.orderIndex,
      questionCount: s._count.questions,
    })),
  });
}

const PatchBody = z.object({
  id: z.string().min(1),
  durationSec: z.number().int().min(30).max(60 * 60).optional(),
  description: z.string().optional(),
  instructions: z.string().max(4000).optional(),
  name: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, ...data } = parsed.data;
  const updated = await prisma.subtest.update({ where: { id }, data });
  return NextResponse.json({ subtest: updated });
}
