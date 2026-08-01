// ──────────────────────────────────────────────────────────────────
// Skoring CFIT Skala 3: hitung Raw Score (RS) per bentuk, konversi ke IQ
// lewat norma, dan tentukan klasifikasi. TERPISAH dari scoring minat-bakat.
// ──────────────────────────────────────────────────────────────────

import {
  cfitNormGroupForAge,
  cfitRawScoreToIq,
  classifyCfitIq,
  isBelowCfitNormRange,
  type CfitNormGroup,
} from "./norms"
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
  /** Kolom norma yang dipakai (dipilih otomatis dari usia peserta). */
  normGroup: CfitNormGroup
  /** True bila RS total di bawah baris terendah tabel norma (20). */
  belowNorm: boolean
  perSubtest: CfitSubtestScore[]
}

/**
 * Hitung hasil akhir CFIT dari rincian skor per subtes.
 *
 * Catatan norma: tabel konversi resmi memetakan RS GABUNGAN (A + B) 20–99 ke
 * IQ, dengan kolom terpisah untuk usia 15, 16, dan 17 tahun ke atas. Kolom
 * dipilih otomatis dari usia peserta; usia lain (termasuk yang tidak diisi)
 * memakai kolom 17 tahun ke atas.
 */
export function computeCfitResult(
  form: CfitFormCode,
  perSubtest: CfitSubtestScore[],
  opts?: { age?: number | null },
): CfitComputedResult {
  const sumFor = (prefix: "3A" | "3B") =>
    perSubtest
      .filter((s) => s.subtestCode.startsWith(prefix))
      .reduce((sum, s) => sum + s.correct, 0)

  const rawScoreA = form !== "FORM_3B" ? sumFor("3A") : null
  const rawScoreB = form !== "FORM_3A" ? sumFor("3B") : null
  const rawScoreTotal = (rawScoreA ?? 0) + (rawScoreB ?? 0)

  const normGroup = cfitNormGroupForAge(opts?.age ?? null)
  const iq = cfitRawScoreToIq(rawScoreTotal, normGroup)
  const cls = classifyCfitIq(iq)

  return {
    form,
    rawScoreA,
    rawScoreB,
    rawScoreTotal,
    iq,
    classification: cls.label,
    classificationEn: cls.labelEn,
    normGroup,
    belowNorm: isBelowCfitNormRange(rawScoreTotal),
    perSubtest,
  }
}
