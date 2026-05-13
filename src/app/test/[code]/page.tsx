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
  const fallbackPartLabels = seedCfg?.partLabels ?? [];

  // SPASIAL & SISTEMATIS: tiap soal punya N parts dan label posisinya harus
  // "nyambung" antar gambar (gambar 1 = posisi 1-5, gambar 2 = 6-10, dst).
  // Kita hitung startNo per soal berdasarkan urutan questionNo (bukan urutan
  // setelah shuffle) lalu pasang ke partLabels masing-masing soal.
  const isCumulativeNumbered =
    subtest.code === "BAKAT_5_SPASIAL" || subtest.code === "BAKAT_7_SISTEMATISASI";
  const startNoById = new Map<string, number>();
  if (isCumulativeNumbered) {
    const sortedReal = [...realQuestions].sort((a, b) => a.questionNo - b.questionNo);
    let acc = 1;
    for (const q of sortedReal) {
      startNoById.set(q.id, acc);
      acc += q.parts;
    }
  }
  const labelsFor = (q: { id: string; parts: number }): string[] => {
    if (isCumulativeNumbered) {
      const start = startNoById.get(q.id) ?? 1;
      return Array.from({ length: q.parts }, (_, i) => String(start + i));
    }
    return fallbackPartLabels;
  };

  const questions = shuffle(realQuestions, `${sub.randomSeed}:${subtest.code}`).map((q) => ({
    id: q.id,
    questionNo: q.questionNo,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    parts: q.parts,
    options: q.options,
    inputMode: (q.inputMode === "TEXT" ? "TEXT" : "CHOICE") as "CHOICE" | "TEXT",
    partLabels: labelsFor(q),
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
    // Contoh soal: pakai partLabels statis dari config (1..N) supaya tidak
    // mengacaukan nomor global soal beneran.
    partLabels: fallbackPartLabels,
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
    />
  );
}
