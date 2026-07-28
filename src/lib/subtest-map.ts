// ───────────────────────────────────────────────────────────────────────────
// SUMBER KEBENARAN TUNGGAL (single source of truth) pemetaan subtes BAKAT.
//
// Sebelumnya satu subtes bisa punya interpretasi berbeda di file berbeda:
// mis. BAKAT_9_FIGURAL dipetakan ke komponen "KUA" di penjurusan.ts, tetapi
// masuk komposit PSI (Kecepatan Klerikal) sekaligus kategori IQ Kuantitatif
// di scoring-pro.ts. Sekarang SEMUA pemetaan didefinisikan di file ini dan
// di-import oleh `penjurusan.ts` dan `scoring-pro.ts`.
//
// Ada TIGA sumbu pemetaan yang memang boleh berbeda isinya:
//   1. `komponen`   — 7 komponen formulasi penjurusan IPA/IPS (pendekatan ABM).
//   2. `iqCategory` — 4 kategori akumulasi IQ prediktif (P / V / K / S).
//   3. `composites` — indeks komposit CHC-like (GRI / VSI / PSI / VCI). Satu
//      subtes boleh masuk lebih dari satu komposit (mis. BAKAT_3_VERBAL
//      masuk GRI dan VCI).
//
// CATATAN BAKAT_9_FIGURAL — pada sumbu KEMAMPUAN, subtes figural dipakai
// sebagai indikator penalaran kuantitatif-abstrak (komponen "KUA", kategori
// IQ "K"); pada sumbu KECEPATAN, subtes ini menyumbang ke komposit PSI.
// Keduanya tidak saling bertentangan karena beda sumbu. Bila tim BK ingin
// memindahkannya ke Penalaran, cukup ubah SATU baris di tabel ini dan kedua
// file konsumen otomatis ikut berubah.
// ───────────────────────────────────────────────────────────────────────────

export type KomponenKode =
  | "KUA" // Kuantitatif
  | "PEN" // Penalaran
  | "SPA" // Spasial
  | "MEK" // Mekanik
  | "VER" // Verbal
  | "BHS" // Bahasa
  | "KLE"; // Klerikal

export type IqCategoryCode = "P" | "V" | "K" | "S";

export type CompositeCode = "GRI" | "VSI" | "PSI" | "VCI";

export type SubtestMapEntry = {
  /** Komponen formulasi penjurusan IPA / IPS. */
  komponen: KomponenKode;
  /** Kategori akumulasi IQ prediktif. `null` = tidak masuk formula IQ. */
  iqCategory: IqCategoryCode | null;
  /** Indeks komposit yang memuat subtes ini (boleh lebih dari satu). */
  composites: CompositeCode[];
};

/** Urutan kanonik subtes BAKAT (dipakai untuk menjaga urutan anggota grup). */
export const BAKAT_SUBTEST_ORDER: string[] = [
  "BAKAT_1_VISUAL",
  "BAKAT_2_NUMERIK",
  "BAKAT_3_VERBAL",
  "BAKAT_4_URUTAN",
  "BAKAT_5_SPASIAL",
  "BAKAT_6_3DIMENSI",
  "BAKAT_7_SISTEMATISASI",
  "BAKAT_8_KOSAKATA",
  "BAKAT_9_FIGURAL",
];

export const SUBTEST_MAP: Record<string, SubtestMapEntry> = {
  BAKAT_1_VISUAL: { komponen: "PEN", iqCategory: "P", composites: ["GRI"] },
  BAKAT_2_NUMERIK: { komponen: "KUA", iqCategory: "K", composites: ["GRI"] },
  BAKAT_3_VERBAL: { komponen: "VER", iqCategory: "V", composites: ["GRI", "VCI"] },
  BAKAT_4_URUTAN: { komponen: "PEN", iqCategory: "P", composites: ["GRI"] },
  BAKAT_5_SPASIAL: { komponen: "SPA", iqCategory: "S", composites: ["VSI"] },
  BAKAT_6_3DIMENSI: { komponen: "MEK", iqCategory: "S", composites: ["VSI"] },
  // Sistematisasi = klerikal murni: tidak ikut formula IQ, hanya komposit PSI.
  BAKAT_7_SISTEMATISASI: { komponen: "KLE", iqCategory: null, composites: ["PSI"] },
  BAKAT_8_KOSAKATA: { komponen: "BHS", iqCategory: "V", composites: ["VCI"] },
  BAKAT_9_FIGURAL: { komponen: "KUA", iqCategory: "K", composites: ["PSI"] },
};

export const KOMPONEN_LABEL: Record<KomponenKode, string> = {
  KUA: "Kuantitatif",
  PEN: "Penalaran",
  SPA: "Spasial",
  MEK: "Mekanik",
  VER: "Verbal",
  BHS: "Bahasa",
  KLE: "Klerikal",
};

export const KOMPONEN_KODE_ALL: KomponenKode[] = [
  "KUA",
  "PEN",
  "SPA",
  "MEK",
  "VER",
  "BHS",
  "KLE",
];

/** subtestCode → komponen penjurusan (turunan dari SUBTEST_MAP). */
export const SUBTEST_TO_KOMPONEN: Record<string, KomponenKode> =
  Object.fromEntries(
    Object.entries(SUBTEST_MAP).map(([code, m]) => [code, m.komponen]),
  ) as Record<string, KomponenKode>;

function orderedCodes(): string[] {
  const known = BAKAT_SUBTEST_ORDER.filter((c) => SUBTEST_MAP[c]);
  const extra = Object.keys(SUBTEST_MAP).filter((c) => !known.includes(c));
  return [...known, ...extra];
}

/** compositeCode → daftar subtestCode anggotanya (turunan dari SUBTEST_MAP). */
export const COMPOSITE_MEMBERS: Record<CompositeCode, string[]> = (() => {
  const out: Record<CompositeCode, string[]> = { GRI: [], VSI: [], PSI: [], VCI: [] };
  for (const code of orderedCodes()) {
    for (const c of SUBTEST_MAP[code].composites) out[c].push(code);
  }
  return out;
})();

/** iqCategoryCode → daftar subtestCode anggotanya (turunan dari SUBTEST_MAP). */
export const IQ_CATEGORY_MEMBERS: Record<IqCategoryCode, string[]> = (() => {
  const out: Record<IqCategoryCode, string[]> = { P: [], V: [], K: [], S: [] };
  for (const code of orderedCodes()) {
    const cat = SUBTEST_MAP[code].iqCategory;
    if (cat) out[cat].push(code);
  }
  return out;
})();
