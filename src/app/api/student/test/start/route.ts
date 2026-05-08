import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { shuffle } from "@/lib/random";

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
      const total = await prisma.question.count({ where: { subtestId: s.id } });
      const answered = await prisma.question.count({
        where: { subtestId: s.id, id: { in: Array.from(answeredQuestionIds) } },
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

  const seed = `${sub.randomSeed}:${subtest.code}`;
  const questions = shuffle(subtest.questions, seed).map((q) => {
    // Optionally shuffle option order too — but careful for letter-keyed answers.
    // We do NOT shuffle options because keys (A/B/C..) carry semantic meaning
    // for some subtests (e.g. spasial B/S, minat letters).
    return {
      id: q.id,
      questionNo: q.questionNo,
      prompt: q.prompt,
      imageUrl: q.imageUrl,
      parts: q.parts,
      options: q.options,
    };
  });

  // Existing saved answers (for resume)
  const existing = await prisma.answer.findMany({
    where: {
      submissionId: sub.id,
      questionId: { in: subtest.questions.map((q) => q.id) },
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
      durationSec: subtest.durationSec,
    },
    questions,
    existingAnswers: answersMap,
  });
}
