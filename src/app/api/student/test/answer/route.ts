import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";

const Body = z.object({
  questionId: z.string().min(1),
  selected: z.union([z.string(), z.array(z.string())]),
});

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) return NextResponse.json({ error: "Tes sudah selesai" }, { status: 400 });

  // Penting: pastikan soal yang dijawab benar-benar milik testKind submission.
  // Tanpa cek ini, peserta BAKAT bisa "menyelipkan" jawaban untuk soal MINAT
  // (atau sebaliknya), yang akan mencemari perhitungan skor & estimasi IQ.
  const q = await prisma.question.findUnique({
    where: { id: parsed.data.questionId },
    include: { subtest: { select: { testKind: true } } },
  });
  if (!q) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });
  if (q.subtest.testKind !== sub.testKind) {
    return NextResponse.json(
      { error: "Soal tidak sesuai dengan jenis tes" },
      { status: 403 },
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
