import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCfitFromRequest } from "@/lib/cfit/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aturan SAMA dengan tes minat-bakat (/api/student/test/violation):
// - pindah tab / keluar fullscreen / screenshot = pelanggaran
// - auto-flag setelah 5 pelanggaran
// - log dibatasi 200 entri terakhir
const VIOLATION_THRESHOLD = 5;
const MAX_LOG_ENTRIES = 200;

const VIOLATION_TYPES = [
  "tab_hidden",
  "fullscreen_exit",
  "screenshot",
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
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sub = await prisma.cfitSubmission.findUnique({
    where: { id: p.sub },
    select: {
      id: true,
      finishedAt: true,
      violationCount: true,
      violationLog: true,
      flaggedCheating: true,
    },
  });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  // Setelah tes selesai kita diam-diam abaikan supaya klien tidak error.
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

  // Server-side dedup (defense in depth): kalau request terakhir terjadi
  // dalam 1.5 detik dari sekarang DAN merupakan event dari grup aksi yang
  // sama (mis. tab_hidden + fullscreen_exit dari satu aksi yang sama),
  // jangan tambah count — cukup log entry untuk audit.
  const SERVER_DEDUP_MS = 1500;
  const SAME_ACTION_GROUPS: string[][] = [
    ["tab_hidden", "fullscreen_exit"],
  ];
  const inSameGroup = (a: string, b: string): boolean => {
    if (a === b) return true;
    return SAME_ACTION_GROUPS.some((g) => g.includes(a) && g.includes(b));
  };
  const last = prevLog[prevLog.length - 1];
  const lastAt = last ? Date.parse(last.at) : 0;
  const nowMs = Date.parse(entry.at);
  const isDup =
    last &&
    Number.isFinite(lastAt) &&
    Number.isFinite(nowMs) &&
    nowMs - lastAt >= 0 &&
    nowMs - lastAt < SERVER_DEDUP_MS &&
    inSameGroup(last.type, entry.type);

  const newLog = [...prevLog, entry].slice(-MAX_LOG_ENTRIES);
  const newCount = isDup ? sub.violationCount : sub.violationCount + 1;
  const newFlagged = sub.flaggedCheating || newCount >= VIOLATION_THRESHOLD;

  await prisma.cfitSubmission.update({
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
