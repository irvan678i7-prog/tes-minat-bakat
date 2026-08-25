import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCfitFromRequest } from "@/lib/cfit/auth";
import { touchCfitSubtest } from "@/lib/cfit/lock";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ subtestCode: z.string().min(1) });

// DENYUT TES IQ. Tanpa ini, timer sadar-jeda tidak punya sumber "peserta
// masih mengerjakan" dan seluruh waktu di halaman soal akan terlihat sebagai
// satu jeda panjang.
//
// RATE LIMIT: denyut normal 1 per 15 detik → 12 per menit sudah memberi ruang
// untuk retry & refresh. Kuncinya memakai ID SESI (p.sub), BUKAN IP: satu lab
// sekolah biasanya keluar dari SATU IP NAT, jadi kunci per-IP akan menghukum
// seluruh kelas sekaligus.
const HEARTBEAT_LIMIT = 12;
const HEARTBEAT_WINDOW_MS = 60_000;

// Hemat tulis DB: denyut yang datang lebih rapat dari 10 detik cukup dijawab
// dari proyeksi, tanpa UPDATE. Akuntansi waktu tetap benar karena lastSeenAt
// yang lama dipertahankan.
const MIN_WRITE_GAP_SEC = 10;

export async function POST(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(
    `cfit-heartbeat:${p.sub}`,
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
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const submission = await prisma.cfitSubmission.findUnique({
    where: { id: p.sub },
    select: { id: true, finishedAt: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  }
  if (submission.finishedAt) return NextResponse.json({ ok: true, finished: true });

  const subtest = await prisma.cfitSubtest.findUnique({
    where: { code: parsed.data.subtestCode },
    select: { id: true, durationSec: true },
  });
  if (!subtest) {
    return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });
  }

  // touchCfitSubtest TIDAK membuat baris progress baru: kalau subtes belum
  // dimulai (masih di layar instruksi/contoh soal), denyut tidak
  // menghabiskan waktu apa pun.
  const lock = await touchCfitSubtest({
    submissionId: submission.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
    minWriteGapSec: MIN_WRITE_GAP_SEC,
  });

  return NextResponse.json({
    ok: true,
    started: lock.started,
    locked: lock.locked,
    finishReason: lock.finishReason,
    remainingSec: lock.remainingSec,
    pausedSec: lock.pausedSec,
    pauseCount: lock.pauseCount,
  });
}
