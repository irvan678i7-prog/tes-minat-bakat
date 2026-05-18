// Formulasi penjurusan IPA / IPS (SMA) berdasarkan dokumen
// "Formulasi penjurusan IPA dan IPS" yang merujuk pada
// pendekatan ABM (Aptitude–Bakat–Minat).
//
// Setiap subtes BAKAT dinormalisasi ke skala 0–100 (raw / max * 100),
// kemudian dipetakan ke 7 komponen formulasi (KUA, PEN, SPA, MEK,
// VER, BHS, KLE). Skor bakat IPA / IPS dihitung dengan rata-rata
// terbobot. Bila tersedia data Tes Minat (lewat cross-link dengan
// submission Tes Minat milik peserta yang sama), skor minat IPA / IPS
// dihitung dari distribusi pilihan bidang minat A–H dan menjadi
// faktor koreksi pada skor final.

export type KomponenKode =
  | "KUA" // Kuantitatif
  | "PEN" // Penalaran
  | "SPA" // Spasial
  | "MEK" // Mekanik
  | "VER" // Verbal
  | "BHS" // Bahasa
  | "KLE"; // Klerikal

export type PenjurusanComponents = Record<KomponenKode, number>;

export type PenjurusanMinat = {
  scoreIPA: number;
  scoreIPS: number;
  ipaDominant: boolean;
  ipsDominant: boolean;
};

export type PenjurusanRekomendasi =
  | "IPA"
  | "IPS"
  | "ZONA_FLEKSIBEL"
  | "WAWANCARA_BK"
  | "PERTIMBANGAN_IPA";

export type PenjurusanKategoriKode = "SR" | "R" | "C" | "K" | "TR";

export type PenjurusanKategori = {
  code: PenjurusanKategoriKode;
  label: string;
};

export type PenjurusanResult = {
  components: PenjurusanComponents;
  bakatIPA: number;
  bakatIPS: number;
  minat: PenjurusanMinat | null;
  finalIPA: number;
  finalIPS: number;
  selisih: number;
  rekomendasiKode: PenjurusanRekomendasi;
  rekomendasiLabel: string;
  catatan: string;
  kategoriIPA: PenjurusanKategori;
  kategoriIPS: PenjurusanKategori;
};

// Bobot per dokumen formulasi.
// IPA: Kuantitatif 30%, Penalaran 25%, Spasial 20%, Mekanik 15%, Verbal 10%.
// IPS: Verbal 30%, Penalaran 25%, Bahasa 20%, Klerikal 15%, Kuantitatif 10%.
export const BOBOT_IPA_PCT: Record<KomponenKode, number> = {
  KUA: 30, PEN: 25, SPA: 20, MEK: 15, VER: 10, BHS: 0, KLE: 0,
};
export const BOBOT_IPS_PCT: Record<KomponenKode, number> = {
  VER: 30, PEN: 25, BHS: 20, KLE: 15, KUA: 10, SPA: 0, MEK: 0,
};

// Pemetaan subtes Bakat → komponen formulasi.
// Catatan: untuk komponen yang dipetakan oleh ≥ 2 subtes (PEN dan KUA),
// nilainya adalah rata-rata dari subtes-subtes tersebut.
const SUBTEST_TO_KOMPONEN: Record<string, KomponenKode> = {
  BAKAT_1_VISUAL: "PEN",
  BAKAT_2_NUMERIK: "KUA",
  BAKAT_3_VERBAL: "VER",
  BAKAT_4_URUTAN: "PEN",
  BAKAT_5_SPASIAL: "SPA",
  BAKAT_6_3DIMENSI: "MEK",
  BAKAT_7_SISTEMATISASI: "KLE",
  BAKAT_8_KOSAKATA: "BHS",
  BAKAT_9_FIGURAL: "KUA",
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

export type PerSubtestNorm = Record<string, { raw: number; max: number }>;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

const KOMPONEN_KODE_ALL: KomponenKode[] = [
  "KUA", "PEN", "SPA", "MEK", "VER", "BHS", "KLE",
];

export function hitungKomponen(perSubtest: PerSubtestNorm): PenjurusanComponents {
  const sums: Record<KomponenKode, { total: number; count: number }> = {
    KUA: { total: 0, count: 0 }, PEN: { total: 0, count: 0 },
    SPA: { total: 0, count: 0 }, MEK: { total: 0, count: 0 },
    VER: { total: 0, count: 0 }, BHS: { total: 0, count: 0 },
    KLE: { total: 0, count: 0 },
  };
  for (const [code, sub] of Object.entries(perSubtest)) {
    const komp = SUBTEST_TO_KOMPONEN[code];
    if (!komp) continue;
    if (!sub.max || sub.max <= 0) continue;
    const norm = clamp((sub.raw / sub.max) * 100, 0, 100);
    sums[komp].total += norm;
    sums[komp].count += 1;
  }
  const out: PenjurusanComponents = {
    KUA: 0, PEN: 0, SPA: 0, MEK: 0, VER: 0, BHS: 0, KLE: 0,
  };
  for (const k of KOMPONEN_KODE_ALL) {
    out[k] = sums[k].count > 0 ? sums[k].total / sums[k].count : 0;
  }
  return out;
}

export function hitungBakatIPA(c: PenjurusanComponents): number {
  let s = 0;
  for (const k of KOMPONEN_KODE_ALL) s += (c[k] * BOBOT_IPA_PCT[k]) / 100;
  return s;
}

export function hitungBakatIPS(c: PenjurusanComponents): number {
  let s = 0;
  for (const k of KOMPONEN_KODE_ALL) s += (c[k] * BOBOT_IPS_PCT[k]) / 100;
  return s;
}

// Bobot bidang minat A–H untuk IPA / IPS.
// A Komunikasi → IPS. B Seni → netral.
// C Kesehatan & Pekerja Sosial → mendukung keduanya (sains alam +
// helping/social), bobot 0.5 di tiap sisi.
// D Pariwisata, E Administrasi & Niaga → IPS.
// F Teknologi & Konstruksi, G Agrobisnis, H Teknik & Maritim → IPA.
const BIDANG_BOBOT_IPA: Record<string, number> = { C: 0.5, F: 1, G: 1, H: 1 };
const BIDANG_BOBOT_IPS: Record<string, number> = { A: 1, C: 0.5, D: 1, E: 1 };

export function hitungMinatSkor(
  bidangScores: Record<string, number>,
): PenjurusanMinat {
  let total = 0;
  for (const v of Object.values(bidangScores)) total += v;
  if (total === 0) {
    return { scoreIPA: 0, scoreIPS: 0, ipaDominant: false, ipsDominant: false };
  }
  let ipaSum = 0;
  let ipsSum = 0;
  for (const [letter, count] of Object.entries(bidangScores)) {
    ipaSum += (BIDANG_BOBOT_IPA[letter] || 0) * count;
    ipsSum += (BIDANG_BOBOT_IPS[letter] || 0) * count;
  }
  const scoreIPA = clamp((ipaSum / total) * 100, 0, 100);
  const scoreIPS = clamp((ipsSum / total) * 100, 0, 100);
  return {
    scoreIPA,
    scoreIPS,
    ipaDominant: scoreIPA - scoreIPS >= 10,
    ipsDominant: scoreIPS - scoreIPA >= 10,
  };
}

const KATEGORI_TIER: { min: number; code: PenjurusanKategoriKode; label: string }[] = [
  { min: 85, code: "SR", label: "Sangat Direkomendasikan" },
  { min: 75, code: "R", label: "Direkomendasikan" },
  { min: 65, code: "C", label: "Cukup Sesuai" },
  { min: 55, code: "K", label: "Kurang Sesuai" },
  { min: 0,  code: "TR", label: "Tidak Direkomendasikan" },
];

export function kategoriPenjurusan(skor: number): PenjurusanKategori {
  for (const t of KATEGORI_TIER) {
    if (skor >= t.min) return { code: t.code, label: t.label };
  }
  return { code: "TR", label: "Tidak Direkomendasikan" };
}

// Bobot final: bakat 70%, minat 30% (bila data minat ada).
const W_BAKAT = 0.7;
const W_MINAT = 0.3;
// Selisih dianggap "tidak signifikan" bila ≤ ambang ini (zona fleksibel).
const SELISIH_AMBANG = 5;
// Kuantitatif dianggap "sangat tinggi" pada / di atas ambang ini.
const KUA_SANGAT_TINGGI = 80;

export function hitungPenjurusan(
  perSubtest: PerSubtestNorm,
  minatBidangScores: Record<string, number> | null,
): PenjurusanResult {
  const components = hitungKomponen(perSubtest);
  const bakatIPA = hitungBakatIPA(components);
  const bakatIPS = hitungBakatIPS(components);

  const minat = minatBidangScores && Object.keys(minatBidangScores).length > 0
    ? hitungMinatSkor(minatBidangScores)
    : null;

  const finalIPA = minat ? W_BAKAT * bakatIPA + W_MINAT * minat.scoreIPA : bakatIPA;
  const finalIPS = minat ? W_BAKAT * bakatIPS + W_MINAT * minat.scoreIPS : bakatIPS;
  const selisih = finalIPA - finalIPS;

  const kategoriIPA = kategoriPenjurusan(finalIPA);
  const kategoriIPS = kategoriPenjurusan(finalIPS);

  let rekomendasiKode: PenjurusanRekomendasi;
  let rekomendasiLabel: string;
  let catatan: string;

  if (selisih > SELISIH_AMBANG) {
    if (minat?.ipsDominant) {
      rekomendasiKode = "WAWANCARA_BK";
      rekomendasiLabel = "Wawancara BK";
      catatan =
        "Bakat IPA dominan, namun minat lebih mengarah ke IPS. " +
        "Disarankan konseling untuk menyelaraskan minat dan bakat.";
    } else {
      rekomendasiKode = "IPA";
      rekomendasiLabel = "IPA";
      catatan = "Skor IPA jelas di atas IPS. Direkomendasikan masuk jurusan IPA.";
    }
  } else if (-selisih > SELISIH_AMBANG) {
    if (components.KUA >= KUA_SANGAT_TINGGI) {
      rekomendasiKode = "PERTIMBANGAN_IPA";
      rekomendasiLabel = "Pertimbangan IPA";
      catatan =
        "Skor IPS dominan, tetapi kemampuan kuantitatif sangat tinggi " +
        "(≥ 80). Pertimbangkan IPA bila siswa juga berminat sains / teknologi.";
    } else {
      rekomendasiKode = "IPS";
      rekomendasiLabel = "IPS";
      catatan = "Skor IPS jelas di atas IPA. Direkomendasikan masuk jurusan IPS.";
    }
  } else {
    rekomendasiKode = "ZONA_FLEKSIBEL";
    rekomendasiLabel = "Zona Fleksibel / Konseling";
    catatan =
      "Selisih IPA dan IPS ≤ 5 poin. Disarankan konseling lebih lanjut " +
      "untuk menentukan jurusan yang paling sesuai.";
  }

  return {
    components,
    bakatIPA,
    bakatIPS,
    minat,
    finalIPA,
    finalIPS,
    selisih,
    rekomendasiKode,
    rekomendasiLabel,
    catatan,
    kategoriIPA,
    kategoriIPS,
  };
}
