import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { PAUSE_BUDGET_SEC, touchSubtest } from "@/lib/subtestLock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  subtestCode: z.string().min(1),
});

// DENYUT TIMER — dipanggil browser siswa tiap ±15 detik selama halaman soal
// terbuka (lihat src/components/student/TimerHeartbeat.tsx).
//
// Fungsinya: memberi tahu server "saya masih mengerjakan". Server menambah
// SubtestProgress.consumedSec sebesar selisih sejak denyut terakhir. Kalau
// denyut berhenti lama (mati lampu / browser tertutup), selisih itu dianggap
// JEDA dan tidak menghabiskan waktu subtes — maksimal 10 menit per subtes.
//
// Endpoint ini TIDAK memulai timer. Kalau subtes belum ditekan MULAI, denyut
// diabaikan (started: false), jadi layar instruksi & contoh soal tetap tidak
// memakan waktu.
export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [sub, subtest] = await Promise.all([
    prisma.submission.findUnique({
      where: { id: student.sub },
      select: { id: true, testKind: true, finishedAt: true },
    }),
    prisma.subtest.findUnique({
      where: { code: parsed.data.subtestCode },
      select: { id: true, testKind: true, durationSec: true },
    }),
  ]);
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) {
    return NextResponse.json({ ok: true, locked: true, alreadyFinished: true });
  }
  if (!subtest || subtest.testKind !== sub.testKind) {
    return NextResponse.json({ error: "Subtest tidak valid" }, { status: 400 });
  }

  const info = await touchSubtest({
    submissionId: sub.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });

  return NextResponse.json({
    ok: true,
    started: info.started,
    locked: info.locked,
    finishReason: info.finishReason,
    remainingSec: info.remainingSec,
    consumedSec: info.consumedSec,
    // Statistik jeda — berguna untuk debugging di lapangan.
    pausedSec: info.pausedSec,
    pauseCount: info.pauseCount,
    pauseBudgetSec: PAUSE_BUDGET_SEC,
  });
}
