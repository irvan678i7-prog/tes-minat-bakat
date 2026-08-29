import { prisma } from "@/lib/db";

// Lock per-subtes CFIT — cermin dari src/lib/subtestLock.ts milik
// minat-bakat, tapi memakai tabel CfitSubtestProgress.
//
// ── TIMER SADAR-JEDA (pause-aware) ──────────────────────────────────
// DULU: deadline = startedAt + durationSec (jam dinding). Kalau listrik mati
// atau browser tertutup, waktu tes IQ TETAP berjalan → subtes terkunci
// TIME_UP padahal peserta belum mengerjakan. Timer sadar-jeda sudah dipasang
// untuk minat-bakat, tapi tes IQ dulu TIDAK ikut diperbaiki — padahal bug-nya
// sama persis, dan tes IQ justru dipakai berbarengan dengan minat-bakat.
//
// SEKARANG: yang dihitung adalah `consumedSec`, yaitu akumulasi waktu AKTIF
// peserta di halaman soal. consumedSec bertambah dari:
//   - denyut (POST /api/cfit/test/heartbeat, tiap ±15 detik),
//   - pengiriman jawaban (POST /api/cfit/test/answer),
//   - pembukaan/refresh halaman subtes (POST /api/cfit/test/subtest-start).
//
// Kalau selisih antar-denyut masih wajar (<= CFIT_HEARTBEAT_TOLERANCE_SEC),
// selisih itu dihitung sebagai waktu mengerjakan. Kalau selisihnya besar
// (listrik mati / tab ditutup), itu dianggap JEDA: tidak menghabiskan waktu
// subtes, tapi hanya sebanyak CFIT_PAUSE_BUDGET_SEC per subtes. Lewat dari
// jatah itu, selisihnya kembali dihitung sebagai waktu terpakai supaya jeda
// tidak bisa dipakai untuk mengulur waktu.
//
// CATATAN JATAH JEDA: sengaja 5 menit, LEBIH KECIL dari minat-bakat (10
// menit). Satu subtes CFIT hanya 150-240 detik, jadi jatah 10 menit akan
// lebih panjang daripada waktu tesnya sendiri.
//
// ── KALAU MIGRASI 0009 BELUM DI-APPLY ──────────────────────────────
// Kolom consumedSec/lastSeenAt/pausedSec/pauseCount belum ada → Prisma akan
// melempar P2022 di tengah tes. Itu jauh lebih buruk daripada bug timer, jadi
// modul ini punya jalur "legacy": kalau kolomnya tidak ada, tes IQ tetap
// jalan dengan perilaku jam dinding LAMA dan menulis peringatan ke log server.

export type CfitLockReason = "MANUAL" | "TIME_UP" | "AUTO_FLAG";

// Grace 3 detik sebelum auto-lock supaya jawaban terakhir yang sedang
// di-flush klien saat timeUp masih sempat tersimpan.
export const CFIT_TIME_UP_GRACE_SEC = 3;
export const CFIT_TIME_UP_GRACE_MS = CFIT_TIME_UP_GRACE_SEC * 1_000;
// Selisih antar-denyut yang masih dianggap "peserta mengerjakan terus".
// Klien mengirim denyut tiap 15 detik → 45 detik memberi toleransi 3x denyut
// untuk jaringan sekolah yang lambat.
export const CFIT_HEARTBEAT_TOLERANCE_SEC = 45;
// Jatah jeda per subtes yang DIMAAFKAN: 5 menit.
export const CFIT_PAUSE_BUDGET_SEC = 5 * 60;

export type CfitSubtestLockInfo = {
  // Sudah dibuka peserta minimal sekali? Kalau belum, timer belum jalan.
  started: boolean;
  // Kapan peserta menekan MULAI (dipertahankan apa adanya, untuk audit).
  startedAt: Date | null;
  // Acuan timer UNTUK KLIEN: now - consumedSec. Halaman soal menghitung
  // sisa waktu dari titik ini, jadi hitungan mundur otomatis MELANJUTKAN
  // sisa waktu setelah listrik mati.
  timerStartedAt: Date | null;
  finishedAt: Date | null;
  finishReason: CfitLockReason | null;
  locked: boolean;
  // Waktu aktif terpakai & sisanya (detik).
  consumedSec: number;
  remainingSec: number;
  // Statistik jeda untuk pengawas.
  pausedSec: number;
  pauseCount: number;
};

type CfitProgressTiming = {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  finishReason: string | null;
  consumedSec: number;
  lastSeenAt: Date | null;
  pausedSec: number;
  pauseCount: number;
};

export type CfitProjectedTime = {
  consumedSec: number;
  pausedSec: number;
  pauseCount: number;
  // Selisih detik sejak denyut terakhir.
  gapSec: number;
  // true kalau selisih itu diperlakukan sebagai jeda.
  paused: boolean;
};

/**
 * Hitung waktu terpakai TERKINI dari satu baris CfitSubtestProgress. Fungsi
 * ini MURNI (tidak menulis ke DB).
 */
export function projectCfitSubtestTime(
  p: Pick<
    CfitProgressTiming,
    "startedAt" | "consumedSec" | "lastSeenAt" | "pausedSec" | "pauseCount"
  >,
  durationSec: number,
  now: Date = new Date(),
): CfitProjectedTime {
  const last = p.lastSeenAt ?? p.startedAt;
  const gapSec = Math.max(
    0,
    Math.floor((now.getTime() - last.getTime()) / 1000),
  );
  let consumedSec = Math.max(0, p.consumedSec ?? 0);
  let pausedSec = Math.max(0, p.pausedSec ?? 0);
  let pauseCount = Math.max(0, p.pauseCount ?? 0);
  let paused = false;

  if (gapSec <= CFIT_HEARTBEAT_TOLERANCE_SEC) {
    // Denyut normal → peserta memang sedang mengerjakan.
    consumedSec += gapSec;
  } else {
    // Denyut hilang lama → sesi terputus (mati lampu, tab ditutup, dsb).
    paused = true;
    const budgetLeft = Math.max(0, CFIT_PAUSE_BUDGET_SEC - pausedSec);
    const forgiven = Math.min(gapSec, budgetLeft);
    pausedSec += forgiven;
    pauseCount += 1;
    // Selisih yang melebihi jatah jeda TETAP dihitung sebagai waktu terpakai.
    consumedSec += gapSec - forgiven;
  }

  consumedSec = Math.min(consumedSec, durationSec + CFIT_TIME_UP_GRACE_SEC);
  return { consumedSec, pausedSec, pauseCount, gapSec, paused };
}

function notStartedInfo(durationSec: number): CfitSubtestLockInfo {
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

function lockedInfo(
  p: Omit<CfitProgressTiming, "id">,
  durationSec: number,
): CfitSubtestLockInfo {
  return {
    started: true,
    startedAt: p.startedAt,
    timerStartedAt: null,
    finishedAt: p.finishedAt,
    finishReason: (p.finishReason as CfitLockReason | null) ?? null,
    locked: true,
    consumedSec: Math.min(Math.max(0, p.consumedSec ?? 0), durationSec),
    remainingSec: 0,
    pausedSec: Math.max(0, p.pausedSec ?? 0),
    pauseCount: Math.max(0, p.pauseCount ?? 0),
  };
}

function runningInfo(
  p: Omit<CfitProgressTiming, "id">,
  projected: CfitProjectedTime,
  durationSec: number,
  now: Date,
): CfitSubtestLockInfo {
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

// ──────────────────────────────────────────────────────────────────────────
// Jalur aman kalau migrasi 0009 belum di-apply
// ──────────────────────────────────────────────────────────────────────────

function isMissingPauseColumn(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2022" || code === "P2021") return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /consumedSec|lastSeenAt|pausedSec|pauseCount|does not exist in the current database/i.test(
    msg,
  );
}

let warnedLegacy = false;
function warnLegacyOnce(where: string): void {
  if (warnedLegacy) return;
  warnedLegacy = true;
  console.warn(
    `[cfit/lock] (${where}) Kolom timer sadar-jeda belum ada di database. ` +
      "Tes IQ sementara memakai timer jam dinding LAMA (mati lampu tetap " +
      "menghabiskan waktu subtes). Apply prisma/sql/0009_cfit_pause_and_resume.sql.",
  );
}

type ProgressRead = { row: CfitProgressTiming | null; legacy: boolean };

async function readProgress(
  submissionId: string,
  subtestId: string,
): Promise<ProgressRead> {
  try {
    const row = await prisma.cfitSubtestProgress.findUnique({
      where: { submissionId_subtestId: { submissionId, subtestId } },
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        finishReason: true,
        consumedSec: true,
        lastSeenAt: true,
        pausedSec: true,
        pauseCount: true,
      },
    });
    return { row, legacy: false };
  } catch (err) {
    if (!isMissingPauseColumn(err)) throw err;
    warnLegacyOnce("readProgress");
    const row = await prisma.cfitSubtestProgress.findUnique({
      where: { submissionId_subtestId: { submissionId, subtestId } },
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        finishReason: true,
      },
    });
    return {
      row: row
        ? {
            ...row,
            consumedSec: 0,
            lastSeenAt: null,
            pausedSec: 0,
            pauseCount: 0,
          }
        : null,
      legacy: true,
    };
  }
}

/** Perilaku LAMA (jam dinding) — hanya dipakai kalau kolom jeda belum ada. */
async function legacyLock(
  row: CfitProgressTiming | null,
  durationSec: number,
): Promise<CfitSubtestLockInfo> {
  if (!row) return notStartedInfo(durationSec);
  if (row.finishedAt) return lockedInfo({ ...row, consumedSec: durationSec }, durationSec);

  const deadline = new Date(row.startedAt.getTime() + durationSec * 1000);
  const nowMs = Date.now();
  if (nowMs >= deadline.getTime() + CFIT_TIME_UP_GRACE_MS) {
    await prisma.cfitSubtestProgress.updateMany({
      where: { id: row.id, finishedAt: null },
      data: { finishedAt: deadline, finishReason: "TIME_UP" },
    });
    return lockedInfo(
      {
        ...row,
        finishedAt: deadline,
        finishReason: "TIME_UP",
        consumedSec: durationSec,
      },
      durationSec,
    );
  }
  const consumedSec = Math.max(
    0,
    Math.floor((nowMs - row.startedAt.getTime()) / 1000),
  );
  return {
    started: true,
    startedAt: row.startedAt,
    timerStartedAt: row.startedAt,
    finishedAt: null,
    finishReason: null,
    locked: false,
    consumedSec,
    remainingSec: Math.max(0, durationSec - consumedSec),
    pausedSec: 0,
    pauseCount: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// API utama
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hitung lock info untuk satu subtes CFIT TANPA menambah denyut. Sekaligus
 * auto-finish (write ke DB) kalau waktu AKTIF sudah habis tapi belum dikunci
 * eksplisit. Idempoten.
 */
export async function computeCfitSubtestLock(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<CfitSubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const { row, legacy } = await readProgress(submissionId, subtestId);
  if (legacy) return legacyLock(row, durationSec);
  if (!row) return notStartedInfo(durationSec);
  if (row.finishedAt) return lockedInfo(row, durationSec);

  const now = new Date();
  const projected = projectCfitSubtestTime(row, durationSec, now);
  if (projected.consumedSec >= durationSec + CFIT_TIME_UP_GRACE_SEC) {
    // Waktu aktif habis → auto-finish TIME_UP. Pakai updateMany + filter
    // finishedAt:null supaya race tidak menimpa MANUAL yang lebih awal.
    const consumedSec = Math.min(projected.consumedSec, durationSec);
    const updated = await prisma.cfitSubtestProgress.updateMany({
      where: { id: row.id, finishedAt: null },
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
          ...row,
          finishedAt: now,
          finishReason: "TIME_UP",
          consumedSec,
          pausedSec: projected.pausedSec,
          pauseCount: projected.pauseCount,
        },
        durationSec,
      );
    }
    // Race: proses lain sudah mengunci (mis. MANUAL). Refetch.
    const refetched = await readProgress(submissionId, subtestId);
    return lockedInfo(
      {
        ...row,
        finishedAt: refetched.row?.finishedAt ?? now,
        finishReason: refetched.row?.finishReason ?? "TIME_UP",
        consumedSec: refetched.row?.consumedSec ?? consumedSec,
        pausedSec: refetched.row?.pausedSec ?? projected.pausedSec,
        pauseCount: refetched.row?.pauseCount ?? projected.pauseCount,
      },
      durationSec,
    );
  }
  return runningInfo(row, projected, durationSec, now);
}

/**
 * DENYUT: catat bahwa peserta masih ada di halaman subtes, lalu simpan waktu
 * aktif + statistik jeda. Kalau waktu aktif sudah habis, sekalian kunci.
 *
 * Aman dipanggil kapan saja: kalau subtes belum dimulai (belum ada baris
 * CfitSubtestProgress), fungsi ini TIDAK membuat baris baru dan tidak
 * menghabiskan waktu — jadi layar instruksi/contoh soal tetap gratis.
 *
 * `minWriteGapSec` (opsional) menekan biaya tulis DB: kalau denyut datang
 * lebih rapat dari nilai ini dan waktu belum habis, proyeksi tetap dihitung
 * tapi TIDAK ditulis. Akuntansi tetap benar karena lastSeenAt lama
 * dipertahankan — denyut berikutnya menghitung selisih dari titik yang sama.
 */
export async function touchCfitSubtest(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
  minWriteGapSec?: number;
}): Promise<CfitSubtestLockInfo> {
  const { submissionId, subtestId, durationSec, minWriteGapSec = 0 } = args;
  const { row, legacy } = await readProgress(submissionId, subtestId);
  if (legacy) return legacyLock(row, durationSec);
  if (!row) return notStartedInfo(durationSec);
  if (row.finishedAt) return lockedInfo(row, durationSec);

  const now = new Date();
  const projected = projectCfitSubtestTime(row, durationSec, now);
  const timeUp = projected.consumedSec >= durationSec + CFIT_TIME_UP_GRACE_SEC;
  const consumedSec = Math.min(projected.consumedSec, durationSec);

  if (!timeUp && minWriteGapSec > 0 && projected.gapSec < minWriteGapSec) {
    return runningInfo(row, projected, durationSec, now);
  }

  await prisma.cfitSubtestProgress.updateMany({
    where: { id: row.id, finishedAt: null },
    data: {
      consumedSec,
      pausedSec: projected.pausedSec,
      pauseCount: projected.pauseCount,
      lastSeenAt: now,
      ...(timeUp ? { finishedAt: now, finishReason: "TIME_UP" } : {}),
    },
  });

  const merged: CfitProgressTiming = {
    ...row,
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
 * Tandai subtes dimulai (upsert). Tidak mengubah startedAt yang sudah ada.
 * Kalau subtes sudah dimulai, sekalian catat denyut: membuka ulang halaman
 * setelah mati lampu tercatat sebagai JEDA, bukan waktu mengerjakan.
 */
export async function ensureCfitSubtestStarted(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
}): Promise<CfitSubtestLockInfo> {
  const { submissionId, subtestId, durationSec } = args;
  const existing = await touchCfitSubtest({ submissionId, subtestId, durationSec });
  if (existing.started) return existing;

  const now = new Date();
  try {
    await prisma.cfitSubtestProgress.upsert({
      where: { submissionId_subtestId: { submissionId, subtestId } },
      create: { submissionId, subtestId, startedAt: now, lastSeenAt: now },
      update: {},
    });
  } catch (err) {
    if (!isMissingPauseColumn(err)) throw err;
    warnLegacyOnce("ensureCfitSubtestStarted");
    await prisma.cfitSubtestProgress.upsert({
      where: { submissionId_subtestId: { submissionId, subtestId } },
      create: { submissionId, subtestId, startedAt: now },
      update: {},
    });
  }
  return computeCfitSubtestLock({ submissionId, subtestId, durationSec });
}

/**
 * Penilaian jawaban CFIT. `correct` di bank soal disimpan sebagai string
 * atau array string (Conditions bisa menuntut lebih dari satu jawaban).
 * Benar = himpunan jawaban peserta sama persis dengan himpunan kunci.
 */
export function isCfitAnswerCorrect(selected: unknown, correct: unknown): boolean {
  const norm = (v: unknown): string[] =>
    (Array.isArray(v) ? v : [v])
      .map((x) => String(x).trim().toLowerCase())
      .filter((x) => x.length > 0)
      .sort();
  const sel = norm(selected);
  const cor = norm(correct);
  if (sel.length === 0 || cor.length === 0) return false;
  return sel.length === cor.length && sel.every((v, i) => v === cor[i]);
}
