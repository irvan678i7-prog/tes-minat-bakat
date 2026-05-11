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
    take: 200,
    include: {
      submission: {
        select: {
          id: true,
          fullName: true,
          grade: true,
          school: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });

  // Compute progress per submission: which subtests are complete / in-progress.
  const submissionIds = tokens
    .map((t) => t.submission?.id)
    .filter((x): x is string => !!x);

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
    let progress: {
      completed: number;
      total: number;
      currentSubtest: string | null;
      lastActivityAt: string | null;
      perSubtest: { code: string; name: string; total: number; answered: number; done: boolean }[];
    } | null = null;
    if (t.submission) {
      const meta = subtestsByKind[t.testKind];
      const ans = perSubmission.get(t.submission.id) ?? new Map<string, AnsAgg>();
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
      // Current subtest = first not-done subtest by order (admin-friendly proxy).
      const current = perSubtest.find((p) => !p.done) ?? null;
      const lastActivity = lastActivityBySubmission.get(t.submission.id) ?? null;
      progress = {
        completed,
        total,
        currentSubtest: t.submission.finishedAt ? null : current?.name ?? null,
        lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
        perSubtest,
      };
    }
    return {
      ...t,
      submission: t.submission
        ? {
            ...t.submission,
            startedAt: t.submission.startedAt.toISOString(),
            finishedAt: t.submission.finishedAt ? t.submission.finishedAt.toISOString() : null,
            progress,
          }
        : null,
    };
  });

  // Tally counters: belum mulai (token aktif, belum redeem), mengerjakan, selesai.
  const now = Date.now();
  const counts = {
    belumMulai: 0,
    mengerjakan: 0,
    selesai: 0,
    expired: 0,
    total: withProgress.length,
  };
  for (const t of withProgress) {
    if (t.submission?.finishedAt) counts.selesai += 1;
    else if (t.submission) counts.mengerjakan += 1;
    else if (+new Date(t.expiresAt) < now) counts.expired += 1;
    else counts.belumMulai += 1;
  }

  return NextResponse.json({ tokens: withProgress, counts });
}
