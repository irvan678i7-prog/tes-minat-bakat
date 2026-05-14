// Skoring profesional ala tes IQ ternama (Wechsler-style). Output:
// - z-score, T-score, percentile, stanine per subtes
// - Composite Index (GRI, VSI, PSI, VCI) — mirip indeks Wechsler
// - FSIQ (Full Scale IQ) dengan mean 100, SD 15, dan 95% CI ±5
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

export function wechslerBand(score: number): WechslerBandInfo {
  if (score >= 130) return { code: "Very Superior", label: "Sangat Superior", descId: "Jauh di atas rata-rata populasi (top ~2%)." };
  if (score >= 120) return { code: "Superior", label: "Superior", descId: "Di atas rata-rata populasi (top ~9%)." };
  if (score >= 110) return { code: "High Average", label: "Di Atas Rata-rata", descId: "Sedikit di atas rata-rata populasi." };
  if (score >= 90) return { code: "Average", label: "Rata-rata", descId: "Sebanding dengan rata-rata populasi seusia." };
  if (score >= 80) return { code: "Low Average", label: "Di Bawah Rata-rata", descId: "Sedikit di bawah rata-rata populasi." };
  if (score >= 70) return { code: "Borderline", label: "Borderline", descId: "Cukup di bawah rata-rata populasi." };
  return { code: "Extremely Low", label: "Sangat Rendah", descId: "Jauh di bawah rata-rata populasi (bawah ~2%)." };
}

// ── Full Scale IQ ─────────────────────────────────────────────────────────

export type FSIQResult = {
  score: number;       // 100 + 15 * mean(z across all subtests), clamp 50-160
  ci95Low: number;     // score - 5
  ci95High: number;    // score + 5
  band: ReturnType<typeof wechslerBand>;
  percentile: number;  // dari z agregat
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

  // FSIQ — mean z dari semua subtes (bobot sama).
  const allZ = scored.map((s) => s.zScore);
  const overallZ = meanZ(allZ);
  const fsiqScore = clamp(Math.round(100 + 15 * overallZ), 50, 160);
  const fsiq: FSIQResult = {
    score: fsiqScore,
    ci95Low: clamp(fsiqScore - 5, 50, 160),
    ci95High: clamp(fsiqScore + 5, 50, 160),
    band: wechslerBand(fsiqScore),
    percentile: scoreToPercentile(fsiqScore),
  };

  const narrative = buildNarrative(scored, composites, fsiq);
  return { subtests: scored, composites, fsiq, narrative };
}

// ── Narrative builder ────────────────────────────────────────────────────

function buildNarrative(
  subtests: ProSubtestScore[],
  composites: CompositeIndex[],
  fsiq: FSIQResult,
): string {
  // Sort subtes berdasarkan z untuk identifikasi kekuatan & area pengembangan.
  const sorted = [...subtests].sort((a, b) => b.zScore - a.zScore);
  const strengths = sorted.slice(0, 2).filter((s) => s.zScore > 0);
  const weak = sorted.slice(-2).filter((s) => s.zScore < 0);

  const parts: string[] = [];

  parts.push(
    `Berdasarkan hasil tes, peserta menunjukkan skor IQ profil sebesar ${fsiq.score} (CI 95% ${fsiq.ci95Low}-${fsiq.ci95High}), berada pada kategori ${fsiq.band.label} dengan estimasi percentile ${fsiq.percentile}.`,
  );

  // Composite highlights — sebut indeks tertinggi sebagai "ranah dominan".
  const sortedC = [...composites].sort((a, b) => b.scaled - a.scaled);
  const top = sortedC[0];
  const bot = sortedC[sortedC.length - 1];
  if (top && bot && top.code !== bot.code) {
    parts.push(
      `Profil komposit menunjukkan ranah ${top.name} (${top.short} = ${top.scaled}, ${top.band.label}) sebagai area paling menonjol, sementara ${bot.name} (${bot.short} = ${bot.scaled}, ${bot.band.label}) menjadi area yang lebih membutuhkan pengembangan.`,
    );
  }

  if (strengths.length > 0) {
    const list = strengths
      .map((s) => `${s.name} (PR ${s.percentile}, T-score ${s.tScore})`)
      .join(" dan ");
    parts.push(
      `Kekuatan utama terlihat pada ${list} — peserta cenderung lebih cepat dan akurat di tugas-tugas serupa.`,
    );
  }
  if (weak.length > 0) {
    const list = weak
      .map((s) => `${s.name} (PR ${s.percentile})`)
      .join(" dan ");
    parts.push(
      `Area yang perlu dilatih lebih lanjut adalah ${list}. Latihan terbimbing dan pengulangan dapat meningkatkan performa di area ini.`,
    );
  }

  parts.push(
    "Skor ini bersifat skrining minat dan bakat, BUKAN diagnosis klinis. Hasil sebaiknya digunakan bersama pertimbangan akademik, minat pribadi, dan masukan guru pembimbing.",
  );

  return parts.join(" ");
}
