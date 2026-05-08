import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TestHub from "@/components/student/TestHub";

export default async function TestHome() {
  const me = await getStudentFromCookies();
  if (!me) redirect("/");
  const sub = await prisma.submission.findUnique({ where: { id: me.sub } });
  if (!sub) redirect("/");
  if (!sub.fullName) redirect("/test/profile");
  if (sub.finishedAt) redirect("/test/done");

  const subtests = await prisma.subtest.findMany({
    where: { testKind: sub.testKind },
    orderBy: { orderIndex: "asc" },
    include: { _count: { select: { questions: true } } },
  });

  const answered = await prisma.answer.findMany({
    where: { submissionId: sub.id },
    select: { question: { select: { subtestId: true } } },
  });
  const counts: Record<string, number> = {};
  for (const a of answered) counts[a.question.subtestId] = (counts[a.question.subtestId] || 0) + 1;

  return (
    <TestHub
      testKind={sub.testKind}
      studentName={sub.fullName}
      subtests={subtests.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
        durationSec: s.durationSec,
        total: s._count.questions,
        answered: counts[s.id] || 0,
      }))}
    />
  );
}
