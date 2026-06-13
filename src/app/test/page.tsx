import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TestHub from "@/components/student/TestHub";

const TIME_UP_GRACE_MS = 3_000;

type ProgressRow = { subtestId: string; startedAt: Date; finishedAt: Date | null; finishReason: string | null };
type SubtestRow = { id: string; durationSec: number };

function computeLocks(
  subtests: SubtestRow[],
  progressRecords: ProgressRow[],
) {
  const progressBySubtest = new Map(progressRecords.map((p) => [p.subtestId, p]));
  const lockBySubtest = new Map<string, { locked: boolean; finishReason: string | null }>();
  const expiredSubtestIds: string[] = [];
  let firstDeadline: Date | null = null;
  const now = Date.now();
  for (const s of subtests) {
    const p = progressBySubtest.get(s.id);
    if (!p) {
      lockBySubtest.set(s.id, { locked: false, finishReason: null });
      continue;
    }
    if (p.finishedAt) {
      lockBySubtest.set(s.id, { locked: true, finishReason: p.finishReason });
      continue;
    }
    const deadline = new Date(p.startedAt.getTime() + s.durationSec * 1000);
    if (now >= deadline.getTime() + TIME_UP_GRACE_MS) {
      lockBySubtest.set(s.id, { locked: true, finishReason: "TIME_UP" });
      expiredSubtestIds.push(s.id);
      if (!firstDeadline) firstDeadline = deadline;
    } else {
      lockBySubtest.set(s.id, { locked: false, finishReason: null });
    }
  }
  return { lockBySubtest, expiredSubtestIds, firstDeadline };
}

export default async function TestHome() {
  const me = await getStudentFromCookies();
  if (!me) redirect("/");
  const sub = await prisma.submission.findUnique({ where: { id: me.sub } });
  if (!sub) redirect("/");
  if (!sub.fullName) redirect("/test/profile");
  if (sub.finishedAt) redirect("/test/done");

  // Fetch subtests, answer counts, AND all progress records in 1 parallel
  // batch (3 queries) instead of 2 + 9 individual computeSubtestLock calls
  // (12 queries total). Saves ~8 DB round-trips per page load.
  const [subtests, answered, progressRecords] = await Promise.all([
    prisma.subtest.findMany({
      where: { testKind: sub.testKind },
      orderBy: { orderIndex: "asc" },
      include: {
        _count: { select: { questions: { where: { isExample: false } } } },
      },
    }),
    prisma.answer.findMany({
      where: { submissionId: sub.id, question: { isExample: false } },
      select: { question: { select: { subtestId: true } } },
    }),
    prisma.subtestProgress.findMany({
      where: { submissionId: sub.id },
      select: { subtestId: true, startedAt: true, finishedAt: true, finishReason: true },
    }),
  ]);
  const counts: Record<string, number> = {};
  for (const a of answered) counts[a.question.subtestId] = (counts[a.question.subtestId] || 0) + 1;

  // Compute lock status in-memory from batch-fetched progress records.
  const { lockBySubtest, expiredSubtestIds, firstDeadline } = computeLocks(subtests, progressRecords);

  // Batch auto-finish expired subtests in one updateMany (fire-and-forget).
  if (expiredSubtestIds.length > 0 && firstDeadline) {
    prisma.subtestProgress.updateMany({
      where: {
        submissionId: sub.id,
        subtestId: { in: expiredSubtestIds },
        finishedAt: null,
      },
      data: { finishReason: "TIME_UP", finishedAt: firstDeadline },
    }).catch(() => {});
  }

  return (
    <TestHub
      testKind={sub.testKind}
      studentName={sub.fullName}
      subtests={subtests.map((s) => {
        const lock = lockBySubtest.get(s.id);
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          description: s.description,
          durationSec: s.durationSec,
          total: s._count.questions,
          answered: counts[s.id] || 0,
          locked: lock?.locked ?? false,
          finishReason: lock?.finishReason ?? null,
        };
      })}
    />
  );
}
