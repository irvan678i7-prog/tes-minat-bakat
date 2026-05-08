import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { generateTokenCode } from "@/lib/token";

const Body = z.object({
  testKind: z.enum(["MINAT", "BAKAT"]),
  count: z.number().int().min(1).max(100).default(1),
  ttlSec: z.number().int().min(60).max(60 * 60).default(300),
});

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { testKind, count, ttlSec } = parsed.data;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  const created = [];
  for (let i = 0; i < count; i++) {
    let code = generateTokenCode();
    // ensure uniqueness
    while (await prisma.accessToken.findUnique({ where: { code } })) {
      code = generateTokenCode();
    }
    const t = await prisma.accessToken.create({
      data: { code, testKind, expiresAt, createdById: admin.sub },
    });
    created.push(t);
  }
  return NextResponse.json({ tokens: created });
}

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const includeRedeemed = searchParams.get("all") === "1";
  const tokens = await prisma.accessToken.findMany({
    where: includeRedeemed ? {} : { redeemedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      submission: {
        select: { id: true, fullName: true, finishedAt: true },
      },
    },
  });
  return NextResponse.json({ tokens });
}
