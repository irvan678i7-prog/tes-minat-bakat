import { prisma } from "./db";
import {
  APTITUDE_PROFILES,
  CATEGORY_LABEL,
  MINAT_BIDANG_TO_PROGRAM,
  categorize,
  estimateIQ,
  iqInterpretation,
} from "./test-config";

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
    }
  >;
  bakat?: {
    topProfiles: { name: string; description: string; majors: string[]; careers: string[]; matchScore: number }[];
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

export async function scoreSubmission(submissionId: string): Promise<ScoringPayload> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      answers: { include: { question: { include: { subtest: true } } } },
    },
  });

  if (sub.testKind === "BAKAT") return scoreBakat(sub);
  return scoreMinat(sub);
}

type SubWithAnswers = Awaited<ReturnType<typeof prisma.submission.findUniqueOrThrow>> & {
  answers: { selected: unknown; partialScore: number; isCorrect: boolean; question: { subtestId: string; subtest: { code: string; name: string }; parts: number; correct: unknown; scoringTag: string | null } }[];
};

function scoreBakat(sub: SubWithAnswers): ScoringPayload {
  // Aggregate raw counts per subtest from saved answers (we expect Answer.partialScore
  // to already store the per-question score for parts>1 questions; otherwise use isCorrect).
  const perSubtest: Record<string, { name: string; raw: number; max: number }> = {};
  for (const ans of sub.answers) {
    const code = ans.question.subtest.code;
    if (!perSubtest[code]) perSubtest[code] = { name: ans.question.subtest.name, raw: 0, max: 0 };
    perSubtest[code].max += Math.max(1, ans.question.parts || 1);
    if (ans.question.parts && ans.question.parts > 1) {
      perSubtest[code].raw += ans.partialScore || 0;
    } else {
      perSubtest[code].raw += ans.isCorrect ? 1 : 0;
    }
  }

  // Categorize
  const out: ScoringPayload["perSubtest"] = {};
  for (const [code, v] of Object.entries(perSubtest)) {
    const cat = categorize(code, v.raw);
    out[code] = { ...v, categoryCode: cat, categoryLabel: CATEGORY_LABEL[cat] };
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

  const iq = estimateIQ(perSubtest);
  const interp = iqInterpretation(iq);

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

/** Update Answer rows so partialScore/isCorrect reflect grading vs. correct keys. */
export async function gradeAnswers(submissionId: string): Promise<void> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { answers: { include: { question: true } } },
  });

  for (const ans of sub.answers) {
    const correct = ans.question.correct as unknown;
    const selected = ans.selected as unknown;
    const parts = ans.question.parts || 1;

    let isCorrect = false;
    let partialScore = 0;

    if (parts > 1 && Array.isArray(correct) && Array.isArray(selected)) {
      let okCount = 0;
      for (let i = 0; i < correct.length; i++) {
        const c = String(correct[i] ?? "").trim().toUpperCase();
        const s = String(selected[i] ?? "").trim().toUpperCase();
        if (c && c === s) okCount += 1;
      }
      partialScore = okCount;
      // Per buku Subtes 4 (Penalaran Urutan): kalau salah satu salah → 0.
      // Subtes 6 (Tiga Dimensi): hitung benar per slot.
      if (ans.question.subtestId) {
        // Use heuristic via subtest code already in question
      }
      isCorrect = okCount === correct.length;
    } else if (typeof correct === "string" || typeof correct === "number") {
      const c = String(correct).trim().toUpperCase();
      const s = String(Array.isArray(selected) ? selected[0] : selected ?? "").trim().toUpperCase();
      isCorrect = c.length > 0 && c === s;
      partialScore = isCorrect ? 1 : 0;
    } else if (correct == null) {
      // No correct key (e.g., MINAT subtests). Mark "answered" as a soft success.
      const s = String(Array.isArray(selected) ? selected[0] : selected ?? "").trim();
      isCorrect = s.length > 0;
      partialScore = isCorrect ? 1 : 0;
    }

    await prisma.answer.update({
      where: { id: ans.id },
      data: { isCorrect, partialScore },
    });
  }
}
