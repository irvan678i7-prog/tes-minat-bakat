import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TestHub from "@/components/student/TestHub";
import { projectSubtestTime, TIME_UP_GRACE_SEC } from "@/lib/subtestLock";
import { ensureResumeCode } from "@/lib/resume";

type ProgressRow = {
  subtestId: string;
  startedAt: Date;
  finishedAt: Date | null;
  finishReason: string | null;
  consumedSec: number;
  lastSeenAt: Date | null;
  pausedSec: number;
  pauseCount: number;
};
type SubtestRow = { id: string; durationSec: number };

// TIMER SADAR-JEDA: subtes dikunci berdasarkan WAKTU AKTIF (consumedSec),
// bukan jam dinding (startedAt + durationSec). Jadi kalau listrik mati di
// tengah subtes, waktunya tidak ikut habis — selisihnya dihitung sebagai
// jeda, maksimal 10 menit per subtes (lihat src/lib/subtestLock.ts).
function computeLocks(
  subtests: SubtestRow[],
  progressRecords: ProgressRow[],
  now: Date,
) {
  const progressBySubtest = new Map(progressRecords.map((p) => [p.subtestId, p]));
  const lockBySubtest = new Map<string, { locked: boolean; finishReason: string | null }>();
  // Tiap subtes yang habis waktunya disimpan bersama angka waktu aktifnya
  // sendiri, supaya penulisan finishedAt/consumedSec tidak tertukar antar
  // subtes.
  const expired: {
    subtestId: string;
    consumedSec: number;
    pausedSec: number;
    pauseCount: number;
  }[] = [];
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
    const projected = projectSubtestTime(p, s.durationSec, now);
    if (projected.consumedSec >= s.durationSec + TIME_UP_GRACE_SEC) {
      lockBySubtest.set(s.id, { locked: true, finishReason: "TIME_UP" });
      expired.push({
        subtestId: s.id,
        consumedSec: Math.min(projected.consumedSec, s.durationSec),
        pausedSec: projected.pausedSec,
        pauseCount: projected.pauseCount,
      });
    } else {
      lockBySubtest.set(s.id, { locked: false, finishReason: null });
    }
  }
  return { lockBySubtest, expired };
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
      select: {
        subtestId: true,
        startedAt: true,
        finishedAt: true,
        finishReason: true,
        consumedSec: true,
        lastSeenAt: true,
        pausedSec: true,
        pauseCount: true,
      },
    }),
  ]);
  const counts: Record<string, number> = {};
  for (const a of answered) counts[a.question.subtestId] = (counts[a.question.subtestId] || 0) + 1;

  // Compute lock status in-memory from batch-fetched progress records.
  const now = new Date();
  const { lockBySubtest, expired } = computeLocks(subtests, progressRecords, now);

  // Auto-finish subtes yang waktu aktifnya sudah habis (fire-and-forget).
  // Satu update per subtes supaya angka waktu aktif & jeda tidak tertukar.
  if (expired.length > 0) {
    Promise.all(
      expired.map(({ subtestId, consumedSec, pausedSec, pauseCount }) =>
        prisma.subtestProgress.updateMany({
          where: {
            submissionId: sub.id,
            subtestId,
            finishedAt: null,
          },
          data: {
            finishReason: "TIME_UP",
            finishedAt: now,
            consumedSec,
            pausedSec,
            pauseCount,
            lastSeenAt: now,
          },
        }),
      ),
    ).catch(() => {});
  }

  // "Kode Lanjut" — penyelamat kalau cookie sesi hilang (komputer lab mereset
  // profil browser, ganti komputer, incognito). Dibuat sekali lalu dipakai
  // terus. Kalau kolomnya belum ada di DB, helper mengembalikan null dan
  // banner-nya sekadar tidak tampil.
  const resumeCode = sub.resumeCode ?? (await ensureResumeCode(sub.id));

  return (
    <>
      {resumeCode ? (
        <div className="border-b-4 border-black bg-yellow-300 text-black">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-widest">
                Kode Lanjut — catat / foto sekarang
              </div>
              <div className="text-2xl font-black tracking-[0.25em]">{resumeCode}</div>
            </div>
            <p className="max-w-xl text-[11px] font-bold leading-snug sm:text-xs">
              Kalau listrik mati atau komputer mereset browser, buka halaman{" "}
              <span className="underline">/lanjut</span>, lalu masukkan kode token
              kelas + Kode Lanjut ini + nama lengkapmu. Jawaban dan sisa waktu
              yang sudah tersimpan akan kembali — tes tidak dimulai dari nol.
              Jangan berikan kode ini kepada peserta lain.
            </p>
          </div>
        </div>
      ) : null}
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
    </>
  );
}
