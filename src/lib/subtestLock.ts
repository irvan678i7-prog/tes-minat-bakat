import { prisma } from "@/lib/db";

// Sumber kebenaran lock subtes — dipakai bersama oleh halaman /test, halaman
// /test/[code], dan API answer/finish/heartbeat/violation. Hindari duplikasi
// logika di banyak tempat.
//
// ── TIMER SADAR-JEDA (pause-aware) ────────────────────────────────────────
// DULU: deadline = startedAt + durationSec (jam dinding). Kalau listrik mati
// atau browser tertutup, waktu tetap berjalan → subtes terkunci TIME_UP
// padahal siswa belum mengerjakan.
//
// SEKARANG: yang dihitung adalah `consumedSec`, yaitu akumulasi waktu AKTIF
// siswa di halaman soal. consumedSec bertambah dari:
//   - denyut (POST /api/student/test/heartbeat, tiap ±15 detik),
//   - pengiriman jawaban (POST /api/student/test/answer),
//   - pembukaan/refresh halaman subtes.
//
// Kalau selisih antar-denyut masih wajar (<= HEARTBEAT_TOLERANCE_SEC),
// selisih itu dihitung sebagai waktu mengerjakan. Kalau selisihnya besar
// (browser mati / listrik mati), itu dianggap JEDA: tidak menghabiskan waktu
// subtes, tapi hanya sebanyak PAUSE_BUDGET_SEC per subtes. Lewat dari jatah
// itu, selisihnya kembali dihitung sebagai waktu terpakai supaya jeda tidak
// bisa dipakai untuk mengulur waktu.

export type LockReason = "MANUAL" | "TIME_UP" | "AUTO_FLAG";

// Grace 3 detik sebelum auto-lock supaya jawaban terakhir yang sedang
// di-flush oleh runner (saat ia mendeteksi timeUp) sempat sampai ke
// /api/answer dulu.
export const TIME_UP_GRACE_SEC = 3;
// Dipertahankan untuk kompatibilitas pemakai lama (satuan milidetik).
export const TIME_UP_GRACE_MS = TIME_UP_GRACE_SEC * 1_000;
// Selisih antar-denyut yang masih dianggap "siswa mengerjakan terus".
// Runner mengirim denyut tiap 15 detik → 45 detik memberi toleransi 3x
// denyut untuk jaringan sekolah yang lambat.
export const HEARTBEAT_TOLERANCE_SEC = 45;
// Jatah jeda per subtes yang DIMAAFKAN: 10 menit.
export const PAUSE_BUDGET_SEC = 10 * 60;

export type SubtestLockInfo = {
  // Sudah dibuka siswa minimal sekali? Kalau belum, timer belum jalan.
  started: boolean;
  // Kapan siswa menekan MULAI (dipertahankan apa adanya, untuk audit).
  startedAt: Date | null;
  // Acuan timer UNTUK KLIEN: now - consumedSec. SubtestRunner menghitung
  // remaining = durationSec - (now - serverStartedAt), jadi nilai yang
  // digeser ini membuat hitungan mundur otomatis MELANJUTKAN sisa waktu
  // setelah listrik mati — tanpa perlu mengubah SubtestRunner.tsx.
  timerStartedAt: Date | null;
  // Kapan dikunci. null = belum dikunci.
  finishedAt: Date | null;
  finishReason: LockReason | null;
  // Kalau waktu aktif sudah habis tapi siswa belum klik selesai, lock secara
  // LAZY: kembalikan true di sini & tulis finishedAt di DB.
  locked: boolean;
  // Waktu aktif terpakai & sisanya (detik).
  consumedSec: number;
  remainingSec: number;
  // Statistik jeda untuk pengawas.
  pausedSec: number;
  pauseCount: number;
};

type ProgressTiming = {
  startedAt: Date;
  finishedAt: Date | null;
  finishReason: string | null;
  consumedSec: number;
  lastSeenAt: Date | null;
  pausedSec: number;
  pauseCount: number;
};

export type ProjectedTime = {
  consumedSec: number;
  pausedSec: number;
  pauseCount: number;
  // Selisih detik sejak denyut terakhir.
  gapSec: number;
  // true kalau selisih itu diperlakukan sebagai jeda.
  paused: boolean;
};

/**
 * Hitung waktu terpakai TERKINI dari satu baris SubtestProgress. Fungsi ini
 * MURNI (tidak menulis ke DB) supaya bisa dipakai di halaman server maupun
 * di API tanpa query tambahan.
 */
export function projectSubtestTime(
  p: Pick<
    ProgressTiming,
    "startedAt" | "consumedSec" | "lastSeenAt" | "pausedSec" | "pauseCount"
  >,
  durationSec: number,
  now: Date = new Date(),
): ProjectedTime {
  const last = p.lastSeenAt ?? p.startedAt;
  const gapSec = Math.max(
    0,
    Math.floor((now.getTime() - last.getTime()) / 1000),
  );
  let consumedSec = Math.max(0, p.consumedSec ?? 0);
  let pausedSec = Math.max(0, p.pausedSec ?? 0);
  let pauseCount = Math.max(0, p.pauseCount ?? 0);
  let paused = false;

  if (gapSec <= HEARTBEAT_TOLERANCE_SEC) {
    // Denyut normal → siswa memang sedang mengerjakan.
    consumedSec += gapSec;
  } else {
    // Denyut hilang lama → sesi terputus (mati lampu, tab ditutup, dsb).
    paused = true;
    const budgetLeft = Math.max(0, PAUSE_BUDGET_SEC - pausedSec);
    const forgiven = Math.min(gapSec, budgetLeft);
    pausedSec += forgiven;
    pauseCount += 1;
    // Selisih yang melebihi jatah jeda TETAP dihitung sebagai waktu
    // terpakai — jeda tidak bisa dipakai untuk mengulur waktu.
    consumedSec += gapSec - forgiven;
  }

  consumedSec = Math.min(consumedSec, durationSec + TIME_UP_GRACE_SEC);
  return { consumedSec, pausedSec, pauseCount, gapSec, paused };
}

function notStartedInfo(durationSec: number): SubtestLockInfo {
  return {
    started: false,
    startedAt: null,
    timerStartedAt: null,
    finishedAt: null,
    finishReason: null,
    locked: false,
    consumedSec: 0,
    remainingSec: durationSec,
    pausedSec: 0,
    pauseCount: 0,
  };
}

function lockedInfo(p: ProgressTiming, durationSec: number): SubtestLockInfo {
  return {
    started: true,
    startedAt: p.startedAt,
    timerStartedAt: null,
    finishedAt: p.finishedAt,
    finishReason: (p.finishReason as LockReason | null) ?? null,
    locked: true,
    consumedSec: Math.min(Math.max(0, p.consumedSec ?? 0), durationSec),
    remainingSec: 0,
    pausedSec: Math.max(0, p.pausedSec ?? 0),
    pauseCount: Math.max(0, p.pauseCount ?? 0),
  };
}

function runningInfo(
  p: ProgressTiming,
  projected: ProjectedTime,
  durationSec: number,
  now: Date,
): SubtestLockInfo {
  return {
    started: true,
    startedAt: p.startedAt,
    timerStartedAt: new Date(now.getTime() - projected.consumedSec * 1000),
    finishedAt: null,
    finishReason: null,
    locked: false,
    consumedSec: projected.consumedSec,
    remainingSec: Math.max(0, durationSec - projected.consumedSec),
    pausedSec: projected.pausedSec,
    pauseCount: projected.pauseCount,
  };
}

/**
 * Hitung lock info untuk satu subtes TANPA menambah denyut. Sekaligus
 * auto-finish (write ke DB) kalau waktu AKTIF sudah habis tapi belum
 * dikunci secara eksplisit. Idempoten.
 */
export async function computeSubtestLock(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<SubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const progress = await prisma.subtestProgress.findUnique({
    where: { submissionId_subtestId: { submissionId, subtestId } },
  });
  if (!progress) return notStartedInfo(durationSec);
  // Sudah dikunci eksplisit → langsung pakai value DB.
  if (progress.finishedAt) return lockedInfo(progress, durationSec);

  const now = new Date();
  const projected = projectSubtestTime(progress, durationSec, now);
  if (projected.consumedSec >= durationSec + TIME_UP_GRACE_SEC) {
    // Waktu aktif habis → auto-finish TIME_UP. Pakai updateMany + filter
    // finishedAt:null supaya race tidak menimpa MANUAL yang lebih awal.
    const consumedSec = Math.min(projected.consumedSec, durationSec);
    const updated = await prisma.subtestProgress.updateMany({
      where: { id: progress.id, finishedAt: null },
      data: {
        finishedAt: now,
        finishReason: "TIME_UP",
        consumedSec,
        pausedSec: projected.pausedSec,
        pauseCount: projected.pauseCount,
        lastSeenAt: now,
      },
    });
    if (updated.count > 0) {
      return lockedInfo(
        {
          ...progress,
          finishedAt: now,
          finishReason: "TIME_UP",
          consumedSec,
          pausedSec: projected.pausedSec,
          pauseCount: projected.pauseCount,
        },
        durationSec,
      );
    }
    // Race: thread lain sudah mengunci (mis. MANUAL). Refetch.
    const refetched = await prisma.subtestProgress.findUnique({
      where: { id: progress.id },
    });
    return lockedInfo(
      {
        ...progress,
        finishedAt: refetched?.finishedAt ?? now,
        finishReason: refetched?.finishReason ?? "TIME_UP",
        consumedSec: refetched?.consumedSec ?? consumedSec,
        pausedSec: refetched?.pausedSec ?? projected.pausedSec,
        pauseCount: refetched?.pauseCount ?? projected.pauseCount,
      },
      durationSec,
    );
  }
  return runningInfo(progress, projected, durationSec, now);
}

/**
 * DENYUT: catat bahwa siswa masih ada di halaman subtes, lalu simpan waktu
 * aktif + statistik jeda. Kalau waktu aktif sudah habis, sekalian kunci.
 *
 * Aman dipanggil kapan saja: kalau subtes belum dimulai (belum ada baris
 * SubtestProgress), fungsi ini TIDAK membuat baris baru dan tidak
 * menghabiskan waktu — jadi layar instruksi/contoh soal tetap gratis.
 */
export async function touchSubtest(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<SubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const progress = await prisma.subtestProgress.findUnique({
    where: { submissionId_subtestId: { submissionId, subtestId } },
  });
  if (!progress) return notStartedInfo(durationSec);
  if (progress.finishedAt) return lockedInfo(progress, durationSec);

  const now = new Date();
  const projected = projectSubtestTime(progress, durationSec, now);
  const timeUp = projected.consumedSec >= durationSec + TIME_UP_GRACE_SEC;
  const consumedSec = Math.min(projected.consumedSec, durationSec);

  await prisma.subtestProgress.updateMany({
    where: { id: progress.id, finishedAt: null },
    data: {
      consumedSec,
      pausedSec: projected.pausedSec,
      pauseCount: projected.pauseCount,
      lastSeenAt: now,
      ...(timeUp ? { finishedAt: now, finishReason: "TIME_UP" } : {}),
    },
  });

  const merged: ProgressTiming = {
    ...progress,
    consumedSec,
    pausedSec: projected.pausedSec,
    pauseCount: projected.pauseCount,
    lastSeenAt: now,
  };
  if (timeUp) {
    return lockedInfo(
      { ...merged, finishedAt: now, finishReason: "TIME_UP" },
      durationSec,
    );
  }
  return runningInfo(merged, { ...projected, consumedSec }, durationSec, now);
}

/**
 * Tandai subtes dimulai (upsert progress). Kalau sudah dikunci, jangan ubah
 * startedAt — kembalikan lock info apa adanya. Kalau sudah dimulai, sekalian
 * catat denyut: membuka ulang halaman setelah mati lampu akan tercatat
 * sebagai JEDA, bukan sebagai waktu mengerjakan.
 */
export async function ensureSubtestStarted(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<SubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const existing = await touchSubtest({ submissionId, subtestId, durationSec });
  if (existing.started) return existing;

  const now = new Date();
  await prisma.subtestProgress.upsert({
    where: { submissionId_subtestId: { submissionId, subtestId } },
    create: { submissionId, subtestId, startedAt: now, lastSeenAt: now },
    update: {},
  });
  return computeSubtestLock({ submissionId, subtestId, durationSec });
}
