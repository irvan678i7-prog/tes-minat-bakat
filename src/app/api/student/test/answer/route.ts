import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";

const TIME_UP_GRACE_MS = 3_000;

const Body = z.object({
  questionId: z.string().min(1),
  selected: z.union([z.string(), z.array(z.string())]),
});

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Fetch submission + question + subtestProgress in ONE parallel batch
  // (3 queries, 1 round-trip) instead of the previous 3 sequential round-trips
  // (sub+q → computeSubtestLock → upsert). For the progress lookup we use
  // the student's submissionId + question's subtestId via a raw findFirst
  // since we don't know subtestId yet — but Prisma runs them in parallel.
  const [sub, q] = await Promise.all([
    prisma.submission.findUnique({
      where: { id: student.sub },
      select: { id: true, finishedAt: true, testKind: true },
    }),
    prisma.question.findUnique({
      where: { id: parsed.data.questionId },
      select: {
        id: true,
        subtestId: true,
        isExample: true,
        subtest: { select: { testKind: true, durationSec: true } },
      },
    }),
  ]);
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) return NextResponse.json({ error: "Tes sudah selesai" }, { status: 400 });
  if (!q) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  if (q.subtest.testKind !== sub.testKind) {
    return NextResponse.json(
      { error: "Soal tidak sesuai dengan jenis tes" },
      { status: 403 },
    );
  }

  // Inline lock check + upsert in ONE parallel batch (2 queries, 1 round-trip)
  // instead of sequential computeSubtestLock (1-2 queries) → upsert (1 query).
  const progress = await prisma.subtestProgress.findUnique({
    where: { submissionId_subtestId: { submissionId: sub.id, subtestId: q.subtestId } },
    select: { startedAt: true, finishedAt: true, finishReason: true },
  });

  // Subtes BELUM dimulai (tidak ada SubtestProgress) → jawaban ditolak.
  // Tanpa penjagaan ini, peserta bisa mengirim jawaban lewat API sebelum
  // timer subtes berjalan ("pre-answering") karena semua pemeriksaan waktu
  // di bawah hanya berlaku saat `progress` ada. Soal contoh dikecualikan,
  // sama seperti pada alur CFIT.
  if (!progress && !q.isExample) {
    return NextResponse.json(
      {
        error: "Subtes belum dimulai. Buka subtes terlebih dahulu.",
        locked: true,
        finishReason: null,
      },
      { status: 409 },
    );
  }

  if (progress?.finishedAt) {
    return NextResponse.json(
      {
        error:
          progress.finishReason === "TIME_UP"
            ? "Waktu subtes sudah habis. Jawaban tidak bisa diubah."
            : "Subtes sudah diselesaikan. Jawaban tidak bisa diubah.",
        locked: true,
        finishReason: progress.finishReason,
      },
      { status: 409 },
    );
  }
  if (progress) {
    const deadline = new Date(progress.startedAt.getTime() + q.subtest.durationSec * 1000);
    if (Date.now() >= deadline.getTime() + TIME_UP_GRACE_MS) {
      // Auto-lock (fire-and-forget) and reject.
      prisma.subtestProgress.updateMany({
        where: { submissionId: sub.id, subtestId: q.subtestId, finishedAt: null },
        data: { finishedAt: deadline, finishReason: "TIME_UP" },
      }).catch(() => {});
      return NextResponse.json(
        { error: "Waktu subtes sudah habis. Jawaban tidak bisa diubah.", locked: true, finishReason: "TIME_UP" },
        { status: 409 },
      );
    }
  }

  await prisma.answer.upsert({
    where: { submissionId_questionId: { submissionId: sub.id, questionId: q.id } },
    create: {
      submissionId: sub.id,
      questionId: q.id,
      selected: parsed.data.selected as never,
    },
    update: { selected: parsed.data.selected as never, answeredAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
