import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formsFor, getCfitFromRequest } from "@/lib/cfit/auth";
import { computeCfitResult, type CfitSubtestScore } from "@/lib/cfit/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Finalisasi tes: kunci semua subtes yang masih terbuka, hitung RS per
// subtes → RS total → IQ (norma 17+) → klasifikasi, simpan ke CfitResult.
export async function POST(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const submission = await prisma.cfitSubmission.findUnique({ where: { id: p.sub } });
  if (!submission) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });

  // Kunci semua subtes yang belum dikunci (race-safe).
  await prisma.cfitSubtestProgress.updateMany({
    where: { submissionId: submission.id, finishedAt: null },
    data: { finishedAt: new Date(), finishReason: "MANUAL" },
  });

  const subtests = await prisma.cfitSubtest.findMany({
    where: { form: { in: formsFor(submission.form as never) } },
    orderBy: { orderIndex: "asc" },
    include: { _count: { select: { questions: { where: { isExample: false } } } } },
  });

  const answers = await prisma.cfitAnswer.findMany({
    where: { submissionId: submission.id },
    select: {
      isCorrect: true,
      question: { select: { subtestId: true, isExample: true } },
    },
  });

  const agg = new Map<string, { correct: number; answered: number }>();
  for (const a of answers) {
    if (a.question.isExample) continue;
    const cur = agg.get(a.question.subtestId) ?? { correct: 0, answered: 0 };
    cur.answered += 1;
    if (a.isCorrect) cur.correct += 1;
    agg.set(a.question.subtestId, cur);
  }

  const perSubtest: CfitSubtestScore[] = subtests.map((s) => ({
    subtestCode: s.code,
    correct: agg.get(s.id)?.correct ?? 0,
    answered: agg.get(s.id)?.answered ?? 0,
    total: s._count.questions,
  }));

  const computed = computeCfitResult(submission.form as never, perSubtest);

  const result = await prisma.cfitResult.upsert({
    where: { submissionId: submission.id },
    create: {
      submissionId: submission.id,
      rawScoreA: computed.rawScoreA,
      rawScoreB: computed.rawScoreB,
      rawScoreTotal: computed.rawScoreTotal,
      iq: computed.iq,
      classification: computed.classification,
      payload: {
        classificationEn: computed.classificationEn,
        perSubtest: computed.perSubtest,
        normGroup: "17+",
      },
    },
    update: {
      rawScoreA: computed.rawScoreA,
      rawScoreB: computed.rawScoreB,
      rawScoreTotal: computed.rawScoreTotal,
      iq: computed.iq,
      classification: computed.classification,
      payload: {
        classificationEn: computed.classificationEn,
        perSubtest: computed.perSubtest,
        normGroup: "17+",
      },
      generatedAt: new Date(),
    },
  });

  if (!submission.finishedAt) {
    await prisma.cfitSubmission.update({
      where: { id: submission.id },
      data: { finishedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    result: {
      rawScoreA: result.rawScoreA,
      rawScoreB: result.rawScoreB,
      rawScoreTotal: result.rawScoreTotal,
      iq: result.iq,
      classification: result.classification,
      perSubtest: computed.perSubtest,
    },
  });
}
