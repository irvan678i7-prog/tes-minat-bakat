import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clearStudentCookie, getStudentFromRequest } from "@/lib/auth";
import { gradeAnswers, scoreSubmission } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) return NextResponse.json({ ok: true, alreadyFinished: true });

  // Defense in depth: tolak finish kalau masih ada subtes yang punya soal
  // tetapi belum semua dijawab. UI sudah memblokir di TestHub, tapi jangan
  // bergantung pada client.
  const subtests = await prisma.subtest.findMany({
    where: { testKind: sub.testKind },
    select: { id: true, code: true, name: true, _count: { select: { questions: true } } },
  });
  const answers = await prisma.answer.findMany({
    where: { submissionId: sub.id },
    select: { question: { select: { subtestId: true } } },
  });
  const answeredCount: Record<string, number> = {};
  for (const a of answers) {
    answeredCount[a.question.subtestId] = (answeredCount[a.question.subtestId] || 0) + 1;
  }
  const incomplete = subtests
    .filter((s) => s._count.questions > 0 && (answeredCount[s.id] || 0) < s._count.questions)
    .map((s) => ({
      code: s.code,
      name: s.name,
      total: s._count.questions,
      answered: answeredCount[s.id] || 0,
    }));
  if (incomplete.length > 0) {
    return NextResponse.json(
      {
        error: "Masih ada subtes yang belum selesai dijawab",
        incomplete,
      },
      { status: 400 },
    );
  }

  await prisma.submission.update({
    where: { id: sub.id },
    data: { finishedAt: new Date() },
  });

  await gradeAnswers(sub.id);
  const payload = await scoreSubmission(sub.id);
  const topProfiles = payload.bakat?.topProfiles.map((p) => p.name);
  const topPrograms = payload.minat?.programs.map((p) => p.bidang);

  await prisma.result.upsert({
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
  });

  const res = NextResponse.json({ ok: true });
  // Sign out the student session — they cannot redo the test.
  clearStudentCookie(res);
  return res;
}
