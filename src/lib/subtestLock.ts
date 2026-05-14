import { prisma } from "@/lib/db";

// Sumber kebenaran lock subtes — dipakai bersama oleh halaman /test, halaman
// /test/[code], dan API answer/finish/violation. Hindari duplikasi logika di
// banyak tempat.

export type LockReason = "MANUAL" | "TIME_UP" | "AUTO_FLAG";

export type SubtestLockInfo = {
  // Sudah dibuka siswa minimal sekali? Kalau belum, timer belum jalan.
  started: boolean;
  // Kapan timer mulai jalan (server-authoritative).
  startedAt: Date | null;
  // Kapan dikunci. null = belum dikunci.
  finishedAt: Date | null;
  finishReason: LockReason | null;
  // Kalau timer habis tapi siswa belum klik selesai, lock secara LAZY:
  // kembalikan true di sini & paksa finishedAt = startedAt+durationSec.
  locked: boolean;
};

/**
 * Hitung lock info untuk satu subtes. Sekaligus auto-finish (write ke DB)
 * kalau timer sudah habis tapi belum dikunci secara eksplisit. Idempoten.
 */
export async function computeSubtestLock(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<SubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const progress = await prisma.subtestProgress.findUnique({
    where: { submissionId_subtestId: { submissionId, subtestId } },
  });
  if (!progress) {
    return {
      started: false,
      startedAt: null,
      finishedAt: null,
      finishReason: null,
      locked: false,
    };
  }
  // Sudah dikunci eksplisit → langsung pakai value DB.
  if (progress.finishedAt) {
    return {
      started: true,
      startedAt: progress.startedAt,
      finishedAt: progress.finishedAt,
      finishReason: (progress.finishReason as LockReason | null) ?? null,
      locked: true,
    };
  }
  // Belum dikunci eksplisit — cek timer. Beri grace 3 detik sebelum
  // auto-lock supaya jawaban terakhir yang sedang di-flush oleh runner
  // (saat ia mendeteksi timeUp) sempat sampai ke /api/answer dulu.
  const TIME_UP_GRACE_MS = 3_000;
  const deadline = new Date(progress.startedAt.getTime() + durationSec * 1000);
  if (Date.now() >= deadline.getTime() + TIME_UP_GRACE_MS) {
    // Timer habis → auto-finish dengan reason TIME_UP. Pakai updateMany +
    // filter finishedAt:null supaya race tidak menimpa MANUAL lebih awal.
    const updated = await prisma.subtestProgress.updateMany({
      where: { id: progress.id, finishedAt: null },
      data: { finishedAt: deadline, finishReason: "TIME_UP" },
    });
    if (updated.count > 0) {
      return {
        started: true,
        startedAt: progress.startedAt,
        finishedAt: deadline,
        finishReason: "TIME_UP",
        locked: true,
      };
    }
    // Race: ada thread lain yang sudah set MANUAL. Refetch.
    const refetched = await prisma.subtestProgress.findUnique({
      where: { id: progress.id },
    });
    return {
      started: true,
      startedAt: refetched?.startedAt ?? progress.startedAt,
      finishedAt: refetched?.finishedAt ?? deadline,
      finishReason: (refetched?.finishReason as LockReason | null) ?? "TIME_UP",
      locked: true,
    };
  }
  // Timer masih jalan.
  return {
    started: true,
    startedAt: progress.startedAt,
    finishedAt: null,
    finishReason: null,
    locked: false,
  };
}

/**
 * Tandai subtes dimulai (upsert progress). Kalau sudah dikunci, jangan ubah
 * startedAt — kembalikan lock info apa adanya.
 */
export async function ensureSubtestStarted(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<SubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  // Cek dulu — kalau sudah ada & sudah dikunci, jangan upsert.
  const existing = await computeSubtestLock({ submissionId, subtestId, durationSec });
  if (existing.started) return existing;

  await prisma.subtestProgress.upsert({
    where: { submissionId_subtestId: { submissionId, subtestId } },
    create: { submissionId, subtestId },
    update: {},
  });
  return computeSubtestLock({ submissionId, subtestId, durationSec });
}
