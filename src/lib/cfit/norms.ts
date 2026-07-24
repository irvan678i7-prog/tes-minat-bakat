// ─────────────────────────────────────────────────────────────────────────
// Norma konversi Raw Score (RS) → IQ untuk CFIT Skala 3 (3A & 3B),
// kelompok usia 17 tahun ke atas.
// Sumber: tabel "NORMA TES INTELEGENSI CFIT 3A DAN CFIT 3B".
// Data yang sama juga di-seed ke tabel `CfitNorm` (prisma/sql/0006).
// Konstanta ini dipakai sebagai fallback & untuk unit test.
// ─────────────────────────────────────────────────────────────────────────

export const CFIT_NORM_GROUP_17_PLUS = "17+"

/** Peta RS → IQ (usia 17+). RS 0..49. */
export const CFIT_NORMS_17_PLUS: Record<number, number> = {
  0: 38, 1: 40, 2: 43, 3: 45, 4: 47,
  5: 48, 6: 52, 7: 55, 8: 57, 9: 60,
  10: 63, 11: 67, 12: 70, 13: 72, 14: 75,
  15: 78, 16: 81, 17: 85, 18: 88, 19: 91,
  20: 94, 21: 96, 22: 100, 23: 103, 24: 106,
  25: 109, 26: 113, 27: 116, 28: 119, 29: 121,
  30: 124, 31: 128, 32: 131, 33: 133, 34: 137,
  35: 140, 36: 142, 37: 145, 38: 149, 39: 152,
  40: 155, 41: 157, 42: 161, 43: 165, 44: 167,
  45: 169, 46: 173, 47: 176, 48: 179, 49: 183,
}

export const CFIT_MIN_RAW_SCORE = 0
export const CFIT_MAX_RAW_SCORE = 49

/**
 * Konversi RS → IQ (norma 17+). RS di luar rentang di-clamp ke batas norma.
 */
export function cfitRawScoreToIq(rawScore: number): number {
  const rs = Math.max(
    CFIT_MIN_RAW_SCORE,
    Math.min(CFIT_MAX_RAW_SCORE, Math.round(rawScore)),
  )
  return CFIT_NORMS_17_PLUS[rs]
}

export type CfitClassification = {
  /** Label Indonesia untuk laporan */
  label: string
  /** Label internasional (Cattell) */
  labelEn: string
}

/**
 * Klasifikasi IQ yang umum dipakai untuk pelaporan CFIT.
 */
export function classifyCfitIq(iq: number): CfitClassification {
  if (iq >= 170) return { label: "Jenius", labelEn: "Genius" }
  if (iq >= 140) return { label: "Sangat Superior", labelEn: "Very Superior" }
  if (iq >= 120) return { label: "Superior", labelEn: "Superior" }
  if (iq >= 110) return { label: "Di Atas Rata-rata", labelEn: "High Average" }
  if (iq >= 90) return { label: "Rata-rata", labelEn: "Average" }
  if (iq >= 80) return { label: "Di Bawah Rata-rata", labelEn: "Low Average" }
  if (iq >= 70) return { label: "Borderline", labelEn: "Borderline" }
  return { label: "Terhambat", labelEn: "Intellectually Deficient" }
}
