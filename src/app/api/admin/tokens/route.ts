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
  // Class/broadcast token: 1 token = banyak siswa. Filter default = sembunyikan
  // token yang sudah kadaluarsa DAN tidak punya submission (token mati total).
  // `?all=1` → tampilkan semua termasuk yang sudah kadaluarsa kosongan.
  const includeAll = searchParams.get("all") === "1";
  const now = new Date();
  const tokens = await prisma.accessToken.findMany({
    where: includeAll
      ? {}
      : {
          OR: [
            { expiresAt: { gte: now } },
            { submissions: { some: {} } },
          ],
        },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      submissions: {
        orderBy: { startedAt: "asc" },
        select: {
          id: true,
          fullName: true,
          grade: true,
          school: true,
          startedAt: true,
          finishedAt: true,
          violationCount: true,
          flaggedCheating: true,
        },
      },
    },
  });

  // Compute progress per submission: which subtests are complete / in-progress.
  const submissionIds = tokens.flatMap((t) => t.submissions.map((s) => s.id));

  type SubtestMeta = { id: string; code: string; name: string; orderIndex: number; total: number };
  const subtestsByKind: Record<"MINAT" | "BAKAT", SubtestMeta[]> = { MINAT: [], BAKAT: [] };

  if (submissionIds.length > 0) {
    const subtests = await prisma.subtest.findMany({
      orderBy: { orderIndex: "asc" },
      include: { _count: { select: { questions: { where: { isExample: false } } } } },
    });
    for (const s of subtests) {
      subtestsByKind[s.testKind].push({
        id: s.id,
        code: s.code,
        name: s.name,
        orderIndex: s.orderIndex,
        total: s._count.questions,
      });
    }
  }

  // Group answers per submission per subtest.
  type AnsAgg = { count: number; lastAt: Date };
  const perSubmission = new Map<string, Map<string, AnsAgg>>();
  const lastActivityBySubmission = new Map<string, Date>();

  if (submissionIds.length > 0) {
    const answers = await prisma.answer.findMany({
      where: { submissionId: { in: submissionIds } },
      select: {
        submissionId: true,
        answeredAt: true,
        question: { select: { subtestId: true, isExample: true } },
      },
    });
    for (const a of answers) {
      if (a.question.isExample) continue;
      const subId = a.submissionId;
      const stId = a.question.subtestId;
      let bySubtest = perSubmission.get(subId);
      if (!bySubtest) {
        bySubtest = new Map();
        perSubmission.set(subId, bySubtest);
      }
      const prev = bySubtest.get(stId);
      if (!prev) bySubtest.set(stId, { count: 1, lastAt: a.answeredAt });
      else {
        prev.count += 1;
        if (a.answeredAt > prev.lastAt) prev.lastAt = a.answeredAt;
      }
      const lastSub = lastActivityBySubmission.get(subId);
      if (!lastSub || a.answeredAt > lastSub) lastActivityBySubmission.set(subId, a.answeredAt);
    }
  }

  const withProgress = tokens.map((t) => {
    const meta = subtestsByKind[t.testKind];
    const submissions = t.submissions.map((s) => {
      const ans = perSubmission.get(s.id) ?? new Map<string, AnsAgg>();
      const perSubtest = meta.map((m) => {
        const a = ans.get(m.id);
        const answered = a?.count ?? 0;
        return {
          code: m.code,
          name: m.name,
          total: m.total,
          answered,
          done: m.total > 0 && answered >= m.total,
        };
      });
      const completed = perSubtest.filter((p) => p.done).length;
      const total = perSubtest.length;
      const current = perSubtest.find((p) => !p.done) ?? null;
      const lastActivity = lastActivityBySubmission.get(s.id) ?? null;
      return {
        ...s,
        startedAt: s.startedAt.toISOString(),
        finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
        progress: {
          completed,
          total,
          currentSubtest: s.finishedAt ? null : current?.name ?? null,
          lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
          perSubtest,
        },
      };
    });

    // Agregat per-token untuk kolom Peserta / Status di tabel daftar token.
    const participantCount = submissions.length;
    const selesaiCount = submissions.filter((s) => s.finishedAt).length;
    const mengerjakanCount = participantCount - selesaiCount;
    const flaggedCount = submissions.filter(
      (s) => s.flaggedCheating || s.violationCount >= 5,
    ).length;
    // Last activity = max(lastActivityAt subset, startedAt). Dipakai untuk
    // sort & tampilan "Update: x detik lalu" di UI admin.
    let tokenLastActivity: Date | null = null;
    for (const s of submissions) {
      const cand = s.progress.lastActivityAt
        ? new Date(s.progress.lastActivityAt)
        : new Date(s.startedAt);
      if (!tokenLastActivity || cand > tokenLastActivity) tokenLastActivity = cand;
    }

    return {
      id: t.id,
      code: t.code,
      testKind: t.testKind,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
      createdById: t.createdById,
      redeemedAt: t.redeemedAt,
      submissions,
      participantCount,
      selesaiCount,
      mengerjakanCount,
      flaggedCount,
      lastActivityAt: tokenLastActivity ? tokenLastActivity.toISOString() : null,
    };
  });

  // Tally counters across SEMUA submission (peserta), bukan token. Ini lebih
  // berguna di header dashboard sekarang karena 1 token bisa N peserta.
  const counts = {
    belumMulai: 0, // token aktif yang BELUM ada submission sama sekali
    mengerjakan: 0, // total peserta yang sedang mengerjakan
    selesai: 0, // total peserta yang sudah selesai
    expired: 0, // token kadaluarsa & tanpa submission
    totalToken: withProgress.length,
    totalPeserta: 0,
  };
  for (const t of withProgress) {
    counts.mengerjakan += t.mengerjakanCount;
    counts.selesai += t.selesaiCount;
    counts.totalPeserta += t.participantCount;
    if (t.participantCount === 0) {
      if (+new Date(t.expiresAt) < +now) counts.expired += 1;
      else counts.belumMulai += 1;
    }
  }

  return NextResponse.json({ tokens: withProgress, counts });
}
