import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formsFor, getCfitFromRequest } from "@/lib/cfit/auth";
import { computeCfitSubtestLock } from "@/lib/cfit/lock";
import { cfitBreakRemainingSec, cfitBreakSecBetween } from "@/lib/cfit/breaks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status keseluruhan tes untuk peserta: daftar subtes sesuai bentuk tes,
// progress jawaban, dan status lock/timer tiap subtes.
export async function GET(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const submission = await prisma.cfitSubmission.findUnique({ where: { id: p.sub } });
  if (!submission) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });

  const subtests = await prisma.cfitSubtest.findMany({
    where: { form: { in: formsFor(submission.form as never) } },
    orderBy: { orderIndex: "asc" },
    include: { _count: { select: { questions: { where: { isExample: false } } } } },
  });

  const answers = await prisma.cfitAnswer.findMany({
    where: { submissionId: submission.id },
    select: { question: { select: { subtestId: true, isExample: true } } },
  });
  const answeredBySubtest = new Map<string, number>();
  for (const a of answers) {
    if (a.question.isExample) continue;
    answeredBySubtest.set(
      a.question.subtestId,
      (answeredBySubtest.get(a.question.subtestId) ?? 0) + 1,
    );
  }

  const items = [];
  for (const s of subtests) {
    const lock = await computeCfitSubtestLock({
      submissionId: submission.id,
      subtestId: s.id,
      durationSec: s.durationSec,
    });
    const remainingSec = lock.locked
      ? 0
      : lock.startedAt
        ? Math.max(0, Math.round((lock.startedAt.getTime() + s.durationSec * 1000 - Date.now()) / 1000))
        : s.durationSec;
    items.push({
      code: s.code,
      form: s.form,
      name: s.name,
      description: s.description,
      durationSec: s.durationSec,
      orderIndex: s.orderIndex,
      totalQuestions: s._count.questions,
      answered: answeredBySubtest.get(s.id) ?? 0,
      started: lock.started,
      locked: lock.locked,
      finishReason: lock.finishReason,
      finishedAt: lock.finishedAt,
      remainingSec,
    });
  }

  // Jeda otomatis: subtes berikutnya baru boleh dibuka setelah jeda selesai.
  // Dihitung dari waktu subtes sebelumnya terkunci (server-authoritative).
  const activeIdx = items.findIndex((i) => !i.locked);
  let activeBreak: {
    code: string;
    name: string;
    breakSec: number;
    remainingSec: number;
    formChanged: boolean;
  } | null = null;
  if (activeIdx > 0) {
    const prev = items[activeIdx - 1];
    const active = items[activeIdx];
    if (!active.started && prev.finishedAt) {
      const breakSec = cfitBreakSecBetween(prev.form, active.form);
      activeBreak = {
        code: active.code,
        name: active.name,
        breakSec,
        remainingSec: cfitBreakRemainingSec(prev.finishedAt, breakSec),
        formChanged: prev.form !== active.form,
      };
    }
  }

  return NextResponse.json({
    form: submission.form,
    profileFilled: !!submission.fullName,
    finishedAt: submission.finishedAt,
    subtests: items,
    activeBreak,
  });
}
