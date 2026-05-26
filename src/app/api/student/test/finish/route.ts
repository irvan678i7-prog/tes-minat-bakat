import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStudentFromRequest, clearStudentCookie } from "@/lib/auth";
import {
  computeScoringPayload,
  findMatchingMinatBidangScores,
  loadSubtestMeta,
} from "@/lib/scoring";

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single fetch with everything needed for scoring (replaces 2-3 separate queries).
  const sub = await prisma.submission.findUnique({
    where: { id: student.sub },
    include: {
      answers: {
        include: { question: { include: { subtest: true } } },
      },
    },
  });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) {
    const res = NextResponse.json({ ok: true, alreadyFinished: true });
    clearStudentCookie(res);
    return res;
  }

  // Load paralel: cross-link MINAT bidang (untuk BAKAT) + subtestMeta
  // (jumlah soal asli per subtes — sumber otoritatif untuk `max` di
  // perSubtest, supaya peserta yang skip soal tidak mendapat ratio
  // raw/max = 100% yang menginflasi IQ).
  const [minatBidang, subtestMeta] = await Promise.all([
    sub.testKind === "BAKAT"
      ? findMatchingMinatBidangScores({
          fullName: sub.fullName,
          school: sub.school,
          grade: sub.grade,
        })
      : Promise.resolve(null),
    loadSubtestMeta(sub.testKind),
  ]);

  // Compute scoring entirely in memory — no DB round-trips per answer.
  const payload = computeScoringPayload(
    {
      testKind: sub.testKind,
      answers: sub.answers.map((a) => ({
        selected: a.selected,
        question: {
          subtestId: a.question.subtestId,
          subtest: { code: a.question.subtest.code, name: a.question.subtest.name },
          parts: a.question.parts,
          correct: a.question.correct,
          scoringTag: a.question.scoringTag,
        },
      })),
      fullName: sub.fullName,
      school: sub.school,
      grade: sub.grade,
    },
    subtestMeta,
    minatBidang,
  );
  const topProfiles = payload.bakat?.topProfiles.map((p) => p.name);
  const topPrograms = payload.minat?.programs.map((p) => p.bidang);

  // Mark finished + write result in a single transaction (2 statements only).
  await prisma.$transaction([
    prisma.submission.update({
      where: { id: sub.id },
      data: { finishedAt: new Date() },
    }),
    prisma.result.upsert({
      where: { submissionId: sub.id },
      create: {
        submissionId: sub.id,
        payload: payload as unknown as Prisma.InputJsonValue,
        iqEstimate: payload.iqEstimate ?? null,
        topProfiles: topProfiles ?? Prisma.JsonNull,
        topPrograms: topPrograms ?? Prisma.JsonNull,
      },
      update: {
        payload: payload as unknown as Prisma.InputJsonValue,
        iqEstimate: payload.iqEstimate ?? null,
        topProfiles: topProfiles ?? Prisma.JsonNull,
        topPrograms: topPrograms ?? Prisma.JsonNull,
      },
    }),
  ]);

  const res = NextResponse.json({ ok: true });
  // Sign out the student session — they cannot redo the test.
  clearStudentCookie(res);
  return res;
}
