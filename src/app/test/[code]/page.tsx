import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shuffle } from "@/lib/random";
import SubtestRunner from "@/components/student/SubtestRunner";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS } from "@/lib/test-config";
import { ensureSubtestStarted, computeSubtestLock } from "@/lib/subtestLock";

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

  // Kalau subtes sudah dikunci (waktu habis atau siswa klik selesai
  // sebelumnya), langsung redirect balik ke daftar subtes. computeSubtestLock
  // juga akan auto-finish kalau timer sudah lewat tapi belum diset.
  const lockState = await computeSubtestLock({
    submissionId: sub.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });
  if (lockState.locked) {
    redirect("/test");
  }

  const seedCfg = [...BAKAT_SUBTESTS, ...MINAT_SUBTESTS].find(
    (x) => x.code === subtest.code,
  );
  const seedPartLabels = seedCfg?.partLabels ?? [];

  // Resolve label nomor di tiap sel "lembar jawaban" per soal. Kalau admin
  // sudah set Question.partLabels (lewat upload XLSX / bulk upload / edit),
  // pakai itu. Kalau belum, fallback ke label default dari test-config
  // (mis. ["1", "2", …, "5"] untuk SPASIAL).
  const resolvePartLabels = (q: { parts: number; partLabels: unknown }): string[] => {
    if (Array.isArray(q.partLabels) && q.partLabels.length > 0) {
      return q.partLabels.map((v) => (v == null ? "" : String(v)));
    }
    if (seedPartLabels.length > 0) return seedPartLabels;
    return Array.from({ length: q.parts }, (_, i) => String(i + 1));
  };

  const questions = shuffle(realQuestions, `${sub.randomSeed}:${subtest.code}`).map((q) => ({
    id: q.id,
    questionNo: q.questionNo,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    imageUrl2: q.imageUrl2,
    parts: q.parts,
    options: q.options,
    inputMode: (q.inputMode === "TEXT" ? "TEXT" : "CHOICE") as "CHOICE" | "TEXT",
    partLabels: resolvePartLabels(q),
  }));

  const examples = exampleQuestions.map((q) => ({
    id: q.id,
    questionNo: q.questionNo,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    imageUrl2: q.imageUrl2,
    parts: q.parts,
    options: q.options,
    correct: q.correct,
    inputMode: (q.inputMode === "TEXT" ? "TEXT" : "CHOICE") as "CHOICE" | "TEXT",
    partLabels: resolvePartLabels(q),
  }));

  const existing = await prisma.answer.findMany({
    where: { submissionId: sub.id, questionId: { in: realQuestions.map((q) => q.id) } },
  });
  const existingMap: Record<string, unknown> = {};
  for (const a of existing) existingMap[a.questionId] = a.selected;

  // Subtes dianggap selesai kalau semua soal real sudah punya jawaban. Saat
  // selesai, runner masuk mode read-only (tidak bisa diubah / ngulang).
  const isCompleted =
    realQuestions.length > 0 && existing.length >= realQuestions.length;

  // Pastikan timer subtes mulai (server-authoritative). Kalau sudah ada
  // entri sebelumnya, ensureSubtestStarted tidak mengubah startedAt-nya.
  const startInfo = await ensureSubtestStarted({
    submissionId: sub.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });

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
      isCompleted={isCompleted}
      serverStartedAt={startInfo.startedAt ? startInfo.startedAt.toISOString() : null}
    />
  );
}
