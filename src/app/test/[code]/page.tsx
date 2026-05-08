import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shuffle } from "@/lib/random";
import SubtestRunner from "@/components/student/SubtestRunner";

export default async function SubtestPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await getStudentFromCookies();
  if (!me) redirect("/");
  const sub = await prisma.submission.findUnique({ where: { id: me.sub } });
  if (!sub || sub.finishedAt) redirect("/test/done");
  if (!sub.fullName) redirect("/test/profile");

  const subtest = await prisma.subtest.findUnique({
    where: { code },
    include: { questions: true },
  });
  if (!subtest || subtest.testKind !== sub.testKind) redirect("/test");
  if (subtest.questions.length === 0) redirect("/test");

  const questions = shuffle(subtest.questions, `${sub.randomSeed}:${subtest.code}`).map((q) => ({
    id: q.id,
    questionNo: q.questionNo,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    parts: q.parts,
    options: q.options,
  }));

  const existing = await prisma.answer.findMany({
    where: { submissionId: sub.id, questionId: { in: subtest.questions.map((q) => q.id) } },
  });
  const existingMap: Record<string, unknown> = {};
  for (const a of existing) existingMap[a.questionId] = a.selected;

  return (
    <SubtestRunner
      subtest={{
        code: subtest.code,
        name: subtest.name,
        description: subtest.description,
        durationSec: subtest.durationSec,
      }}
      questions={questions}
      existingAnswers={existingMap}
    />
  );
}
