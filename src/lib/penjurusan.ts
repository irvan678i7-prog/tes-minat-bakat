// Formulasi penjurusan IPA / IPS (SMA), pendekatan ABM (Aptitude-Bakat-Minat).
//
// ── PERUBAHAN AUDIT (skala) ────────────────────────────────────────────
// SEBELUMNYA: tiap subtes dinormalisasi jadi PERSEN BENAR (raw/max*100),
// lalu dibandingkan ambang kategori 85/75/65/55. Pada tes bakat, persen
// benar 85% praktis mustahil, sehingga hampir SEMUA peserta jatuh di
// "Kurang Sesuai"/"Tidak Direkomendasikan" untuk IPA DAN IPS sekaligus —
// rekomendasi jadi tidak informatif.
//
// SEKARANG: tiap subtes dikonversi ke PERCENTILE (1-99) memakai
// `standardScoresFromRaw` dari scoring-pro.ts, yaitu sumber norma yang sama
// dengan laporan EKIU. Ambang 85/75/65/55 jadi bermakna ("lebih tinggi dari
// 85% peserta rujukan") dan skalanya tetap 0-100 sehingga komponen tampilan
// tidak perlu diubah — hanya labelnya (lihat field `skala`).
//
// Persen benar tetap disediakan di `componentsPersenBenar` untuk referensi.

import { standardScoresFromRaw } from "./scoring-pro";
import {
  KOMPONEN_KODE_ALL,
  KOMPONEN_LABEL,
  SUBTEST_TO_KOMPONEN,
  type KomponenKode,
} from "./subtest-map";

export { KOMPONEN_LABEL, KOMPONEN_KODE_ALL, SUBTEST_TO_KOMPONEN };
export type { KomponenKode };

export type PenjurusanComponents = Record<KomponenKode, number>;

export type PenjurusanMinat = {
  /** Skala 0-100, proporsi pilihan bidang yang mendukung IPA. */
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
  /** Penanda skala agar konsumen (PDF/UI) memberi label yang benar. */
  skala: "percentile";
  /** Komponen dalam percentile 1-99 — dipakai untuk semua keputusan. */
  components: PenjurusanComponents;
  /** Persen benar mentah — hanya untuk referensi/diagnostik. */
  componentsPersenBenar: PenjurusanComponents;
  /** Berapa subtes yang menyumbang tiap komponen (0 = tidak ada data). */
  componentsCoverage: Record<KomponenKode, number>;
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
  /** false bila ada komponen berbobot tanpa data subtes sama sekali. */
  dataLengkap: boolean;
  peringatan: string[];
};

// Bobot per dokumen formulasi (jumlah tiap sisi = 100).
export const BOBOT_IPA_PCT: Record<KomponenKode, number> = {
  KUA: 30,
  PEN: 25,
  SPA: 20,
  MEK: 15,
  VER: 10,
  BHS: 0,
  KLE: 0,
};

export const BOBOT_IPS_PCT: Record<KomponenKode, number> = {
  VER: 30,
  PEN: 25,
  BHS: 20,
  KLE: 15,
  KUA: 10,
  SPA: 0,
  MEK: 0,
};

export type PerSubtestNorm = Record<string, { raw: number; max: number }>;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function emptyComponents(): PenjurusanComponents {
  return { KUA: 0, PEN: 0, SPA: 0, MEK: 0, VER: 0, BHS: 0, KLE: 0 };
}

/**
 * Komponen dalam PERCENTILE (1-99). Untuk komponen yang dipetakan oleh >= 2
 * subtes, nilainya rata-rata percentile subtes tersebut.
 */
export function hitungKomponen(perSubtest: PerSubtestNorm): {
  components: PenjurusanComponents;
  coverage: Record<KomponenKode, number>;
} {
  const sums = emptyComponents();
  const coverage = emptyComponents() as Record<KomponenKode, number>;

  for (const [code, sub] of Object.entries(perSubtest)) {
    const komp = SUBTEST_TO_KOMPONEN[code];
    if (!komp) continue;
    if (!sub.max || sub.max <= 0) continue;
    const { percentile } = standardScoresFromRaw(code, sub.raw, sub.max);
    sums[komp] += percentile;
    coverage[komp] += 1;
  }

  const components = emptyComponents();
  for (const k of KOMPONEN_KODE_ALL) {
    components[k] = coverage[k] > 0 ? sums[k] / coverage[k] : 0;
  }
  return { components, coverage };
}

/** Persen benar mentah — hanya untuk pelaporan diagnostik, bukan keputusan. */
export function hitungKomponenPersenBenar(
  perSubtest: PerSubtestNorm,
): PenjurusanComponents {
  const sums = emptyComponents();
  const counts = emptyComponents();
  for (const [code, sub] of Object.entries(perSubtest)) {
    const komp = SUBTEST_TO_KOMPONEN[code];
    if (!komp || !sub.max || sub.max <= 0) continue;
    sums[komp] += clamp((sub.raw / sub.max) * 100, 0, 100);
    counts[komp] += 1;
  }
  const out = emptyComponents();
  for (const k of KOMPONEN_KODE_ALL) {
    out[k] = counts[k] > 0 ? sums[k] / counts[k] : 0;
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

// Bobot bidang minat A-H untuk IPA / IPS.
// A Komunikasi → IPS. B Seni → netral. C Kesehatan & Pekerja Sosial →
// mendukung keduanya (0.5 tiap sisi). D, E → IPS. F, G, H → IPA.
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

// Ambang kategori pada skala PERCENTILE — "SR" berarti masuk 15% teratas.
const KATEGORI_TIER: {
  min: number;
  code: PenjurusanKategoriKode;
  label: string;
}[] = [
  { min: 85, code: "SR", label: "Sangat Direkomendasikan" },
  { min: 75, code: "R", label: "Direkomendasikan" },
  { min: 60, code: "C", label: "Cukup Sesuai" },
  { min: 40, code: "K", label: "Kurang Sesuai" },
  { min: 0, code: "TR", label: "Tidak Direkomendasikan" },
];

export function kategoriPenjurusan(skor: number): PenjurusanKategori {
  for (const t of KATEGORI_TIER) {
    if (skor >= t.min) return { code: t.code, label: t.label };
  }
  return { code: "TR", label: "Tidak Direkomendasikan" };
}

const W_BAKAT = 0.7;
const W_MINAT = 0.3;
// Pada skala percentile sebaran jauh lebih lebar daripada persen benar,
// sehingga ambang 5 poin lama terlalu ketat dan hampir semua peserta masuk
// Zona Fleksibel. 8 poin percentile kira-kira setara 0.3 SD pada indeks
// gabungan.
const SELISIH_AMBANG = 8;
// Kuantitatif "sangat tinggi" = percentile >= 80 (20% teratas).
const KUA_SANGAT_TINGGI = 80;

export function hitungPenjurusan(
  perSubtest: PerSubtestNorm,
  minatBidangScores: Record<string, number> | null,
): PenjurusanResult {
  const { components, coverage } = hitungKomponen(perSubtest);
  const componentsPersenBenar = hitungKomponenPersenBenar(perSubtest);

  const peringatan: string[] = [];
  for (const k of KOMPONEN_KODE_ALL) {
    const berbobot = BOBOT_IPA_PCT[k] > 0 || BOBOT_IPS_PCT[k] > 0;
    if (berbobot && coverage[k] === 0) {
      peringatan.push(
        `Komponen ${KOMPONEN_LABEL[k]} tidak punya data subtes — dihitung 0 dan menurunkan skor.`,
      );
    }
  }
  const dataLengkap = peringatan.length === 0;

  const bakatIPA = hitungBakatIPA(components);
  const bakatIPS = hitungBakatIPS(components);

  const minat =
    minatBidangScores && Object.keys(minatBidangScores).length > 0
      ? hitungMinatSkor(minatBidangScores)
      : null;

  const finalIPA = minat
    ? W_BAKAT * bakatIPA + W_MINAT * minat.scoreIPA
    : bakatIPA;
  const finalIPS = minat
    ? W_BAKAT * bakatIPS + W_MINAT * minat.scoreIPS
    : bakatIPS;
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
      catatan =
        "Skor IPA jelas di atas IPS. Direkomendasikan masuk jurusan IPA.";
    }
  } else if (-selisih > SELISIH_AMBANG) {
    if (components.KUA >= KUA_SANGAT_TINGGI) {
      rekomendasiKode = "PERTIMBANGAN_IPA";
      rekomendasiLabel = "Pertimbangan IPA";
      catatan =
        "Skor IPS dominan, tetapi kemampuan kuantitatif sangat tinggi " +
        "(percentile >= 80). Pertimbangkan IPA bila siswa juga berminat " +
        "sains / teknologi.";
    } else {
      rekomendasiKode = "IPS";
      rekomendasiLabel = "IPS";
      catatan =
        "Skor IPS jelas di atas IPA. Direkomendasikan masuk jurusan IPS.";
    }
  } else {
    rekomendasiKode = "ZONA_FLEKSIBEL";
    rekomendasiLabel = "Zona Fleksibel / Konseling";
    catatan =
      `Selisih IPA dan IPS <= ${SELISIH_AMBANG} poin. Disarankan konseling ` +
      "lebih lanjut untuk menentukan jurusan yang paling sesuai.";
  }

  if (!dataLengkap) {
    catatan += " CATATAN: data subtes tidak lengkap, hasil perlu diverifikasi.";
  }

  return {
    skala: "percentile",
    components,
    componentsPersenBenar,
    componentsCoverage: coverage,
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
    dataLengkap,
    peringatan,
  };
}
