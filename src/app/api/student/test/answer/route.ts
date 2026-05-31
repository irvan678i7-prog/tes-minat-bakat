import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { parseProgress, isSubtestCompleted } from "@/lib/progress";

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

  const q = await prisma.question.findUnique({
    where: { id: parsed.data.questionId },
    include: { subtest: { select: { code: true, durationSec: true } } },
  });
  if (!q) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  // Reject edits to a subtest whose timer has elapsed or was finished early.
  // Fail-open: only block when we can clearly determine completion.
  const progress = parseProgress(sub.subtestProgress);
  if (isSubtestCompleted(progress[q.subtest.code], q.subtest.durationSec)) {
    return NextResponse.json({ error: "Subtes sudah selesai" }, { status: 409 });
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
