// Penamaan subtes CFIT yang DITAMPILKAN ke peserta dan di laporan PDF.
// Nama teknis (Series, Classification, Matrices, Conditions) hanya dipakai di
// panel admin / kode subtes; peserta dan laporan cukup melihat TES 1..TES 4.

/** Urutan baku subtes CFIT Skala 3 (sama untuk Bentuk A maupun B). */
export const CFIT_SUBTEST_ORDER: Record<string, number> = {
  SERIES: 1,
  CLASSIFICATION: 2,
  MATRICES: 3,
  CONDITIONS: 4,
}

/** Ambil jenis subtes dari kode, mis. "3A_SERIES" → "SERIES". */
export function cfitSubtestKind(code: string): string {
  return code.split("_").slice(1).join("_")
}

/** Nomor tes 1..4 dari kode subtes; null bila kode tidak dikenal. */
export function cfitSubtestNumber(code: string): number | null {
  return CFIT_SUBTEST_ORDER[cfitSubtestKind(code)] ?? null
}

/** Label untuk peserta & laporan: "TES 1" … "TES 4". */
export function cfitSubtestLabel(code: string, fallback?: string | null): string {
  const n = cfitSubtestNumber(code)
  return n ? `TES ${n}` : (fallback ?? code)
}

/** Urutan kelompok untuk tabel & grafik laporan (A + B digabung). */
export const CFIT_TEST_GROUPS: Array<{ kind: string; label: string }> = [
  { kind: "SERIES", label: "TES 1" },
  { kind: "CLASSIFICATION", label: "TES 2" },
  { kind: "MATRICES", label: "TES 3" },
  { kind: "CONDITIONS", label: "TES 4" },
]
