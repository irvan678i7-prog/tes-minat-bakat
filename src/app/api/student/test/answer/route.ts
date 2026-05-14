import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { computeSubtestLock } from "@/lib/subtestLock";

const Body = z.object({
  questionId: z.string().min(1),
  selected: z.union([z.string(), z.array(z.string())]),
});

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Fetch submission + question in parallel — they are independent.
  // Saves one DB round-trip per save (terasa di /test saat siswa mengetik
  // / klik jawaban karena setiap kali queueAnswer fire-and-forget ke sini).
  const [sub, q] = await Promise.all([
    prisma.submission.findUnique({ where: { id: student.sub } }),
    prisma.question.findUnique({
      where: { id: parsed.data.questionId },
      include: { subtest: true },
    }),
  ]);
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) return NextResponse.json({ error: "Tes sudah selesai" }, { status: 400 });
  if (!q) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  // Tolak kalau subtes sudah dikunci (waktu habis atau siswa klik Selesai).
  // computeSubtestLock juga akan auto-mark TIME_UP kalau timer lewat.
  const lock = await computeSubtestLock({
    submissionId: sub.id,
    subtestId: q.subtestId,
    durationSec: q.subtest.durationSec,
  });
  if (lock.locked) {
    return NextResponse.json(
      {
        error:
          lock.finishReason === "TIME_UP"
            ? "Waktu subtes sudah habis. Jawaban tidak bisa diubah."
            : "Subtes sudah diselesaikan. Jawaban tidak bisa diubah.",
        locked: true,
        finishReason: lock.finishReason,
      },
      { status: 409 },
    );
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
