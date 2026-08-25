import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
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

// RATE LIMIT: denyut normal 4 per menit (tiap 15 detik). 12 per menit memberi
// ruang lega untuk retry dan refresh, tapi menutup penyalahgunaan.
//
// Kuncinya memakai ID SESI, BUKAN IP. Satu lab sekolah biasanya keluar dari
// SATU IP NAT — kunci per-IP akan membuat siswa ke-13 diblokir gara-gara
// denyut teman-temannya sendiri.
const HEARTBEAT_LIMIT = 12;
const HEARTBEAT_WINDOW_MS = 60_000;

// HEMAT TULIS DB. Ini yang menjawab hitungan biaya di audit: 40 siswa aktif
// ≈ 2,7 tulis/detik terus-menerus. Denyut yang datang lebih rapat dari 10
// detik cukup dijawab dari proyeksi tanpa UPDATE — akuntansi waktu tetap
// benar karena lastSeenAt yang lama TIDAK ikut digeser.
const MIN_WRITE_GAP_SEC = 10;

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(
    `student-heartbeat:${student.sub}`,
    HEARTBEAT_LIMIT,
    HEARTBEAT_WINDOW_MS,
  );
  if (!rl.ok) {
    const retry = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Denyut terlalu sering." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

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
    minWriteGapSec: MIN_WRITE_GAP_SEC,
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
