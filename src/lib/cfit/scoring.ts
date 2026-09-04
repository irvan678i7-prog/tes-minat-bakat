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
  /**
   * True bila tes hanya memakai SATU bentuk (3A saja atau 3B saja).
   *
   * Tabel norma CFIT Skala 3 di `norms.ts` disusun untuk RS GABUNGAN A + B
   * (rentang 20–99 dari 100 soal). Kalau hanya satu bentuk yang dikerjakan,
   * RS maksimum cuma 50, sehingga IQ hasil konversi UNDERESTIMATE (mis. RS
   * sempurna 50 hanya menghasilkan IQ 114). Nilai tetap dihitung supaya data
   * lama tidak berubah, tapi ditandai agar laporan/rekap bisa memberi catatan
   * dan hasilnya tidak ditafsirkan seperti hasil bentuk lengkap.
   *
   * Token CFIT yang dibuat admin selalu FORM_3AB, jadi kondisi ini hanya
   * muncul pada data lama atau token yang dibuat manual.
   */
  singleForm: boolean
  /**
   * Kode subtes yang TIDAK TERSENTUH: soalnya tersedia (`total > 0`), tapi
   * tidak satu pun jawaban peserta tersimpan (`answered === 0`).
   */
  untouchedSubtests: string[]
  /**
   * True bila administrasi tes TIDAK LENGKAP: ada subtes yang sama sekali
   * tidak dikerjakan (mis. sesi terputus karena mati lampu, browser tertutup,
   * atau peserta berhenti di tengah jalan).
   *
   * Penting: subtes yang terlewat ikut dihitung 0 benar, sehingga RS total
   * mengecil dan IQ hasil konversi UNDERESTIMATE — padahal tabel norma hanya
   * sah untuk administrasi PENUH. Nilai tetap dihitung supaya penyelesaian tes
   * tidak gagal dan data lama tidak berubah, tapi ditandai agar laporan bisa
   * memberi peringatan dan hasilnya tidak dipakai mengambil keputusan.
   */
  incomplete: boolean
  perSubtest: CfitSubtestScore[]
}

/**
 * Hitung hasil akhir CFIT dari rincian skor per subtes.
 *
 * Catatan norma: tabel konversi resmi memetakan RS GABUNGAN (A + B) 20–99 ke
 * IQ, dengan kolom terpisah untuk usia 15, 16, dan 17 tahun ke atas. Kolom
 * dipilih otomatis dari usia peserta; usia lain (termasuk yang tidak diisi)
 * memakai kolom 17 tahun ke atas.
 *
 * Catatan kelengkapan: tabel norma hanya sah bila SELURUH subtes dikerjakan.
 * Fungsi ini tidak menolak data yang tidak lengkap (supaya alur penyelesaian
 * tes tidak pernah gagal), tetapi menandainya lewat `incomplete` dan
 * `untouchedSubtests`.
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

  // ── Deteksi administrasi tidak lengkap ──
  // Subtes yang soalnya ada tapi nol jawaban tersimpan dianggap TIDAK
  // DIKERJAKAN. Pemanggil (api/cfit/test/finish) selalu menyusun `perSubtest`
  // dari seluruh subtes milik bentuk yang dipakai, sehingga subtes yang
  // terlewat tetap muncul sebagai baris dengan answered = 0.
  const scorableSubtests = perSubtest.filter((s) => s.total > 0)
  const untouchedSubtests = scorableSubtests
    .filter((s) => s.answered === 0)
    .map((s) => s.subtestCode)

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
    singleForm: form !== "FORM_3AB",
    untouchedSubtests,
    // Tidak ada satu pun subtes berskor juga dihitung tidak lengkap: itu berarti
    // rincian subtes gagal disusun, bukan peserta yang menjawab nol.
    incomplete: untouchedSubtests.length > 0 || scorableSubtests.length === 0,
    perSubtest,
  }
}
