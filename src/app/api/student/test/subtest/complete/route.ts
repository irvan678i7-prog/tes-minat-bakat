import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { parseProgress } from "@/lib/progress";

const Body = z.object({ subtestCode: z.string().min(1) });

/**
 * Locks a subtest as completed (either the student finished early or the
 * client timer hit zero). Once completed the subtest is review-only.
 */
export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) return NextResponse.json({ ok: true });

  const subtest = await prisma.subtest.findUnique({ where: { code: parsed.data.subtestCode } });
  if (!subtest || subtest.testKind !== sub.testKind) {
    return NextResponse.json({ error: "Subtest tidak valid" }, { status: 400 });
  }

  const progress = parseProgress(sub.subtestProgress);
  const now = Date.now();
  const entry = progress[subtest.code] ?? { startedAt: now, completedAt: null };
  if (entry.completedAt == null) entry.completedAt = now;
  progress[subtest.code] = entry;

  await prisma.submission.update({
    where: { id: sub.id },
    data: { subtestProgress: progress as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true, completed: true });
}
