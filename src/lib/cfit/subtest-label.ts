// Penamaan subtes CFIT yang DITAMPILKAN ke peserta dan di laporan PDF.
// Nama teknis (Series, Classification, Matrices, Conditions) hanya dipakai di
// panel admin / kode subtes; peserta cukup melihat TES 1..TES 4, sedangkan
// tabel rincian pada laporan PDF memakai nama lengkap (Subtes 1: Series, dst.).

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

/**
 * Urutan kelompok untuk tabel & grafik laporan (A + B digabung).
 * - `label` : keterangan ringkas pada sumbu grafik (TES 1..TES 4)
 * - `name`  : nama lengkap pada tabel rincian laporan PDF
 */
export const CFIT_TEST_GROUPS: Array<{
  kind: string
  label: string
  name: string
}> = [
  { kind: "SERIES", label: "TES 1", name: "Subtes 1: Series" },
  { kind: "CLASSIFICATION", label: "TES 2", name: "Subtes 2: Classification" },
  { kind: "MATRICES", label: "TES 3", name: "Subtes 3: Matrices" },
  { kind: "CONDITIONS", label: "TES 4", name: "Subtes 4: Conditions (Topology)" },
]
