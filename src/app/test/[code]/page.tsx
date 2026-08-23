import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shuffle } from "@/lib/random";
import SubtestRunner from "@/components/student/SubtestRunner";
import TimerHeartbeat from "@/components/student/TimerHeartbeat";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS } from "@/lib/test-config";
import { computeSubtestLock } from "@/lib/subtestLock";

export default async function SubtestPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await getStudentFromCookies();
  if (!me) redirect("/");

  // Submission + subtest reads are independent — fire them in parallel.
  // Questions use select to skip `correct`, `scoringTag`, `createdAt` for
  // real questions — these are never sent to the client and can be large
  // (150 soal SISTEMATISASI). `correct` IS needed for example questions, so
  // we fetch it for all and only send it for examples.
  const [sub, subtest] = await Promise.all([
    prisma.submission.findUnique({ where: { id: me.sub } }),
    prisma.subtest.findUnique({
      where: { code },
      include: {
        questions: {
          select: {
            id: true,
            questionNo: true,
            prompt: true,
            imageUrl: true,
            imageUrl2: true,
            parts: true,
            options: true,
            correct: true,
            inputMode: true,
            partLabels: true,
            isExample: true,
          },
        },
      },
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

  // Opening the subtest must NOT start the timer. We only READ the lock state
  // here (computeSubtestLock) so the runner can show the intro screen
  // (instructions + contoh soal) first. The server-side timer is started
  // explicitly when the student clicks "MULAI" (POST /subtest-start).
  // computeSubtestLock still auto-marks TIME_UP — tapi sekarang berdasarkan
  // WAKTU AKTIF (consumedSec), bukan jam dinding, jadi mati lampu tidak lagi
  // menghabiskan waktu subtes. Run it in parallel with the answer fetch.
  const [startInfo, existing] = await Promise.all([
    computeSubtestLock({
      submissionId: sub.id,
      subtestId: subtest.id,
      durationSec: subtest.durationSec,
    }),
    prisma.answer.findMany({
      where: { submissionId: sub.id, questionId: { in: realQuestions.map((q) => q.id) } },
      select: { questionId: true, selected: true },
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
    <>
      {/* Denyut timer (render null). Dipasang di luar SubtestRunner supaya
          komponen runner tidak perlu diubah sama sekali. Denyut inilah yang
          membuat server tahu bedanya "siswa mengerjakan" dan "sesi terputus
          karena mati lampu". */}
      <TimerHeartbeat subtestCode={subtest.code} />
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
        /* Acuan timer yang sudah DIGESER: now - waktu aktif terpakai. Runner
           menghitung sisa waktu dari nilai ini, jadi hitungan mundur otomatis
           melanjutkan sisa waktu setelah listrik mati. */
        serverStartedAt={
          startInfo.timerStartedAt ? startInfo.timerStartedAt.toISOString() : null
        }
      />
    </>
  );
}
