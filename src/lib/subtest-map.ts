// ═══════════════════════════════════════════════════════════════════════════
// SUMBER KEBENARAN TUNGGAL: pemetaan subtes BAKAT → konstruk.
//
// Sebelumnya pemetaan tersebar di dua file dan tidak sinkron:
//   - penjurusan.ts  → SUBTEST_TO_KOMPONEN (7 komponen formulasi ABM)
//   - scoring-pro.ts → COMPOSITE_GROUPS + IQ_CATEGORY_GROUPS
// Akibatnya satu subtes bisa punya interpretasi berbeda antara laporan
// penjurusan dan laporan EKIU, tanpa ada tempat untuk mengeceknya.
//
// CATATAN PEMETAAN — WAJIB DIBACA SEBELUM MENGUBAH:
//
// 1. BAKAT_6_3DIMENSI → komponen MEK (Mekanik) di formulasi penjurusan,
//    tapi kategori S (Spasial) di formulasi EKIU. Ini DISENGAJA: instrumen
//    ini tidak punya subtes mekanik khusus, sehingga visualisasi balok 3D
//    dipakai sebagai PROKSI penalaran mekanik pada formulasi IPA/IPS.
//    Secara konstruk ia tetap subtes spasial.
//
// 2. BAKAT_9_FIGURAL ("Figural Angka" — aritmatika cepat) sengaja dimuat
//    ganda: kategori K (Kuantitatif) karena isinya berhitung, dan komposit
//    PSI (Kecepatan Klerikal) karena sifatnya speeded.
//
// 3. BAKAT_3_VERBAL dimuat ganda di GRI dan VCI — lazim pada model komposit
//    ala Wechsler.
//
// 4. BAKAT_7_SISTEMATISASI TIDAK masuk formula EKIU (klerikal murni); hanya
//    dilaporkan lewat komposit PSI dan komponen KLE.
// ═══════════════════════════════════════════════════════════════════════════

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

export type SubtestMapping = {
  code: string;
  name: string;
  komponen: KomponenKode;
  /** null = sengaja tidak masuk formula EKIU. */
  iqCategory: IqCategoryCode | null;
  composites: CompositeCode[];
  catatan?: string;
};

export const SUBTEST_MAP: SubtestMapping[] = [
  {
    code: "BAKAT_1_VISUAL",
    name: "Penalaran Visual",
    komponen: "PEN",
    iqCategory: "P",
    composites: ["GRI"],
  },
  {
    code: "BAKAT_2_NUMERIK",
    name: "Penalaran Numerik",
    komponen: "KUA",
    iqCategory: "K",
    composites: ["GRI"],
  },
  {
    code: "BAKAT_3_VERBAL",
    name: "Analisa Verbal",
    komponen: "VER",
    iqCategory: "V",
    composites: ["GRI", "VCI"],
  },
  {
    code: "BAKAT_4_URUTAN",
    name: "Penalaran Urutan",
    komponen: "PEN",
    iqCategory: "P",
    composites: ["GRI"],
  },
  {
    code: "BAKAT_5_SPASIAL",
    name: "Pengenalan Spasial",
    komponen: "SPA",
    iqCategory: "S",
    composites: ["VSI"],
  },
  {
    code: "BAKAT_6_3DIMENSI",
    name: "Tiga Dimensi",
    komponen: "MEK",
    iqCategory: "S",
    composites: ["VSI"],
    catatan:
      "MEK dipakai sebagai proksi penalaran mekanik; konstruk aslinya spasial.",
  },
  {
    code: "BAKAT_7_SISTEMATISASI",
    name: "Sistematisasi",
    komponen: "KLE",
    iqCategory: null,
    composites: ["PSI"],
  },
  {
    code: "BAKAT_8_KOSAKATA",
    name: "Kosa Kata",
    komponen: "BHS",
    iqCategory: "V",
    composites: ["VCI"],
  },
  {
    code: "BAKAT_9_FIGURAL",
    name: "Figural Angka",
    komponen: "KUA",
    iqCategory: "K",
    composites: ["PSI"],
    catatan:
      "Aritmatika cepat: kuantitatif secara isi, speeded secara format.",
  },
];

export const KOMPONEN_KODE_ALL: KomponenKode[] = [
  "KUA",
  "PEN",
  "SPA",
  "MEK",
  "VER",
  "BHS",
  "KLE",
];

export const KOMPONEN_LABEL: Record<KomponenKode, string> = {
  KUA: "Kuantitatif",
  PEN: "Penalaran",
  SPA: "Spasial",
  MEK: "Mekanik",
  VER: "Verbal",
  BHS: "Bahasa",
  KLE: "Klerikal",
};

export const SUBTEST_TO_KOMPONEN: Record<string, KomponenKode> =
  Object.fromEntries(SUBTEST_MAP.map((s) => [s.code, s.komponen]));

export const IQ_CATEGORY_MEMBERS: Record<IqCategoryCode, string[]> = {
  P: SUBTEST_MAP.filter((s) => s.iqCategory === "P").map((s) => s.code),
  V: SUBTEST_MAP.filter((s) => s.iqCategory === "V").map((s) => s.code),
  K: SUBTEST_MAP.filter((s) => s.iqCategory === "K").map((s) => s.code),
  S: SUBTEST_MAP.filter((s) => s.iqCategory === "S").map((s) => s.code),
};

export const COMPOSITE_MEMBERS: Record<CompositeCode, string[]> = {
  GRI: SUBTEST_MAP.filter((s) => s.composites.includes("GRI")).map((s) => s.code),
  VSI: SUBTEST_MAP.filter((s) => s.composites.includes("VSI")).map((s) => s.code),
  PSI: SUBTEST_MAP.filter((s) => s.composites.includes("PSI")).map((s) => s.code),
  VCI: SUBTEST_MAP.filter((s) => s.composites.includes("VCI")).map((s) => s.code),
};

/** Sanity check — dipanggil dari unit test agar drift ketahuan lebih awal. */
export function validateSubtestMap(): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const s of SUBTEST_MAP) {
    if (seen.has(s.code)) errs.push(`Duplikat kode subtes: ${s.code}`);
    seen.add(s.code);
    if (s.composites.length === 0) {
      errs.push(`${s.code} tidak masuk komposit mana pun.`);
    }
  }
  const totalIq = (["P", "V", "K", "S"] as IqCategoryCode[]).reduce(
    (n, c) => n + IQ_CATEGORY_MEMBERS[c].length,
    0,
  );
  if (totalIq === 0) errs.push("Tidak ada subtes yang masuk formula EKIU.");
  return errs;
}
