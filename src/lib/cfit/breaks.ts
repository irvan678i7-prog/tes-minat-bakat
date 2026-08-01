// ───────────────────────────────────────────────────────────
// Jeda otomatis antar subtes CFIT.
//
// Setelah satu subtes terkunci (waktu habis atau ditutup manual), peserta
// TIDAK langsung masuk subtes berikutnya: ada jeda otomatis.
// - Antar subtes dalam bentuk yang sama : 2 menit
// - Pergantian bentuk (3A → 3B)        : 3 menit
//
// Jeda dihitung dari `finishedAt` subtes SEBELUMNYA yang tersimpan di
// CfitSubtestProgress, jadi server tetap jadi sumber kebenaran dan sisa jeda
// tidak bisa dipercepat dengan refresh halaman.
// ───────────────────────────────────────────────────────────

/** Jeda antar subtes dalam satu bentuk (detik). */
export const CFIT_BREAK_SUBTEST_SEC = 120;

/** Jeda saat berganti bentuk tes, mis. 3A selesai → lanjut 3B (detik). */
export const CFIT_BREAK_FORM_SEC = 180;

/** Pilih durasi jeda berdasarkan bentuk subtes sebelum & sesudahnya. */
export function cfitBreakSecBetween(prevForm: string, nextForm: string): number {
  return prevForm !== nextForm ? CFIT_BREAK_FORM_SEC : CFIT_BREAK_SUBTEST_SEC;
}

/**
 * Sisa jeda dalam detik, dihitung dari waktu subtes sebelumnya terkunci.
 * Mengembalikan 0 bila jeda sudah lewat atau subtes sebelumnya belum selesai.
 */
export function cfitBreakRemainingSec(
  prevFinishedAt: Date | null | undefined,
  breakSec: number,
  now: number = Date.now(),
): number {
  if (!prevFinishedAt) return 0;
  const finished = new Date(prevFinishedAt).getTime();
  if (Number.isNaN(finished)) return 0;
  const elapsedSec = (now - finished) / 1000;
  return Math.max(0, Math.ceil(breakSec - elapsedSec));
}
