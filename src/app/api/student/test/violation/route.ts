import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";

// Maximum violations the student can rack up before we auto-flag them.
export const VIOLATION_THRESHOLD = 5;
// Cap the log so we don't bloat the row indefinitely.
const MAX_LOG_ENTRIES = 200;

const VIOLATION_TYPES = [
  "tab_hidden",
  "blur",
  "fullscreen_exit",
  "copy",
  "paste",
  "cut",
  "context_menu",
  "shortcut",
] as const;

const Body = z.object({
  type: z.enum(VIOLATION_TYPES),
  subtestCode: z.string().max(64).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
});

type LogEntry = {
  type: (typeof VIOLATION_TYPES)[number];
  at: string;
  subtestCode?: string | null;
};

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sub = await prisma.submission.findUnique({
    where: { id: student.sub },
    select: {
      id: true,
      finishedAt: true,
      violationCount: true,
      violationLog: true,
      flaggedCheating: true,
    },
  });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  // Once the test is finished we silently ignore so the client doesn't error.
  if (sub.finishedAt) {
    return NextResponse.json({
      count: sub.violationCount,
      flagged: sub.flaggedCheating,
      threshold: VIOLATION_THRESHOLD,
      ignored: true,
    });
  }

  const prevLog: LogEntry[] = Array.isArray(sub.violationLog)
    ? (sub.violationLog as unknown as LogEntry[])
    : [];
  const entry: LogEntry = {
    type: parsed.data.type,
    at: parsed.data.occurredAt ?? new Date().toISOString(),
    subtestCode: parsed.data.subtestCode ?? null,
  };
  const newLog = [...prevLog, entry].slice(-MAX_LOG_ENTRIES);
  const newCount = sub.violationCount + 1;
  const newFlagged = sub.flaggedCheating || newCount >= VIOLATION_THRESHOLD;

  await prisma.submission.update({
    where: { id: sub.id },
    data: {
      violationCount: newCount,
      violationLog: newLog as unknown as Prisma.InputJsonValue,
      flaggedCheating: newFlagged,
    },
  });

  return NextResponse.json({
    count: newCount,
    flagged: newFlagged,
    threshold: VIOLATION_THRESHOLD,
  });
}
