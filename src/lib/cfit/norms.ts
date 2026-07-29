// ──────────────────────────────────────────────────────────────────
// Norma konversi Raw Score (RS) gabungan Bentuk A + B → IQ untuk CFIT Skala 3.
// Sumber: tabel "Konversi dan Klasifikasi IQ" (Konversi IQ + Klasifikasi IQ).
// Tabel memuat tiga kolom norma: usia 15, usia 16, dan usia 17 tahun ke atas.
// RS yang tercantum pada tabel: 20 – 99.
// ──────────────────────────────────────────────────────────────────

export type CfitNormGroup = "15" | "16" | "17+"

export const CFIT_NORM_GROUPS: CfitNormGroup[] = ["15", "16", "17+"]
export const CFIT_NORM_GROUP_17_PLUS: CfitNormGroup = "17+"

export const CFIT_NORM_GROUP_LABEL: Record<CfitNormGroup, string> = {
  "15": "Usia 15 tahun",
  "16": "Usia 16 tahun",
  "17+": "Usia 17 tahun ke atas",
}

/**
 * RS (A + B) → [IQ usia 15, IQ usia 16, IQ usia 17+].
 * `null` berarti nilai itu tidak tercantum pada tabel untuk kolom tersebut.
 */
const CFIT_NORM_TABLE: Record<number, [number | null, number, number]> = {
  20: [66, 65, 65],
  21: [67, 66, 66],
  22: [68, 67, 67],
  23: [70, 68, 68],
  24: [72, 70, 70],
  25: [73, 72, 72],
  26: [75, 73, 73],
  27: [77, 75, 75],
  28: [78, 77, 77],
  29: [80, 78, 78],
  30: [82, 80, 80],
  31: [83, 82, 82],
  32: [85, 83, 83],
  33: [86, 85, 85],
  34: [88, 86, 86],
  35: [90, 88, 88],
  36: [91, 90, 90],
  37: [93, 91, 91],
  38: [95, 93, 93],
  39: [96, 95, 95],
  40: [99, 96, 96],
  41: [99, 98, 98],
  42: [101, 99, 99],
  43: [103, 101, 101],
  44: [104, 103, 103],
  45: [106, 104, 104],
  46: [108, 106, 106],
  47: [110, 108, 108],
  48: [111, 110, 110],
  49: [113, 111, 111],
  50: [114, 113, 113],
  51: [116, 114, 114],
  52: [118, 116, 116],
  53: [119, 118, 118],
  54: [121, 119, 119],
  55: [123, 121, 121],
  56: [124, 123, 123],
  57: [126, 124, 124],
  58: [127, 126, 126],
  59: [129, 127, 127],
  60: [131, 129, 129],
  61: [133, 131, 131],
  62: [134, 133, 133],
  63: [136, 134, 134],
  64: [138, 136, 136],
  65: [139, 138, 138],
  66: [141, 139, 139],
  67: [143, 141, 141],
  68: [144, 143, 143],
  69: [146, 144, 144],
  70: [147, 146, 146],
  71: [149, 147, 147],
  72: [150, 149, 149],
  73: [152, 150, 150],
  74: [154, 152, 152],
  75: [155, 154, 154],
  76: [157, 155, 155],
  77: [159, 157, 157],
  78: [160, 159, 159],
  79: [162, 160, 160],
  80: [164, 162, 162],
  81: [165, 164, 164],
  82: [167, 165, 165],
  83: [169, 167, 167],
  84: [170, 169, 169],
  85: [171, 170, 170],
  86: [173, 171, 171],
  87: [175, 173, 173],
  88: [177, 175, 175],
  89: [178, 177, 177],
  90: [179, 178, 178],
  91: [181, 179, 179],
  93: [185, 183, 183],
  95: [188, 186, 186],
  97: [191, 189, 189],
  99: [null, 193, 193],
}

export const CFIT_MIN_RAW_SCORE = 20
export const CFIT_MAX_RAW_SCORE = 99

/** Peta RS → IQ kolom usia 17+ (dipakai sebagai fallback & unit test). */
export const CFIT_NORMS_17_PLUS: Record<number, number> = Object.fromEntries(
  Object.entries(CFIT_NORM_TABLE).map(([rs, row]) => [Number(rs), row[2]]),
) as Record<number, number>

/** Kolom norma yang dipakai berdasarkan usia peserta. */
export function cfitNormGroupForAge(age: number | null | undefined): CfitNormGroup {
  if (age === 15) return "15"
  if (age === 16) return "16"
  return "17+"
}

function columnIndex(group: CfitNormGroup): 0 | 1 | 2 {
  if (group === "15") return 0
  if (group === "16") return 1
  return 2
}

/** RS di bawah baris terendah tabel norma (20) tidak bisa dikonversi presisi. */
export function isBelowCfitNormRange(rawScore: number): boolean {
  return Math.round(rawScore) < CFIT_MIN_RAW_SCORE
}

/**
 * Konversi RS gabungan (A + B) → IQ memakai kolom norma sesuai usia.
 * - RS di luar rentang tabel di-clamp ke batas norma.
 * - RS yang tidak tercantum (mis. 92, 94) memakai baris terdekat di bawahnya,
 *   sesuai cara pembacaan tabel manual.
 */
export function cfitRawScoreToIq(
  rawScore: number,
  group: CfitNormGroup = CFIT_NORM_GROUP_17_PLUS,
): number {
  const col = columnIndex(group)
  const rs = Math.max(
    CFIT_MIN_RAW_SCORE,
    Math.min(CFIT_MAX_RAW_SCORE, Math.round(rawScore)),
  )
  for (let cur = rs; cur >= CFIT_MIN_RAW_SCORE; cur--) {
    const row = CFIT_NORM_TABLE[cur]
    if (!row) continue
    const iq = row[col]
    if (iq != null) return iq
  }
  const lowest = CFIT_NORM_TABLE[CFIT_MIN_RAW_SCORE]
  return lowest[col] ?? lowest[2]
}

export type CfitClassification = {
  /** Label Indonesia untuk laporan */
  label: string
  /** Label internasional (Cattell) */
  labelEn: string
}

/**
 * Klasifikasi IQ sesuai sheet "Klasifikasi IQ" pada tabel resmi.
 */
export function classifyCfitIq(iq: number): CfitClassification {
  if (iq >= 170) return { label: "Jenius", labelEn: "Genius" }
  if (iq >= 140) return { label: "Sangat Superior", labelEn: "Very Superior" }
  if (iq >= 120) return { label: "Superior", labelEn: "Superior" }
  if (iq >= 110) return { label: "Di Atas Rata-rata", labelEn: "High Average" }
  if (iq >= 90) return { label: "Rata-rata", labelEn: "Average" }
  if (iq >= 80) return { label: "Di Bawah Rata-rata", labelEn: "Low Average" }
  if (iq >= 70) return { label: "Borderline", labelEn: "Borderline" }
  if (iq >= 30) return { label: "Defektif Secara Mental", labelEn: "Mentally Defective" }
  return { label: "Tidak Terklasifikasi", labelEn: "Unclassified" }
}
