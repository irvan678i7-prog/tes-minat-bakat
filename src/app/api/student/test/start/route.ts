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
  });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (!sub.fullName) return NextResponse.json({ error: "Data diri belum lengkap" }, { status: 400 });

  // Batch queries: fetch subtests with question counts + all answered question
  // IDs in 2 queries instead of 2×N (N = number of subtests).
  const [subtests, answered] = await Promise.all([
    prisma.subtest.findMany({
      where: { testKind: sub.testKind },
      orderBy: { orderIndex: "asc" },
      include: {
        _count: { select: { questions: { where: { isExample: false } } } },
      },
    }),
    prisma.answer.findMany({
      where: { submissionId: sub.id, question: { isExample: false } },
      select: { question: { select: { subtestId: true } } },
    }),
  ]);
  const counts: Record<string, number> = {};
  for (const a of answered) counts[a.question.subtestId] = (counts[a.question.subtestId] || 0) + 1;

  return NextResponse.json({
    submission: {
      id: sub.id,
      testKind: sub.testKind,
      finishedAt: sub.finishedAt,
    },
    subtests: subtests.map((s) => {
      const total = s._count.questions;
      const ans = counts[s.id] || 0;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
        instructions: s.instructions ?? "",
        durationSec: s.durationSec,
        total,
        answered: ans,
        done: total > 0 && ans >= total,
      };
    }),
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
  const seedPartLabels = seedCfg?.partLabels ?? [];

  // Per-soal partLabels: Question.partLabels override seed default. Kalau
  // null, pakai seed; kalau seed juga kosong, pakai "1","2",..."parts".
  const resolvePartLabels = (q: { parts: number; partLabels: unknown }): string[] => {
    if (Array.isArray(q.partLabels) && q.partLabels.length > 0) {
      return q.partLabels.map((v) => (v == null ? "" : String(v)));
    }
    if (seedPartLabels.length > 0) return seedPartLabels;
    return Array.from({ length: q.parts }, (_, i) => String(i + 1));
  };

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
      partLabels: resolvePartLabels(q),
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
    partLabels: resolvePartLabels(q),
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
