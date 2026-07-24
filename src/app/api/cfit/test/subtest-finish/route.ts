import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formsFor, getCfitFromRequest } from "@/lib/cfit/auth";
import { computeCfitSubtestLock } from "@/lib/cfit/lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ subtestCode: z.string().min(1) });

// Kunci satu subtes secara manual (tombol "Selesai"). Idempoten — kalau
// sudah terkunci (mis. TIME_UP), status yang ada dipertahankan.
export async function POST(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

  const submission = await prisma.cfitSubmission.findUnique({ where: { id: p.sub } });
  if (!submission) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });

  const subtest = await prisma.cfitSubtest.findUnique({ where: { code: parsed.data.subtestCode } });
  if (!subtest || !formsFor(submission.form as never).includes(subtest.form as never)) {
    return NextResponse.json({ error: "Subtes tidak ditemukan untuk bentuk tes ini." }, { status: 404 });
  }

  // updateMany + filter finishedAt:null supaya tidak menimpa TIME_UP yang
  // sudah lebih dulu terjadi (race-safe, sama seperti minat-bakat).
  await prisma.cfitSubtestProgress.updateMany({
    where: { submissionId: submission.id, subtestId: subtest.id, finishedAt: null },
    data: { finishedAt: new Date(), finishReason: "MANUAL" },
  });

  const lock = await computeCfitSubtestLock({
    submissionId: submission.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });
  return NextResponse.json({ ok: true, locked: lock.locked, finishReason: lock.finishReason });
}
