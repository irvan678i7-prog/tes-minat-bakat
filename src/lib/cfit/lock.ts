import { prisma } from "@/lib/db";

// Lock per-subtes CFIT — cermin dari src/lib/subtestLock.ts milik
// minat-bakat, tapi memakai tabel CfitSubtestProgress. Timer
// server-authoritative: startedAt di DB adalah sumber kebenaran.

export type CfitLockReason = "MANUAL" | "TIME_UP" | "AUTO_FLAG";

export type CfitSubtestLockInfo = {
  started: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  finishReason: CfitLockReason | null;
  locked: boolean;
};

/**
 * Hitung lock info untuk satu subtes CFIT. Sekaligus auto-finish (write ke
 * DB) kalau timer sudah habis tapi belum dikunci eksplisit. Idempoten.
 */
export async function computeCfitSubtestLock(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<CfitSubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const progress = await prisma.cfitSubtestProgress.findUnique({
    where: { submissionId_subtestId: { submissionId, subtestId } },
  });
  if (!progress) {
    return { started: false, startedAt: null, finishedAt: null, finishReason: null, locked: false };
  }
  if (progress.finishedAt) {
    return {
      started: true,
      startedAt: progress.startedAt,
      finishedAt: progress.finishedAt,
      finishReason: (progress.finishReason as CfitLockReason | null) ?? null,
      locked: true,
    };
  }
  // Grace 3 detik sebelum auto-lock supaya jawaban terakhir yang sedang
  // di-flush klien saat timeUp masih sempat tersimpan.
  const TIME_UP_GRACE_MS = 3_000;
  const deadline = new Date(progress.startedAt.getTime() + durationSec * 1000);
  if (Date.now() >= deadline.getTime() + TIME_UP_GRACE_MS) {
    const updated = await prisma.cfitSubtestProgress.updateMany({
      where: { id: progress.id, finishedAt: null },
      data: { finishedAt: deadline, finishReason: "TIME_UP" },
    });
    if (updated.count > 0) {
      return { started: true, startedAt: progress.startedAt, finishedAt: deadline, finishReason: "TIME_UP", locked: true };
    }
    const refetched = await prisma.cfitSubtestProgress.findUnique({ where: { id: progress.id } });
    return {
      started: true,
      startedAt: refetched?.startedAt ?? progress.startedAt,
      finishedAt: refetched?.finishedAt ?? deadline,
      finishReason: (refetched?.finishReason as CfitLockReason | null) ?? "TIME_UP",
      locked: true,
    };
  }
  return { started: true, startedAt: progress.startedAt, finishedAt: null, finishReason: null, locked: false };
}

/** Tandai subtes dimulai (upsert). Tidak mengubah startedAt yang sudah ada. */
export async function ensureCfitSubtestStarted(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<CfitSubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const existing = await computeCfitSubtestLock({ submissionId, subtestId, durationSec });
  if (existing.started) return existing;

  await prisma.cfitSubtestProgress.upsert({
    where: { submissionId_subtestId: { submissionId, subtestId } },
    create: { submissionId, subtestId },
    update: {},
  });
  return computeCfitSubtestLock({ submissionId, subtestId, durationSec });
}

/**
 * Penilaian jawaban CFIT. `correct` di bank soal disimpan sebagai string
 * atau array string (Conditions bisa menuntut lebih dari satu jawaban).
 * Benar = himpunan jawaban peserta sama persis dengan himpunan kunci.
 */
export function isCfitAnswerCorrect(selected: unknown, correct: unknown): boolean {
  const norm = (v: unknown): string[] =>
    (Array.isArray(v) ? v : [v])
      .map((x) => String(x).trim().toLowerCase())
      .filter((x) => x.length > 0)
      .sort();
  const sel = norm(selected);
  const cor = norm(correct);
  if (sel.length === 0 || cor.length === 0) return false;
  return sel.length === cor.length && sel.every((v, i) => v === cor[i]);
}
