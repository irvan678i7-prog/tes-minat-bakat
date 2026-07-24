import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formsFor, getCfitFromRequest } from "@/lib/cfit/auth";
import { ensureCfitSubtestStarted } from "@/lib/cfit/lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ subtestCode: z.string().min(1) });

// Mulai (atau resume) satu subtes: nyalakan timer server-side lalu kirim
// soal TANPA kunci jawaban. Kalau subtes sudah terkunci → 423.
export async function POST(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

  const submission = await prisma.cfitSubmission.findUnique({ where: { id: p.sub } });
  if (!submission) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (submission.finishedAt) {
    return NextResponse.json({ error: "Tes sudah diselesaikan." }, { status: 409 });
  }
  if (!submission.fullName) {
    return NextResponse.json({ error: "Isi biodata terlebih dahulu." }, { status: 409 });
  }

  const subtest = await prisma.cfitSubtest.findUnique({
    where: { code: parsed.data.subtestCode },
  });
  if (!subtest || !formsFor(submission.form as never).includes(subtest.form as never)) {
    return NextResponse.json({ error: "Subtes tidak ditemukan untuk bentuk tes ini." }, { status: 404 });
  }

  const lock = await ensureCfitSubtestStarted({
    submissionId: submission.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });
  if (lock.locked) {
    return NextResponse.json(
      { error: "Subtes ini sudah terkunci.", finishReason: lock.finishReason },
      { status: 423 },
    );
  }

  const rows = await prisma.cfitQuestion.findMany({
    where: { subtestId: subtest.id },
    orderBy: [{ isExample: "desc" }, { questionNo: "asc" }],
    select: {
      id: true,
      questionNo: true,
      prompt: true,
      imageUrl: true,
      options: true,
      isExample: true,
      correct: true,
    },
  });

  // KUNCI JAWABAN (`correct`) SENGAJA TIDAK DIKIRIM ke peserta — hanya
  // jumlah jawaban yang diminta (expectedAnswers) untuk soal multi-jawaban.
  const questions = rows.map(({ correct, ...q }) => ({
    ...q,
    expectedAnswers: Array.isArray(correct) ? (correct as unknown[]).length : 1,
  }));

  // Jawaban yang sudah tersimpan (resume setelah refresh).
  const saved = await prisma.cfitAnswer.findMany({
    where: { submissionId: submission.id, questionId: { in: rows.map((q) => q.id) } },
    select: { questionId: true, selected: true },
  });

  const remainingSec = lock.startedAt
    ? Math.max(0, Math.round((lock.startedAt.getTime() + subtest.durationSec * 1000 - Date.now()) / 1000))
    : subtest.durationSec;

  return NextResponse.json({
    subtest: {
      code: subtest.code,
      name: subtest.name,
      description: subtest.description,
      instructions: subtest.instructions,
      durationSec: subtest.durationSec,
    },
    startedAt: lock.startedAt,
    remainingSec,
    questions,
    savedAnswers: saved,
  });
}
