import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import {
  parseProgress,
  isSubtestCompleted,
  remainingSeconds,
} from "@/lib/progress";

const Body = z.object({ subtestCode: z.string().min(1) });

/**
 * Marks a subtest as "started" (sets a server-authoritative startedAt the
 * first time the student opens it) and returns the timer state. Idempotent:
 * the timer is only initialised once and cannot be reset by re-calling this.
 */
export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) return NextResponse.json({ error: "Tes sudah selesai" }, { status: 400 });

  const subtest = await prisma.subtest.findUnique({ where: { code: parsed.data.subtestCode } });
  if (!subtest || subtest.testKind !== sub.testKind) {
    return NextResponse.json({ error: "Subtest tidak valid" }, { status: 400 });
  }

  const progress = parseProgress(sub.subtestProgress);
  const now = Date.now();
  let entry = progress[subtest.code];
  let mutated = false;

  if (!entry) {
    entry = { startedAt: now, completedAt: null };
    progress[subtest.code] = entry;
    mutated = true;
  }

  // If the time has already elapsed, lock the subtest now.
  if (entry.completedAt == null && (now - entry.startedAt) / 1000 >= subtest.durationSec) {
    entry.completedAt = now;
    mutated = true;
  }

  if (mutated) {
    await prisma.submission.update({
      where: { id: sub.id },
      data: { subtestProgress: progress as unknown as Prisma.InputJsonValue },
    });
  }

  return NextResponse.json({
    startedAtMs: entry.startedAt,
    durationSec: subtest.durationSec,
    remainingSec: remainingSeconds(entry, subtest.durationSec, now),
    completed: isSubtestCompleted(entry, subtest.durationSec, now),
  });
}
