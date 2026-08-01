// ─────────────────────────────────────────────────────────────────────────
// Konfigurasi tes IQ CFIT Skala 3 (bentuk A & B).
// TERPISAH dari src/lib/test-config.ts milik tes minat-bakat.
// ─────────────────────────────────────────────────────────────────────────

export type CfitFormCode = "FORM_3A" | "FORM_3B" | "FORM_3AB"

export type CfitSubtestConfig = {
  /** Kode unik subtes, sama dengan kolom `code` di tabel CfitSubtest */
  code: string
  form: Exclude<CfitFormCode, "FORM_3AB">
  name: string
  description: string
  /** Jumlah soal (tanpa contoh) */
  questionCount: number
  /** Durasi pengerjaan dalam detik */
  durationSec: number
  orderIndex: number
}

const SUBTEST_TEMPLATE = [
  {
    key: "SERIES",
    name: "Subtes 1 — Series",
    description: "Melanjutkan pola rangkaian gambar yang berurutan.",
    questionCount: 13,
    durationSec: 180, // 3 menit
  },
  {
    key: "CLASSIFICATION",
    name: "Subtes 2 — Classification",
    description: "Memilih gambar yang berbeda / tidak sekelompok.",
    questionCount: 14,
    durationSec: 240, // 4 menit
  },
  {
    key: "MATRICES",
    name: "Subtes 3 — Matrices",
    description: "Melengkapi pola matriks gambar yang kosong.",
    questionCount: 13,
    durationSec: 180, // 3 menit
  },
  {
    key: "CONDITIONS",
    name: "Subtes 4 — Conditions (Topology)",
    description: "Memilih gambar yang memenuhi kondisi yang sama dengan contoh.",
    questionCount: 10,
    durationSec: 150, // 2,5 menit
  },
] as const

function buildSubtests(form: "FORM_3A" | "FORM_3B", offset: number): CfitSubtestConfig[] {
  const prefix = form === "FORM_3A" ? "3A" : "3B"
  return SUBTEST_TEMPLATE.map((t, i) => ({
    code: `${prefix}_${t.key}`,
    form,
    name: t.name,
    description: t.description,
    questionCount: t.questionCount,
    durationSec: t.durationSec,
    orderIndex: offset + i + 1,
  }))
}

export const CFIT_3A_SUBTESTS: CfitSubtestConfig[] = buildSubtests("FORM_3A", 0)
export const CFIT_3B_SUBTESTS: CfitSubtestConfig[] = buildSubtests("FORM_3B", 4)

export const CFIT_ALL_SUBTESTS: CfitSubtestConfig[] = [
  ...CFIT_3A_SUBTESTS,
  ...CFIT_3B_SUBTESTS,
]

/** Subtes yang harus dikerjakan untuk suatu bentuk tes. */
export function subtestsForForm(form: CfitFormCode): CfitSubtestConfig[] {
  if (form === "FORM_3A") return CFIT_3A_SUBTESTS
  if (form === "FORM_3B") return CFIT_3B_SUBTESTS
  return CFIT_ALL_SUBTESTS
}

/** Total soal per bentuk (3A = 50, 3B = 50, 3AB = 100). */
export function totalQuestionsForForm(form: CfitFormCode): number {
  return subtestsForForm(form).reduce((sum, s) => sum + s.questionCount, 0)
}
