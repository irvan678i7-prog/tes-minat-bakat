// ─────────────────────────────────────────────────────────────────────────
// Skoring CFIT Skala 3: hitung Raw Score (RS) per bentuk, konversi ke IQ
// lewat norma, dan tentukan klasifikasi. TERPISAH dari scoring minat-bakat.
// ─────────────────────────────────────────────────────────────────────────

import { cfitRawScoreToIq, classifyCfitIq } from "./norms"
import type { CfitFormCode } from "./config"

export type CfitSubtestScore = {
  subtestCode: string
  correct: number
  answered: number
  total: number
}

export type CfitComputedResult = {
  form: CfitFormCode
  rawScoreA: number | null
  rawScoreB: number | null
  rawScoreTotal: number
  iq: number
  classification: string
  classificationEn: string
  perSubtest: CfitSubtestScore[]
}

/**
 * Hitung hasil akhir CFIT dari rincian skor per subtes.
 *
 * Catatan norma: tabel norma 17+ yang dipakai saat ini memetakan RS 0–49.
 * - FORM_3A / FORM_3B: RS = jumlah benar pada bentuk itu.
 * - FORM_3AB: RS = jumlah benar gabungan A + B, lalu dikonversi dengan tabel
 *   yang sama (sesuai praktik norma yang digunakan pengguna). Jika nanti ada
 *   tabel norma khusus gabungan, tambahkan normGroup baru di CfitNorm.
 */
export function computeCfitResult(
  form: CfitFormCode,
  perSubtest: CfitSubtestScore[],
): CfitComputedResult {
  const sumFor = (prefix: "3A" | "3B") =>
    perSubtest
      .filter((s) => s.subtestCode.startsWith(prefix))
      .reduce((sum, s) => sum + s.correct, 0)

  const rawScoreA = form !== "FORM_3B" ? sumFor("3A") : null
  const rawScoreB = form !== "FORM_3A" ? sumFor("3B") : null
  const rawScoreTotal = (rawScoreA ?? 0) + (rawScoreB ?? 0)

  const iq = cfitRawScoreToIq(rawScoreTotal)
  const cls = classifyCfitIq(iq)

  return {
    form,
    rawScoreA,
    rawScoreB,
    rawScoreTotal,
    iq,
    classification: cls.label,
    classificationEn: cls.labelEn,
    perSubtest,
  }
}
