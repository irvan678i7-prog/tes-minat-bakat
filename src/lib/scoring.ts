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
  type ProSubtestScore,
} from "./scoring-pro";

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
  };
};

function normalizeText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

type SubWithAnswers = {
  testKind: "BAKAT" | "MINAT";
  answers: AnswerRow[];
};

/**
 * Compute per-answer correctness in memory (no DB writes). Returns
 * { isCorrect, partialScore } for each input answer in the same order.
 */
function gradeAnswerRows(answers: AnswerRow[]): { isCorrect: boolean; partialScore: number }[] {
  return answers.map((ans) => {
    const correct = ans.question.correct as unknown;
    const selected = ans.selected as unknown;
    const parts = ans.question.parts || 1;
    let isCorrect = false;
    let partialScore = 0;
    // TEXT and CHOICE both compare normalized strings (uppercase, trimmed,
    // collapsed whitespace). Empty correct => MINAT-style "every answered counts".
    if (parts > 1 && Array.isArray(correct) && Array.isArray(selected)) {
      let okCount = 0;
      for (let i = 0; i < correct.length; i++) {
        const c = normalizeText(correct[i]);
        const s = normalizeText(selected[i]);
        if (c && c === s) okCount += 1;
      }
      partialScore = okCount;
      isCorrect = okCount === correct.length;
    } else if (typeof correct === "string" || typeof correct === "number") {
      const c = normalizeText(correct);
      const s = normalizeText(Array.isArray(selected) ? selected[0] : selected);
      isCorrect = c.length > 0 && c === s;
      partialScore = isCorrect ? 1 : 0;
    } else if (correct == null || (Array.isArray(correct) && correct.length === 0)) {
      const s = String(Array.isArray(selected) ? selected[0] : selected ?? "").trim();
      isCorrect = s.length > 0;
      partialScore = isCorrect ? 1 : 0;
    }
    return { isCorrect, partialScore };
  });
}

export async function scoreSubmission(submissionId: string): Promise<ScoringPayload> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      answers: { include: { question: { include: { subtest: true } } } },
    },
  });
  return computeScoringPayload(sub);
}

/**
 * Compute the full scoring payload from a pre-loaded submission. No DB calls.
 * Use this from the finish endpoint to avoid an extra round-trip.
 */
export function computeScoringPayload(sub: SubWithAnswers): ScoringPayload {
  if (sub.testKind === "BAKAT") return scoreBakat(sub);
  return scoreMinat(sub);
}

function scoreBakat(sub: SubWithAnswers): ScoringPayload {
  const grades = gradeAnswerRows(sub.answers);
  const perSubtest: Record<string, { name: string; raw: number; max: number }> = {};
  for (let i = 0; i < sub.answers.length; i++) {
    const ans = sub.answers[i];
    const g = grades[i];
    const code = ans.question.subtest.code;
    if (!perSubtest[code]) perSubtest[code] = { name: ans.question.subtest.name, raw: 0, max: 0 };
    perSubtest[code].max += Math.max(1, ans.question.parts || 1);
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
      fsiq: pro.fsiq,
      narrative: pro.narrative,
    },
    iqEstimate: iq,
    iqInterpretation: interp,
    recommendations: { majors, careers },
  };
}

function scoreMinat(sub: SubWithAnswers): ScoringPayload {
  // Bidang counts: tally letters chosen on MINAT_BIDANG subtest.
  const bidangScores: Record<Letter, number> = {};
  const programLetterCounts: Record<string, Record<Letter, number>> = {};
  const perSubtest: Record<string, { name: string; raw: number; max: number }> = {};

  for (const ans of sub.answers) {
    const code = ans.question.subtest.code;
    if (!perSubtest[code]) perSubtest[code] = { name: ans.question.subtest.name, raw: 0, max: 0 };
    perSubtest[code].max += 1;
    perSubtest[code].raw += 1; // every answered counts
    const sel = String(Array.isArray(ans.selected) ? (ans.selected[0] as string) : ans.selected);
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
