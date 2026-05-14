import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TestHub from "@/components/student/TestHub";
import { computeSubtestLock } from "@/lib/subtestLock";

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
    // Total soal harus mengecualikan soal contoh (isExample=true) supaya status
    // "DONE/REVIEW" muncul saat siswa menjawab semua soal real, bukan saat
    // jumlah jawaban menyentuh total termasuk contoh (yang tidak dijawab).
    include: {
      _count: { select: { questions: { where: { isExample: false } } } },
    },
  });

  // Hanya hitung jawaban untuk soal REAL (bukan contoh). Soal contoh tidak
  // pernah disimpan sebagai Answer, tapi defensif: filter eksplisit di sini.
  const answered = await prisma.answer.findMany({
    where: { submissionId: sub.id, question: { isExample: false } },
    select: { question: { select: { subtestId: true } } },
  });
  const counts: Record<string, number> = {};
  for (const a of answered) counts[a.question.subtestId] = (counts[a.question.subtestId] || 0) + 1;

  // Hitung lock per subtes (sekaligus auto-finish kalau timer sudah lewat).
  const lockBySubtest = new Map<
    string,
    { locked: boolean; finishReason: string | null }
  >();
  for (const s of subtests) {
    const lock = await computeSubtestLock({
      submissionId: sub.id,
      subtestId: s.id,
      durationSec: s.durationSec,
    });
    lockBySubtest.set(s.id, {
      locked: lock.locked,
      finishReason: lock.finishReason,
    });
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
