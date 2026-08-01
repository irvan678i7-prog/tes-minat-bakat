import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCfitFromRequest } from "@/lib/cfit/auth";
import { computeCfitSubtestLock, isCfitAnswerCorrect } from "@/lib/cfit/lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  questionId: z.string().min(1),
  selected: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});

// Simpan satu jawaban. Penilaian dilakukan di SERVER (kunci tidak pernah
// dikirim ke klien). Ditolak kalau subtes belum dimulai / sudah terkunci.
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

  const question = await prisma.cfitQuestion.findUnique({
    where: { id: parsed.data.questionId },
    include: { subtest: true },
  });
  if (!question) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  const lock = await computeCfitSubtestLock({
    submissionId: submission.id,
    subtestId: question.subtestId,
    durationSec: question.subtest.durationSec,
  });
  // SOAL CONTOH dikerjakan pada tahap latihan yang TANPA TIMER, jadi tidak
  // mensyaratkan subtes sudah dimulai. Soal asli tetap wajib timer aktif.
  if (!question.isExample && !lock.started) {
    return NextResponse.json({ error: "Subtes belum dimulai." }, { status: 409 });
  }
  if (lock.locked) {
    return NextResponse.json(
      { error: "Waktu subtes sudah habis / subtes terkunci.", finishReason: lock.finishReason },
      { status: 423 },
    );
  }

  const isCorrect = question.isExample
    ? false
    : isCfitAnswerCorrect(parsed.data.selected, question.correct);

  await prisma.cfitAnswer.upsert({
    where: {
      submissionId_questionId: {
        submissionId: submission.id,
        questionId: question.id,
      },
    },
    create: {
      submissionId: submission.id,
      questionId: question.id,
      selected: parsed.data.selected,
      isCorrect,
    },
    update: { selected: parsed.data.selected, isCorrect, answeredAt: new Date() },
  });

  // `isCorrect` TIDAK dikembalikan ke klien — mencegah trial-and-error.
  return NextResponse.json({ ok: true });
}
