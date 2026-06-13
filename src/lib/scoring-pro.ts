// Skoring profesional ala tes IQ ternama (Wechsler-style). Output:
// - z-score, T-score, percentile, stanine per subtes
// - Composite Index (GRI, VSI, PSI, VCI) — mirip indeks Wechsler
// - 4 kategori akumulasi IQ Prediktif: Penalaran, Verbal, Kuantitatif, Spasial
// - FSIQ (Estimasi Kemampuan Intelektual Umum / EKIU)
//   Rumus: IQ_z = (0.30 × Penalaran) + (0.25 × Verbal)
//                + (0.25 × Kuantitatif) + (0.20 × Spasial)
//   IQ = clamp(round(100 + 15 × IQ_z), 50, 160), CI 95% ±5
// - Pita kategori Wechsler standar (Very Superior … Extremely Low)
// - Narrative interpretation otomatis (paragraph) berdasarkan profil siswa
//
// CATATAN NORMA: angka percentile/IQ di sini bersifat "skor profil" — bukan
// IQ klinis. Norma diturunkan dari cut-off `CATEGORY_RANGES` di test-config.ts
// menggunakan equipercentile mapping. Untuk validitas klinis, butuh data
// standardisasi pada populasi rujukan; itu di luar lingkup tes skrining ini.

import { CATEGORY_RANGES } from "./test-config";

// ── Statistik dasar ───────────────────────────────────────────────────────

// Inverse-normal CDF approximation (Acklam, 2003). Akurasi ~1e-9 untuk
// p di (0, 1). Dipakai untuk konversi percentile → z-score.
function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -39.6968302866538, 220.946098424521, -275.928510446969,
    138.357751867269, -30.6647980661472, 2.50662827745924,
  ];
  const b = [
    -54.4760987982241, 161.585836858041, -155.698979859887,
    66.8013118877197, -13.2806815528857,
  ];
  const c = [
    -7.78489400243029e-3, -0.322396458041136, -2.40075827716184,
    -2.54973253934373, 4.37466414146497, 2.93816398269878,
  ];
  const d = [
    7.78469570904146e-3, 0.32246712907004, 2.445134137143,
    3.75440866190742,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Equipercentile mapping per subtes ────────────────────────────────────
//
// Cut-off `CATEGORY_RANGES[code] = [maxBR, maxRR, maxAR, maxB]` mendefinisikan
// batas atas tier BR/RR/AR/B (selebihnya = LB). Kita anggap batas-batas ini
// sebagai "knot points" di kurva percentile:
//   raw=0       → percentile 1
//   raw=maxBR   → percentile 25  (top BR / batas RR)
//   raw=maxRR   → percentile 50  (batas AR)
//   raw=maxAR   → percentile 75  (batas B)
//   raw=maxB    → percentile 90  (batas LB)
//   raw=maxScore→ percentile 99
// Antara dua knot, percentile diinterpolasi linier. Hasilnya monoton naik dan
// "wajar" untuk pelaporan profil.

function percentileFromRaw(code: string, raw: number, maxScore: number): number {
  const r = CATEGORY_RANGES[code];
  // Subtes tanpa cut-off → fallback proporsional.
  if (!r) {
    if (maxScore <= 0) return 50;
    return clamp(Math.round((raw / maxScore) * 99), 1, 99);
  }
  const knots: Array<[number, number]> = [
    [0, 1],
    [r[0], 25],
    [r[1], 50],
    [r[2], 75],
    [r[3], 90],
    [Math.max(maxScore, r[3] + 1), 99],
  ];
  // Make sure x is monotonic — pad ke kanan kalau ada duplikat (mis. r[i] == r[i+1]).
  for (let i = 1; i < knots.length; i++) {
    if (knots[i][0] <= knots[i - 1][0]) {
      knots[i][0] = knots[i - 1][0] + 0.5;
    }
  }
  if (raw <= knots[0][0]) return knots[0][1];
  if (raw >= knots[knots.length - 1][0]) return knots[knots.length - 1][1];
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0] = knots[i];
    const [x1, y1] = knots[i + 1];
    if (raw >= x0 && raw <= x1) {
      const t = (raw - x0) / (x1 - x0);
      return clamp(Math.round(y0 + t * (y1 - y0)), 1, 99);
    }
  }
  return 50;
}

export type StandardScores = {
  zScore: number;       // standardized score, mean 0 SD 1
  tScore: number;       // 50 + 10z
  percentile: number;   // 1..99
  stanine: number;      // 1..9
};

export function standardScoresFromRaw(
  code: string,
  raw: number,
  maxScore: number,
): StandardScores {
  const pr = percentileFromRaw(code, raw, maxScore);
  // pr=1 atau 99 menghasilkan z ekstrem; clamp pakai 0.5 dan 99.5 (Acklam
  // butuh p strictly 0..1).
  const p = clamp(pr / 100, 0.005, 0.995);
  const z = inverseNormalCdf(p);
  const t = clamp(50 + 10 * z, 20, 80);
  // Stanine: 9 bands centered di 5 (mean), tiap stanine ~0.5 SD lebar.
  // Formula standar: stanine = clamp(round(z*2 + 5), 1, 9).
  const stanine = clamp(Math.round(z * 2 + 5), 1, 9);
  return {
    zScore: Math.round(z * 100) / 100,
    tScore: Math.round(t),
    percentile: pr,
    stanine,
  };
}

// ── Composite Indices (CHC-like) ─────────────────────────────────────────
//
// Indeks komposit memudahkan interpretasi: alih-alih 9 angka subtes, ringkas
// jadi 4 indeks fungsional. Skala mean 100, SD 15 (mirip Wechsler).
//
// Pengelompokan loosely mengikuti CHC theory:
//   GRI (Penalaran Umum)       — subtes verbal/numerik/visual abstract
//   VSI (Visual-Spasial)       — manipulasi mental bentuk
//   PSI (Kecepatan Klerikal)   — speed of clerical processing
//   VCI (Pemahaman Verbal)     — kosakata + analisa verbal

export const COMPOSITE_GROUPS: Record<string, { name: string; short: string; members: string[] }> = {
  GRI: {
    name: "Penalaran Umum",
    short: "GRI",
    members: ["BAKAT_1_VISUAL", "BAKAT_2_NUMERIK", "BAKAT_3_VERBAL", "BAKAT_4_URUTAN"],
  },
  VSI: {
    name: "Visual-Spasial",
    short: "VSI",
    members: ["BAKAT_5_SPASIAL", "BAKAT_6_3DIMENSI"],
  },
  PSI: {
    name: "Kecepatan Klerikal",
    short: "PSI",
    members: ["BAKAT_7_SISTEMATISASI", "BAKAT_9_FIGURAL"],
  },
  VCI: {
    name: "Pemahaman Verbal",
    short: "VCI",
    members: ["BAKAT_3_VERBAL", "BAKAT_8_KOSAKATA"],
  },
};

// ── 4 Kategori Akumulasi IQ Prediktif ────────────────────────────────────
//
// Sesuai rumus rekomendasi:
//   IQ_prediksi = (0.30 × Penalaran) + (0.25 × Verbal)
//               + (0.25 × Kuantitatif) + (0.20 × Spasial)
// Tiap kategori adalah rata-rata z-score subtes anggotanya. Hasil akhir
// dikonversi ke skala IQ (mean 100, SD 15).
//
// Sistematisasi (klerikal murni) tidak masuk formula IQ — tetap dilaporkan
// sebagai bagian indeks komposit PSI.

export type IqCategoryCode = "P" | "V" | "K" | "S";

export const IQ_CATEGORY_GROUPS: Record<
  IqCategoryCode,
  { name: string; short: string; weight: number; members: string[] }
> = {
  P: {
    name: "Penalaran",
    short: "Penalaran",
    weight: 0.30,
    members: ["BAKAT_1_VISUAL", "BAKAT_4_URUTAN"],
  },
  V: {
    name: "Verbal",
    short: "Verbal",
    weight: 0.25,
    members: ["BAKAT_3_VERBAL", "BAKAT_8_KOSAKATA"],
  },
  K: {
    name: "Kuantitatif",
    short: "Kuantitatif",
    weight: 0.25,
    members: ["BAKAT_2_NUMERIK", "BAKAT_9_FIGURAL"],
  },
  S: {
    name: "Spasial",
    short: "Spasial",
    weight: 0.20,
    members: ["BAKAT_5_SPASIAL", "BAKAT_6_3DIMENSI"],
  },
};

export type IqCategoryScore = {
  code: IqCategoryCode;
  name: string;
  weight: number;     // 0.30 / 0.25 / 0.25 / 0.20
  meanZ: number;      // rata-rata z-score subtes anggota
  scaled: number;     // 100 + 15 * meanZ, clamp 50-160
  percentile: number; // dari meanZ
  band: WechslerBandInfo;
};

export type CompositeIndex = {
  code: string;
  name: string;
  short: string;
  meanZ: number;      // rata-rata z-score subtes anggota
  scaled: number;     // 100 + 15 * meanZ, clamp 50-160
  percentile: number; // dari meanZ
  band: WechslerBandInfo;
};

export type WechslerBandInfo = {
  code: WechslerBand;
  label: string;
  descId: string;
};

// ── Pita Wechsler standar ────────────────────────────────────────────────

export type WechslerBand =
  | "Very Superior"
  | "Superior"
  | "High Average"
  | "Average"
  | "Low Average"
  | "Borderline"
  | "Extremely Low";

// Pita kategori IQ mengikuti tabel "Penggolongan IQ berdasarkan skala David
// Wechsler" (Suryani dkk., SNIMed 2019). Batas IQ: ≥130, 120–129, 110–119,
// 90–109, 80–89, 70–79, ≤69.
export function wechslerBand(score: number): WechslerBandInfo {
  if (score >= 130) return { code: "Very Superior", label: "Sangat Superior", descId: "IQ ≥ 130 — jauh di atas rata-rata populasi." };
  if (score >= 120) return { code: "Superior", label: "Superior", descId: "IQ 120–129 — di atas rata-rata populasi." };
  if (score >= 110) return { code: "High Average", label: "Di Atas Rata-rata", descId: "IQ 110–119 — sedikit di atas rata-rata populasi." };
  if (score >= 90) return { code: "Average", label: "Rata-rata", descId: "IQ 90–109 — sebanding dengan rata-rata populasi seusia." };
  if (score >= 80) return { code: "Low Average", label: "Di Bawah Rata-rata", descId: "IQ 80–89 — sedikit di bawah rata-rata populasi." };
  if (score >= 70) return { code: "Borderline", label: "Lambat Belajar", descId: "IQ 70–79 — cukup di bawah rata-rata, perlu pendampingan belajar." };
  return { code: "Extremely Low", label: "Keterbelakangan Mental", descId: "IQ ≤ 69 — jauh di bawah rata-rata, perlu evaluasi profesional." };
}

// ── Full Scale IQ ─────────────────────────────────────────────────────────

export type FSIQResult = {
  score: number;       // 100 + 15 * (weighted mean of category z-scores), clamp 50-160
  ci95Low: number;     // score - 5
  ci95High: number;    // score + 5
  band: ReturnType<typeof wechslerBand>;
  percentile: number;  // dari z agregat
  // Formula akumulasi: 0.30*Penalaran + 0.25*Verbal + 0.25*Kuantitatif + 0.20*Spasial
  formula: string;
  // Breakdown 4 kategori yang dipakai di formula.
  categories: IqCategoryScore[];
};

function meanZ(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Convert standard score (mean 100, SD 15) → percentile via standard normal.
function scoreToPercentile(score: number): number {
  const z = (score - 100) / 15;
  // Pakai pendekatan Abramowitz & Stegun 26.2.17 untuk Φ(z).
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p = 1 - d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = z >= 0 ? p : 1 - p;
  return clamp(Math.round(cdf * 100), 1, 99);
}

// ── Public API ────────────────────────────────────────────────────────────

export type SubtestRaw = {
  code: string;
  name: string;
  raw: number;
  max: number;
};

export type ProSubtestScore = SubtestRaw & {
  percent: number;        // raw / max * 100, rounded
  zScore: number;
  tScore: number;
  percentile: number;
  stanine: number;
  categoryCode?: string;  // BR/RR/AR/B/LB
  categoryLabel?: string;
};

export type ProBakatPayload = {
  subtests: ProSubtestScore[];
  composites: CompositeIndex[];
  iqCategories: IqCategoryScore[];
  fsiq: FSIQResult;
  // Narasi otomatis untuk dimasukkan ke PDF / hasil.
  narrative: string;
};

export function computeProBakat(
  subtests: SubtestRaw[],
  categorize: (code: string, raw: number) => string,
  categoryLabels: Record<string, string>,
): ProBakatPayload {
  const scored: ProSubtestScore[] = subtests.map((s) => {
    const ss = standardScoresFromRaw(s.code, s.raw, s.max);
    const cat = categorize(s.code, s.raw);
    return {
      ...s,
      percent: s.max > 0 ? Math.round((s.raw / s.max) * 100) : 0,
      ...ss,
      categoryCode: cat,
      categoryLabel: categoryLabels[cat],
    };
  });

  // Composite indices.
  const zMap = new Map(scored.map((s) => [s.code, s.zScore]));
  const composites: CompositeIndex[] = Object.entries(COMPOSITE_GROUPS).map(([code, g]) => {
    const memberZs = g.members
      .map((m) => zMap.get(m))
      .filter((v): v is number => typeof v === "number");
    const mz = meanZ(memberZs);
    const scaled = clamp(Math.round(100 + 15 * mz), 50, 160);
    return {
      code,
      name: g.name,
      short: g.short,
      meanZ: Math.round(mz * 100) / 100,
      scaled,
      percentile: scoreToPercentile(scaled),
      band: wechslerBand(scaled),
    };
  });

  // ── IQ Prediktif: akumulasi 4 kategori dengan bobot ─────────────────
  // Rumus: IQ_z = 0.30*P + 0.25*V + 0.25*K + 0.20*S
  // di mana tiap kategori = mean z-score subtes anggotanya.
  const iqCategories: IqCategoryScore[] = (
    Object.keys(IQ_CATEGORY_GROUPS) as IqCategoryCode[]
  ).map((code) => {
    const g = IQ_CATEGORY_GROUPS[code];
    const memberZs = g.members
      .map((m) => zMap.get(m))
      .filter((v): v is number => typeof v === "number");
    const mz = meanZ(memberZs);
    const scaled = clamp(Math.round(100 + 15 * mz), 50, 160);
    return {
      code,
      name: g.name,
      weight: g.weight,
      meanZ: Math.round(mz * 100) / 100,
      scaled,
      percentile: scoreToPercentile(scaled),
      band: wechslerBand(scaled),
    };
  });

  const totalWeight = iqCategories.reduce((s, c) => s + c.weight, 0) || 1;
  const weightedZ =
    iqCategories.reduce((s, c) => s + c.weight * c.meanZ, 0) / totalWeight;
  const fsiqScore = clamp(Math.round(100 + 15 * weightedZ), 50, 160);
  const fsiq: FSIQResult = {
    score: fsiqScore,
    ci95Low: clamp(fsiqScore - 5, 50, 160),
    ci95High: clamp(fsiqScore + 5, 50, 160),
    band: wechslerBand(fsiqScore),
    percentile: scoreToPercentile(fsiqScore),
    formula:
      "IQ = (0.30 \u00D7 Penalaran) + (0.25 \u00D7 Verbal) + (0.25 \u00D7 Kuantitatif) + (0.20 \u00D7 Spasial)",
    categories: iqCategories,
  };

  const narrative = buildNarrative(scored, composites, fsiq);
  return { subtests: scored, composites, iqCategories, fsiq, narrative };
}

// ── Narrative builder ────────────────────────────────────────────────────

function buildNarrative(
  subtests: ProSubtestScore[],
  _composites: CompositeIndex[],
  fsiq: FSIQResult,
): string {
  // Versi ringkas untuk laporan 1-halaman: cukup 1-2 kalimat fokus pada
  // IQ + kekuatan & area pengembangan.
  const sorted = [...subtests].sort((a, b) => b.zScore - a.zScore);
  const top = sorted[0];
  const bot = sorted[sorted.length - 1];
  const parts: string[] = [];

  parts.push(
    `Peserta memperoleh EKIU ${fsiq.score} (CI 95% ${fsiq.ci95Low}\u2013${fsiq.ci95High}), kategori ${fsiq.band.label} \u2014 percentile ${fsiq.percentile}.`,
  );
  if (top && bot && top.code !== bot.code) {
    parts.push(
      `Kekuatan paling menonjol pada ${top.name} (PR ${top.percentile}); area yang paling perlu dilatih adalah ${bot.name} (PR ${bot.percentile}).`,
    );
  }
  return parts.join(" ");
}
