import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shuffle } from "@/lib/random";
import SubtestRunner from "@/components/student/SubtestRunner";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS } from "@/lib/test-config";

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

  const realQuestions = subtest.questions.filter((q) => !q.isExample);
  const exampleQuestions = subtest.questions
    .filter((q) => q.isExample)
    .sort((a, b) => a.questionNo - b.questionNo);
  if (realQuestions.length === 0) redirect("/test");

  const seedCfg = [...BAKAT_SUBTESTS, ...MINAT_SUBTESTS].find(
    (x) => x.code === subtest.code,
  );
  const partLabels = seedCfg?.partLabels ?? [];

  const questions = shuffle(realQuestions, `${sub.randomSeed}:${subtest.code}`).map((q) => ({
    id: q.id,
    questionNo: q.questionNo,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    parts: q.parts,
    options: q.options,
    inputMode: (q.inputMode === "TEXT" ? "TEXT" : "CHOICE") as "CHOICE" | "TEXT",
    partLabels,
  }));

  const examples = exampleQuestions.map((q) => ({
    id: q.id,
    questionNo: q.questionNo,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    parts: q.parts,
    options: q.options,
    correct: q.correct,
    inputMode: (q.inputMode === "TEXT" ? "TEXT" : "CHOICE") as "CHOICE" | "TEXT",
    partLabels,
  }));

  const existing = await prisma.answer.findMany({
    where: { submissionId: sub.id, questionId: { in: realQuestions.map((q) => q.id) } },
  });
  const existingMap: Record<string, unknown> = {};
  for (const a of existing) existingMap[a.questionId] = a.selected;

  return (
    <SubtestRunner
      subtest={{
        code: subtest.code,
        name: subtest.name,
        description: subtest.description,
        instructions: subtest.instructions,
        durationSec: subtest.durationSec,
      }}
      questions={questions}
      examples={examples}
      existingAnswers={existingMap}
    />
  );
}
