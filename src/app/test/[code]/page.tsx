import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shuffle } from "@/lib/random";
import SubtestRunner from "@/components/student/SubtestRunner";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS } from "@/lib/test-config";
import { ensureSubtestStarted } from "@/lib/subtestLock";

export default async function SubtestPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await getStudentFromCookies();
  if (!me) redirect("/");

  // Submission + subtest reads are independent — fire them in parallel.
  const [sub, subtest] = await Promise.all([
    prisma.submission.findUnique({ where: { id: me.sub } }),
    prisma.subtest.findUnique({
      where: { code },
      include: { questions: true },
    }),
  ]);
  if (!sub || sub.finishedAt) redirect("/test/done");
  if (!sub.fullName) redirect("/test/profile");
  if (!subtest || subtest.testKind !== sub.testKind) redirect("/test");

  const realQuestions = subtest.questions.filter((q) => !q.isExample);
  const exampleQuestions = subtest.questions
    .filter((q) => q.isExample)
    .sort((a, b) => a.questionNo - b.questionNo);
  if (realQuestions.length === 0) redirect("/test");

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

  // ensureSubtestStarted ALSO does the lock check (auto-TIME_UP kalau deadline
  // lewat). Sebelumnya dipanggil terpisah dari computeSubtestLock — sekarang
  // satu panggilan saja, dan dijalankan paralel dengan pengambilan jawaban
  // yang sudah ada. Menghemat 1–2 round-trip ke DB saat siswa klik MULAI.
  const [startInfo, existing] = await Promise.all([
    ensureSubtestStarted({
      submissionId: sub.id,
      subtestId: subtest.id,
      durationSec: subtest.durationSec,
    }),
    prisma.answer.findMany({
      where: { submissionId: sub.id, questionId: { in: realQuestions.map((q) => q.id) } },
    }),
  ]);
  if (startInfo.locked) redirect("/test");

  const existingMap: Record<string, unknown> = {};
  for (const a of existing) existingMap[a.questionId] = a.selected;

  // Subtes dianggap selesai kalau semua soal real sudah punya jawaban. Saat
  // selesai, runner masuk mode read-only (tidak bisa diubah / ngulang).
  const isCompleted =
    realQuestions.length > 0 && existing.length >= realQuestions.length;

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
