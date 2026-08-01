import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { generateTokenCode } from "@/lib/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Token CFIT hanya SATU macam: bentuk lengkap 3A + 3B (FORM_3AB), karena
// laporan Tes IQ selalu memakai Raw Score gabungan A + B.
const CFIT_TOKEN_FORM = "FORM_3AB" as const;

const Body = z.object({
  count: z.number().int().min(1).max(100).default(1),
  ttlSec: z.number().int().min(60).max(24 * 60 * 60).default(3600),
  // Sekolah & kelas sesi tes. Ditempel di token supaya SEMUA peserta yang
  // memakai token ini punya tulisan yang identik — siswa tidak lagi mengetik
  // sendiri, sehingga filter rekap dan laporan PDF selalu seragam.
  school: z.string().max(160).optional(),
  grade: z.string().max(60).optional(),
});

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { count, ttlSec } = parsed.data;
  const school = (parsed.data.school ?? "").trim();
  const grade = (parsed.data.grade ?? "").trim();
  if (!school) {
    return NextResponse.json(
      { error: "Nama sekolah wajib diisi — dipakai untuk semua peserta token ini." },
      { status: 400 },
    );
  }
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  const created = [];
  for (let i = 0; i < count; i++) {
    let code = generateTokenCode();
    while (await prisma.cfitAccessToken.findUnique({ where: { code } })) {
      code = generateTokenCode();
    }
    const t = await prisma.cfitAccessToken.create({
      data: {
        code,
        form: CFIT_TOKEN_FORM,
        school,
        grade: grade || null,
        expiresAt,
        createdById: admin.sub,
      },
    });
    created.push(t);
  }
  return NextResponse.json({ tokens: created });
}

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const includeAll = searchParams.get("all") === "1";
  const now = new Date();

  const tokens = await prisma.cfitAccessToken.findMany({
    where: includeAll
      ? {}
      : { OR: [{ expiresAt: { gte: now } }, { submissions: { some: {} } }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      submissions: {
        orderBy: { startedAt: "asc" },
        select: {
          id: true,
          fullName: true,
          age: true,
          grade: true,
          school: true,
          startedAt: true,
          finishedAt: true,
          violationCount: true,
          flaggedCheating: true,
          result: {
            select: { rawScoreTotal: true, iq: true, classification: true },
          },
        },
      },
    },
  });

  const withCounts = tokens.map((t) => {
    const participantCount = t.submissions.length;
    const selesaiCount = t.submissions.filter((s) => s.finishedAt).length;
    return {
      ...t,
      participantCount,
      selesaiCount,
      mengerjakanCount: participantCount - selesaiCount,
    };
  });

  const counts = {
    totalToken: withCounts.length,
    totalPeserta: withCounts.reduce((n, t) => n + t.participantCount, 0),
    selesai: withCounts.reduce((n, t) => n + t.selesaiCount, 0),
    mengerjakan: withCounts.reduce((n, t) => n + t.mengerjakanCount, 0),
  };

  return NextResponse.json({ tokens: withCounts, counts });
}
