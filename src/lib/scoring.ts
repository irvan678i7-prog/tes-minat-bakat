import { prisma } from "./db";
import {
  APTITUDE_PROFILES,
  CATEGORY_LABEL,
  MINAT_BIDANG_TO_PROGRAM,
  categorize,
} from "./test-config";
import {
  computeProBakat,
  type CompositeIndex,
  type FSIQResult,
  type IqCategoryScore,
  type ProSubtestScore,
} from "./scoring-pro";
import {
  hitungPenjurusan,
  type PenjurusanResult,
} from "./penjurusan";

type Letter = string;

export type ScoringPayload = {
  testKind: "BAKAT" | "MINAT";
  perSubtest: Record<
    string,
    {
      name: string;
      raw: number;
      max: number;
      categoryCode?: string;
      categoryLabel?: string;
      // Skoring profesional (Wechsler-style). Optional supaya tetap kompatibel
      // dengan payload lama yang tersimpan di DB (Result.payload Json).
      zScore?: number;
      tScore?: number;
      percentile?: number;
      stanine?: number;
    }
  >;
  bakat?: {
    topProfiles: { name: string; description: string; majors: string[]; careers: string[]; matchScore: number }[];
    composites?: CompositeIndex[];
    iqCategories?: IqCategoryScore[];
    fsiq?: FSIQResult;
    narrative?: string;
  };
  minat?: {
    bidangScores: Record<Letter, number>;
    topBidang: Letter[];
    programs: { bidang: Letter; kind: string; topAnswers: { letter: Letter; count: number; label: string; major: string }[] }[];
  };
  iqEstimate?: number;
  iqInterpretation?: { band: string; description: string };
  recommendations: { majors: string[]; careers: string[] };
  penjurusan?: PenjurusanResult & {
    minatSource: "cross-link" | null;
    /** Dasar pencocokan submission MINAT milik peserta yang sama. */
    minatMatchedBy?: "NISN" | "NAMA" | null;
    /** true = hasil cross-link perlu diverifikasi manual oleh guru BK. */
    minatNeedsVerification?: boolean;
  };
  /**
   * Peringatan integritas data (kunci kosong, jumlah kunci != parts,
   * cross-link ambigu, dst). Ditampilkan ke admin / guru BK, bukan ke siswa.
   */
  warnings?: string[];
};

type AnswerRow = {
  selected: unknown;
  question: {
    subtestId: string;
    subtest: { code: string; name: string };
    parts: number;
    correct: unknown;
    scoringTag: string | null;
    inputMode?: string;
    questionNo?: number;
    /** Soal contoh — TIDAK boleh ikut dinilai (max dihitung tanpa contoh). */
    isExample?: boolean;
  };
};

/**
 * Total skor maksimum per subtes berdasarkan SELURUH bank soal subtes
 * (bukan hanya soal yang dijawab). Wajib dikirim oleh caller agar
 * perbandingan raw/max dan estimasi IQ tidak bisa "diakali" dengan
 * menjawab sebagian soal.
 *
 * - totalParts: jumlah part / sel "lembar jawaban" gabungan dari semua
 *   non-example question pada subtes (untuk BAKAT yang punya
 *   parts > 1 seperti SPASIAL & 3DIMENSI).
 * - totalQuestions: jumlah baris soal (1 baris = 1 question, terlepas
 *   dari parts). Dipakai sebagai max untuk MINAT, di mana 1 jawaban =
 *   1 keterisian.
 */
export type SubtestMeta = {
  code: string;
  name: string;
  totalParts: number;
  totalQuestions: number;
};

export async function loadSubtestMeta(testKind: "BAKAT" | "MINAT"): Promise<SubtestMeta[]> {
  const subtests = await prisma.subtest.findMany({
    where: { testKind },
    orderBy: { orderIndex: "asc" },
    include: {
      questions: {
        where: { isExample: false },
        select: { parts: true },
      },
    },
  });
  return subtests.map((s) => ({
    code: s.code,
    name: s.name,
    totalQuestions: s.questions.length,
    totalParts: s.questions.reduce((a, q) => a + Math.max(1, q.parts || 1), 0),
  }));
}

function normalizeText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/**
 * Normalisasi identitas untuk pencocokan antar submission: buang tanda baca,
 * rapatkan spasi ganda, uppercase. "Budi  Santoso." == "budi santoso".
 */
function normalizeIdent(v: unknown): string {
  return String(v ?? "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Normalisasi NAMA SEKOLAH untuk pencocokan cross-link.
 *
 * Peserta menulis sekolahnya dengan sangat bervariasi: "SMKN 1", "SMK N 1",
 * "SMK Negeri 1", bahkan "Sekolah Menengah Kejuruan Negeri 1". Tanpa
 * penyeragaman ini, cross-link BAKAT → MINAT gagal diam-diam padahal
 * sekolahnya sama, sehingga skor minat tidak ikut mengoreksi penjurusan
 * IPA / IPS.
 */
function normalizeSchoolIdent(v: unknown): string {
  let s = normalizeIdent(v);
  if (!s) return "";
  // Bentuk panjang → singkatan baku.
  s = s.replace(/\bSEKOLAH MENENGAH KEJURUAN\b/g, "SMK");
  s = s.replace(/\bSEKOLAH MENENGAH ATAS\b/g, "SMA");
  s = s.replace(/\bSEKOLAH MENENGAH PERTAMA\b/g, "SMP");
  s = s.replace(/\bSEKOLAH DASAR\b/g, "SD");
  s = s.replace(/\bMADRASAH ALIYAH\b/g, "MA");
  s = s.replace(/\bMADRASAH TSANAWIYAH\b/g, "MTS");
  s = s.replace(/\bMADRASAH IBTIDAIYAH\b/g, "MI");
  // "SMKN" / "SMK N" → "SMK NEGERI" (juga SMAN, SMPN, SDN, MAN, MTSN, MIN).
  s = s.replace(/\b(SMK|SMA|SMP|MTS|MI|MA|SD)\s*N\b/g, "$1 NEGERI");
  return s.replace(/\s+/g, " ").trim();
}

type SubWithAnswers = {
  testKind: "BAKAT" | "MINAT";
  answers: AnswerRow[];
  // Identitas peserta (opsional) — kalau ada dan ini BAKAT, dipakai untuk
  // cross-link ke submission MINAT milik orang yang sama supaya skor minat
  // bisa mengoreksi penjurusan IPA / IPS.
  fullName?: string | null;
  school?: string | null;
  grade?: string | null;
};

type GradeRow = { isCorrect: boolean; partialScore: number };

/**
 * Compute per-answer correctness in memory (no DB writes). Returns
 * { isCorrect, partialScore } for each input answer in the same order,
 * plus daftar warning integritas data.
 *
 * PENTING: `testKind` menentukan perlakuan kunci kosong.
 * - MINAT: kunci memang kosong by design — setiap jawaban terisi dihitung.
 * - BAKAT: kunci kosong = kesalahan input admin. Dulu cabang yang sama
 *   membuat SEMUA peserta dapat poin penuh tanpa peringatan apa pun.
 *   Sekarang soal itu diberi 0 poin dan dicatat sebagai warning.
 */
function gradeAnswerRows(
  answers: AnswerRow[],
  testKind: "BAKAT" | "MINAT",
): { grades: GradeRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const seenWarning = new Set<string>();
  const warn = (msg: string) => {
    if (seenWarning.has(msg)) return;
    seenWarning.add(msg);
    warnings.push(msg);
  };

  const grades = answers.map((ans, idx) => {
    const correct = ans.question.correct as unknown;
    const selected = ans.selected as unknown;
    const parts = Math.max(1, ans.question.parts || 1);
    const code = ans.question.subtest.code;
    const no = ans.question.questionNo ?? idx + 1;
    const tag = `${code} soal ${no}`;
    let isCorrect = false;
    let partialScore = 0;

    // TEXT and CHOICE both compare normalized strings (uppercase, trimmed,
    // collapsed whitespace).
    if (parts > 1 && Array.isArray(correct) && Array.isArray(selected)) {
      // Invariant: panjang kunci harus sama dengan `parts`, karena skor
      // maksimum subtes dihitung dari `parts` (loadSubtestMeta.totalParts).
      // Kalau beda, raw tidak akan pernah mencapai max → persentase subtes
      // bias turun permanen.
      if (correct.length !== parts) {
        warn(
          `${tag}: jumlah kunci (${correct.length}) tidak sama dengan parts (${parts}). ` +
            "Penilaian memakai jumlah parts; perbaiki bank soal di panel admin.",
        );
      }
      let okCount = 0;
      let kunciKosong = 0;
      for (let i = 0; i < parts; i++) {
        const c = normalizeText(correct[i]);
        const s = normalizeText(selected[i]);
        if (!c) {
          kunciKosong += 1;
          continue;
        }
        if (c === s) okCount += 1;
      }
      if (kunciKosong > 0 && testKind === "BAKAT") {
        warn(
          `${tag}: ${kunciKosong} bagian tidak punya kunci jawaban — bagian tersebut dinilai 0. ` +
            "Lengkapi kunci di panel admin.",
        );
      }
      partialScore = okCount;
      isCorrect = okCount === parts;
    } else if (typeof correct === "string" || typeof correct === "number") {
      const c = normalizeText(correct);
      const s = normalizeText(Array.isArray(selected) ? selected[0] : selected);
      if (!c && testKind === "BAKAT") {
        warn(`${tag}: kunci jawaban kosong — dinilai 0. Lengkapi kunci di panel admin.`);
      }
      isCorrect = c.length > 0 && c === s;
      partialScore = isCorrect ? 1 : 0;
    } else if (correct == null || (Array.isArray(correct) && correct.length === 0)) {
      if (testKind === "BAKAT") {
        // BUKAN otomatis benar. Kunci kosong pada tes berkunci = kesalahan
        // input, bukan desain seperti pada MINAT.
        warn(`${tag}: kunci jawaban kosong — dinilai 0. Lengkapi kunci di panel admin.`);
        isCorrect = false;
        partialScore = 0;
      } else {
        // MINAT: setiap jawaban terisi dihitung sebagai keterisian.
        const s = String(Array.isArray(selected) ? selected[0] : selected ?? "").trim();
        isCorrect = s.length > 0;
        partialScore = isCorrect ? 1 : 0;
      }
    }
    return { isCorrect, partialScore };
  });

  return { grades, warnings };
}

export async function scoreSubmission(submissionId: string): Promise<ScoringPayload> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      answers: { include: { question: { include: { subtest: true } } } },
    },
  });
  const subtestMeta = await loadSubtestMeta(sub.testKind);
  if (sub.testKind === "BAKAT") {
    const crossLink = await findMatchingMinatCrossLink({
      fullName: sub.fullName,
      school: sub.school,
      grade: sub.grade,
    });
    return computeScoringPayload(
      {
        testKind: sub.testKind,
        answers: sub.answers,
        fullName: sub.fullName,
        school: sub.school,
        grade: sub.grade,
      },
      subtestMeta,
      crossLink,
    );
  }
  return computeScoringPayload(
    {
      testKind: sub.testKind,
      answers: sub.answers,
    },
    subtestMeta,
  );
}

/**
 * Hasil pencocokan submission MINAT milik peserta yang sama.
 *
 * CATATAN PENTING (identitas peserta):
 * Pencocokan saat ini memakai nama + sekolah (+ kelas) yang dinormalisasi.
 * Ini TIDAK unik: dua siswa bernama sama di sekolah & kelas yang sama akan
 * saling tertukar data minatnya. Karena itu:
 *   - bila ditemukan LEBIH DARI SATU kandidat, cross-link DIBATALKAN
 *     (`ambiguous: true`) alih-alih diam-diam mengambil submission terbaru;
 *   - hasil pencocokan berbasis nama selalu ditandai
 *     `needsVerification: true` supaya guru BK memverifikasi.
 * TODO (perlu migrasi DB + form identitas): tambahkan kolom `nisn` pada
 * Submission dan jadikan NISN kunci pencocokan utama; nama hanya fallback.
 */
export type MinatCrossLink = {
  bidangScores: Record<string, number> | null;
  matchedBy: "NISN" | "NAMA" | null;
  needsVerification: boolean;
  ambiguous: boolean;
  note?: string;
};

function isCrossLink(v: unknown): v is MinatCrossLink {
  return !!v && typeof v === "object" && "bidangScores" in (v as object);
}

// Batas pemindaian kandidat cross-link. Pemindaian dilakukan berpaginasi
// supaya pencocokan ternormalisasi bisa dikerjakan di memori tanpa memuat
// seluruh tabel sekaligus.
const CROSSLINK_SCAN_BATCH = 500;
const CROSSLINK_SCAN_LIMIT = 5000;

/**
 * Cari submission MINAT milik peserta yang sama untuk dijadikan koreksi
 * pada penjurusan IPA / IPS. Lihat catatan pada `MinatCrossLink`.
 */
export async function findMatchingMinatCrossLink(idents: {
  fullName: string | null;
  school: string | null;
  grade: string | null;
}): Promise<MinatCrossLink | null> {
  if (!idents.fullName || !idents.school) return null;

  const targetName = normalizeIdent(idents.fullName);
  const targetSchool = normalizeSchoolIdent(idents.school);
  const targetGrade = normalizeIdent(idents.grade);
  if (!targetName || !targetSchool) return null;

  // Cocokkan SEKOLAH, NAMA, dan KELAS secara ternormalisasi DI MEMORI.
  // Sebelumnya sekolah difilter lewat SQL `equals` (case-insensitive) tanpa
  // normalisasi, sehingga "SMKN 1" tidak pernah cocok dengan
  // "SMK Negeri 1" dan cross-link gagal diam-diam. Kandidat dipindai
  // berpaginasi dengan cursor supaya tidak memuat seluruh tabel sekaligus.
  const matched: { id: string }[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  while (scanned < CROSSLINK_SCAN_LIMIT) {
    const batch = await prisma.submission.findMany({
      where: {
        testKind: "MINAT",
        finishedAt: { not: null },
      },
      select: { id: true, fullName: true, school: true, grade: true },
      orderBy: { id: "asc" },
      take: CROSSLINK_SCAN_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    scanned += batch.length;
    cursor = batch[batch.length - 1].id;
    for (const c of batch) {
      if (normalizeSchoolIdent(c.school) !== targetSchool) continue;
      if (normalizeIdent(c.fullName) !== targetName) continue;
      if (targetGrade && normalizeIdent(c.grade) !== targetGrade) continue;
      matched.push({ id: c.id });
    }
    if (batch.length < CROSSLINK_SCAN_BATCH) break;
  }

  if (matched.length === 0) return null;
  if (matched.length > 1) {
    return {
      bidangScores: null,
      matchedBy: null,
      needsVerification: true,
      ambiguous: true,
      note:
        `Ditemukan ${matched.length} hasil Tes Minat dengan nama, sekolah, dan kelas yang sama. ` +
        "Cross-link dibatalkan supaya data minat tidak tertukar antar siswa. " +
        "Verifikasi manual oleh guru BK diperlukan.",
    };
  }

  const bidangScores = await loadBidangScores(matched[0].id);
  if (!bidangScores) return null;
  return {
    bidangScores,
    matchedBy: "NAMA",
    needsVerification: true,
    ambiguous: false,
    note:
      "Cross-link dicocokkan lewat nama + sekolah + kelas (bukan NISN). " +
      "Perlu verifikasi guru BK.",
  };
}

async function loadBidangScores(
  submissionId: string,
): Promise<Record<string, number> | null> {
  const m = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      result: true,
      answers: { include: { question: { include: { subtest: true } } } },
    },
  });
  if (!m) return null;
  const stored = m.result?.payload as ScoringPayload | null | undefined;
  if (stored?.minat?.bidangScores) return stored.minat.bidangScores;
  // Fallback: recompute bidang scores from raw answers.
  const scores: Record<string, number> = {};
  for (const ans of m.answers) {
    if (ans.question.isExample) continue;
    if (ans.question.subtest.code !== "MINAT_BIDANG") continue;
    const sel = pickAnswerLetter(ans.selected);
    if (sel) scores[sel] = (scores[sel] || 0) + 1;
  }
  return Object.keys(scores).length > 0 ? scores : null;
}

/**
 * Versi ringkas dari `findMatchingMinatCrossLink` — dipertahankan supaya
 * caller lama (mis. endpoint finish) tetap berjalan. Prefer memakai
 * `findMatchingMinatCrossLink` agar status verifikasi ikut tercatat.
 */
export async function findMatchingMinatBidangScores(idents: {
  fullName: string | null;
  school: string | null;
  grade: string | null;
}): Promise<Record<string, number> | null> {
  const link = await findMatchingMinatCrossLink(idents);
  return link?.bidangScores ?? null;
}

/**
 * Compute the full scoring payload from a pre-loaded submission. No DB calls.
 * Use this from the finish endpoint to avoid an extra round-trip.
 *
 * `subtestMeta` (WAJIB diisi caller, kecuali dengan sengaja mau pakai mode
 * fallback "max dari answered") menyediakan total bank soal per subtes.
 * Ini PENTING agar peserta yang skip sebagian soal tidak mendapat
 * raw/max = 100% (yang menginflasi IQ).
 *
 * `minatBidang` (opsional) memuat skor bidang MINAT peserta yang sama untuk
 * mengoreksi penjurusan IPA / IPS — caller wajib menyiapkannya bila ingin
 * cross-link (mis. via `findMatchingMinatCrossLink`). Menerima bentuk lama
 * (Record skor bidang) maupun bentuk baru (`MinatCrossLink`).
 */
export function computeScoringPayload(
  sub: SubWithAnswers,
  subtestMeta: SubtestMeta[] | null = null,
  minatBidang: Record<string, number> | MinatCrossLink | null = null,
): ScoringPayload {
  // Buang jawaban SOAL CONTOH sebelum dinilai. Route answer memang menyimpan
  // jawaban contoh (untuk latihan), tapi max per subtes (loadSubtestMeta)
  // dihitung TANPA contoh — kalau ikut dinilai, raw bisa melebihi max dan
  // menginflasi persen/z-score/FSIQ (BAKAT) atau menggeser bidangScores (MINAT).
  sub = { ...sub, answers: sub.answers.filter((a) => !a.question.isExample) };
  const crossLink: MinatCrossLink | null = isCrossLink(minatBidang)
    ? minatBidang
    : minatBidang
    ? {
        bidangScores: minatBidang,
        matchedBy: "NAMA",
        needsVerification: true,
        ambiguous: false,
      }
    : null;
  if (sub.testKind === "BAKAT") return scoreBakat(sub, subtestMeta, crossLink);
  return scoreMinat(sub, subtestMeta);
}

function scoreBakat(
  sub: SubWithAnswers,
  subtestMeta: SubtestMeta[] | null,
  crossLink: MinatCrossLink | null,
): ScoringPayload {
  const { grades, warnings } = gradeAnswerRows(sub.answers, "BAKAT");
  const perSubtest: Record<string, { name: string; raw: number; max: number }> = {};

  // Seed dari subtestMeta supaya `max` = total bank soal real (bukan dari
  // answered). Subtes yang tidak dikerjakan tetap muncul dengan raw=0,
  // max=totalParts → ratio 0% → IQ-nya tidak bisa di-inflate.
  if (subtestMeta) {
    for (const m of subtestMeta) {
      perSubtest[m.code] = { name: m.name, raw: 0, max: m.totalParts };
    }
  }

  for (let i = 0; i < sub.answers.length; i++) {
    const ans = sub.answers[i];
    const g = grades[i];
    const code = ans.question.subtest.code;
    if (!perSubtest[code]) {
      // Subtes asing (mis. data lama / mismatch testKind, atau
      // subtestMeta tidak diberikan untuk backward compat). Akumulasi
      // max dari parts answered — perilaku lama.
      perSubtest[code] = { name: ans.question.subtest.name, raw: 0, max: 0 };
    }
    if (!subtestMeta) {
      // Fallback mode (caller tidak menyediakan meta): max diakumulasi
      // dari parts answered. Hanya untuk backward compat — caller
      // produksi WAJIB mengirim subtestMeta.
      perSubtest[code].max += Math.max(1, ans.question.parts || 1);
    }
    if (ans.question.parts && ans.question.parts > 1) {
      perSubtest[code].raw += g.partialScore || 0;
    } else {
      perSubtest[code].raw += g.isCorrect ? 1 : 0;
    }
  }

  // Skoring profesional: hitung z, T, percentile, stanine + komposit + FSIQ.
  const subtestArr = Object.entries(perSubtest).map(([code, v]) => ({
    code,
    name: v.name,
    raw: v.raw,
    max: v.max,
  }));
  const pro = computeProBakat(subtestArr, categorize, CATEGORY_LABEL);
  const proByCode = new Map<string, ProSubtestScore>(pro.subtests.map((s) => [s.code, s]));

  // Merge: pakai categoryCode/Label dari pro (yang juga lewat `categorize`).
  const out: ScoringPayload["perSubtest"] = {};
  for (const [code, v] of Object.entries(perSubtest)) {
    const p = proByCode.get(code);
    out[code] = {
      ...v,
      categoryCode: p?.categoryCode,
      categoryLabel: p?.categoryLabel,
      zScore: p?.zScore,
      tScore: p?.tScore,
      percentile: p?.percentile,
      stanine: p?.stanine,
    };
  }

  // Top 3 subtests by raw score (per buku: pilih 3 subtes tertinggi → cocokan profil)
  const topCodes = Object.entries(out)
    .sort((a, b) => (b[1].raw / Math.max(1, b[1].max)) - (a[1].raw / Math.max(1, a[1].max)))
    .slice(0, 3)
    .map(([c]) => c);

  // Match profiles by intersection with top 3
  const profileMatches = APTITUDE_PROFILES.map((p) => {
    const match = p.aspects.filter((a) => topCodes.includes(a)).length;
    return { ...p, matchScore: match };
  })
    .filter((p) => p.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  // IQ yang ditampilkan di seluruh app (admin list, PDF, dst) sekarang pakai
  // FSIQ Wechsler-style dari scoring-pro — mean 100, SD 15, dengan CI ±5.
  const iq = pro.fsiq.score;
  const interp = {
    band: pro.fsiq.band.label,
    description: pro.fsiq.band.descId,
  };

  const majors = Array.from(new Set(profileMatches.flatMap((p) => p.majors))).slice(0, 8);
  const careers = Array.from(new Set(profileMatches.flatMap((p) => p.careers))).slice(0, 8);

  const minatBidangScores = crossLink?.bidangScores ?? null;
  if (crossLink?.note) warnings.push(crossLink.note);
  const penjurusan = hitungPenjurusan(perSubtest, minatBidangScores);

  return {
    testKind: "BAKAT",
    perSubtest: out,
    bakat: {
      topProfiles: profileMatches.map((p) => ({
        name: p.name,
        description: p.description,
        majors: p.majors,
        careers: p.careers,
        matchScore: p.matchScore,
      })),
      composites: pro.composites,
      iqCategories: pro.iqCategories,
      fsiq: pro.fsiq,
      narrative: pro.narrative,
    },
    iqEstimate: iq,
    iqInterpretation: interp,
    recommendations: { majors, careers },
    penjurusan: {
      ...penjurusan,
      minatSource: minatBidangScores ? "cross-link" : null,
      minatMatchedBy: minatBidangScores ? crossLink?.matchedBy ?? null : null,
      minatNeedsVerification: minatBidangScores
        ? crossLink?.needsVerification ?? false
        : false,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Ambil huruf jawaban yang valid (uppercase, single character A-Z) dari
 * `selected`. Mengembalikan empty string kalau jawaban kosong / null / array
 * kosong / nilai tidak valid. Dipakai di scoreMinat supaya tally bidang &
 * program tidak ter-pollusi oleh jawaban kosong (yang bisa muncul sebagai
 * "" atau "UNDEFINED" lewat String(undefined)).
 */
function pickAnswerLetter(selected: unknown): string {
  let raw: unknown = selected;
  if (Array.isArray(raw)) {
    raw = raw.length > 0 ? raw[0] : "";
  }
  if (raw == null) return "";
  const s = String(raw).trim().toUpperCase();
  // Hanya terima huruf tunggal A-Z. Jawaban "UNDEFINED", "", "1", dll. ditolak.
  return /^[A-Z]$/.test(s) ? s : "";
}

function scoreMinat(
  sub: SubWithAnswers,
  subtestMeta: SubtestMeta[] | null,
): ScoringPayload {
  // Bidang counts: tally letters chosen on MINAT_BIDANG subtest.
  const bidangScores: Record<Letter, number> = {};
  const programLetterCounts: Record<string, Record<Letter, number>> = {};
  const perSubtest: Record<string, { name: string; raw: number; max: number }> = {};

  // Seed perSubtest dengan max = total soal subtes (dari bank), bukan dari
  // jumlah jawaban. Subtes tanpa jawaban tetap muncul dengan raw=0.
  if (subtestMeta) {
    for (const m of subtestMeta) {
      perSubtest[m.code] = { name: m.name, raw: 0, max: m.totalQuestions };
    }
  }

  for (const ans of sub.answers) {
    const code = ans.question.subtest.code;
    if (!perSubtest[code]) {
      perSubtest[code] = { name: ans.question.subtest.name, raw: 0, max: 0 };
    }
    if (!subtestMeta) {
      // Fallback (caller tidak kirim meta): max ikut +1 setiap jawaban.
      perSubtest[code].max += 1;
    }
    const sel = pickAnswerLetter(ans.selected);
    // Hanya tally jawaban yang valid. Tanpa guard ini, jawaban kosong /
    // "UNDEFINED" akan masuk sebagai "key" di bidangScores → bisa muncul
    // sebagai top bidang kosong di hasil tes peserta.
    if (!sel) continue;
    perSubtest[code].raw += 1;
    if (code === "MINAT_BIDANG") {
      bidangScores[sel] = (bidangScores[sel] || 0) + 1;
    } else if (code.startsWith("MINAT_PROG_")) {
      programLetterCounts[code] = programLetterCounts[code] || {};
      programLetterCounts[code][sel] = (programLetterCounts[code][sel] || 0) + 1;
    }
  }

  const topBidang = Object.entries(bidangScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([l]) => l);

  // For each top bidang, look at MINAT_PROG_<L> answers and rank top letters → map to program
  const programs = topBidang.map((b) => {
    const code = `MINAT_PROG_${b}`;
    const counts = programLetterCounts[code] || {};
    const ranking = Object.entries(counts)
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, 3);
    const map = MINAT_BIDANG_TO_PROGRAM[b];
    const topAnswers = ranking.map(([letter, count]) => {
      const meta = map?.programs.find((p) => p.letter === letter);
      return {
        letter,
        count,
        label: meta?.label || letter,
        major: meta?.major || (map?.kind ?? ""),
      };
    });
    return { bidang: b, kind: map?.kind || "", topAnswers };
  });

  const majors = Array.from(new Set(programs.flatMap((p) => p.topAnswers.map((a) => a.major)))).filter(Boolean);
  const careers = Array.from(new Set(programs.flatMap((p) => p.topAnswers.map((a) => a.label)))).filter(Boolean);

  return {
    testKind: "MINAT",
    perSubtest,
    minat: { bidangScores, topBidang, programs },
    recommendations: { majors, careers },
  };
}
