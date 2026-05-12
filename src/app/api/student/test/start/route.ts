import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { shuffle } from "@/lib/random";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS } from "@/lib/test-config";

export async function GET(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sub = await prisma.submission.findUnique({
    where: { id: student.sub },
    include: { answers: true },
  });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (!sub.fullName) return NextResponse.json({ error: "Data diri belum lengkap" }, { status: 400 });

  const subtests = await prisma.subtest.findMany({
    where: { testKind: sub.testKind },
    orderBy: { orderIndex: "asc" },
  });

  // Determine next subtest by inspecting answers; subtest is "done" if any of its
  // questions has been answered AND the user has marked subtest finished by
  // having every question answered OR a marker. For simplicity we pick the
  // first subtest not yet "started" (any answer) or compute completion below.
  // Actually: client-side will declare progress; here we just return list of
  // subtests with progress + next pending.
  const answeredQuestionIds = new Set(sub.answers.map((a) => a.questionId));
  const subtestProgress = await Promise.all(
    subtests.map(async (s) => {
      // Only count non-example questions (isExample=false) toward progress.
      const total = await prisma.question.count({
        where: { subtestId: s.id, isExample: false },
      });
      const answered = await prisma.question.count({
        where: {
          subtestId: s.id,
          isExample: false,
          id: { in: Array.from(answeredQuestionIds) },
        },
      });
      return { ...s, total, answered, done: total > 0 && answered >= total };
    }),
  );

  return NextResponse.json({
    submission: {
      id: sub.id,
      testKind: sub.testKind,
      finishedAt: sub.finishedAt,
      randomSeed: sub.randomSeed,
    },
    subtests: subtestProgress.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      description: s.description,
      instructions: s.instructions ?? "",
      durationSec: s.durationSec,
      total: s.total,
      answered: s.answered,
      done: s.done,
    })),
  });
}

export async function POST(req: NextRequest) {
  // Body: { subtestCode }. Returns the question list (randomized) for this student.
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subtestCode } = await req.json().catch(() => ({} as { subtestCode?: string }));
  if (!subtestCode) return NextResponse.json({ error: "subtestCode required" }, { status: 400 });

  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });

  const subtest = await prisma.subtest.findUnique({
    where: { code: subtestCode },
    include: { questions: true },
  });
  if (!subtest || subtest.testKind !== sub.testKind) {
    return NextResponse.json({ error: "Subtest tidak valid" }, { status: 400 });
  }

  const seedCfg = [...BAKAT_SUBTESTS, ...MINAT_SUBTESTS].find(
    (x) => x.code === subtest.code,
  );
  const partLabels = seedCfg?.partLabels ?? [];

  const seed = `${sub.randomSeed}:${subtest.code}`;
  const realQuestions = subtest.questions.filter((q) => !q.isExample);
  const exampleQuestions = subtest.questions
    .filter((q) => q.isExample)
    .sort((a, b) => a.questionNo - b.questionNo);

  const questions = shuffle(realQuestions, seed).map((q) => {
    // Optionally shuffle option order too — but careful for letter-keyed answers.
    // We do NOT shuffle options because keys (A/B/C..) carry semantic meaning
    // for some subtests (e.g. spasial B/S, minat letters).
    return {
      id: q.id,
      questionNo: q.questionNo,
      prompt: q.prompt,
      imageUrl: q.imageUrl,
      imageUrl2: q.imageUrl2,
      parts: q.parts,
      options: q.options,
      inputMode: q.inputMode,
      partLabels,
    };
  });

  const examples = exampleQuestions.map((q) => ({
    id: q.id,
    questionNo: q.questionNo,
    prompt: q.prompt,
    imageUrl: q.imageUrl,
    imageUrl2: q.imageUrl2,
    parts: q.parts,
    options: q.options,
    correct: q.correct,
    inputMode: q.inputMode,
    partLabels,
  }));

  // Existing saved answers (for resume) — only for real questions.
  const existing = await prisma.answer.findMany({
    where: {
      submissionId: sub.id,
      questionId: { in: realQuestions.map((q) => q.id) },
    },
  });
  const answersMap: Record<string, unknown> = {};
  for (const a of existing) answersMap[a.questionId] = a.selected;

  return NextResponse.json({
    subtest: {
      id: subtest.id,
      code: subtest.code,
      name: subtest.name,
      description: subtest.description,
      instructions: subtest.instructions ?? "",
      durationSec: subtest.durationSec,
    },
    questions,
    examples,
    existingAnswers: answersMap,
  });
}
