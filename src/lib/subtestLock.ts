import { prisma } from "@/lib/db";

// Sumber kebenaran lock subtes — dipakai bersama oleh halaman /test, halaman
// /test/[code], dan API answer/finish/heartbeat/violation. Hindari duplikasi
// logika di banyak tempat.
//
// TIMER JAM DINDING MURNI
//
// Waktu terpakai satu subtes = selisih apa adanya antara sekarang dan
// startedAt. Tidak ada akumulasi dari denyut, dan tidak ada pemaafan jeda.
//
// RIWAYAT & ALASAN: sebelumnya yang dihitung adalah waktu AKTIF hasil
// akumulasi denyut, dan selisih besar antar-denyut dimaafkan sebagai JEDA
// (maksimal PAUSE_BUDGET_SEC per subtes) supaya mati lampu tidak
// menghanguskan waktu siswa.
//
// Model itu ternyata bisa dipakai MENAMBAH waktu. Di mata server, "mati
// lampu" dan "sengaja memutus jaringan" terlihat sama persis: denyut
// berhenti. Siswa cukup memutus jaringan lebih lama dari
// HEARTBEAT_TOLERANCE_SEC lalu memuat ulang halaman, dan selisih itu tidak
// dihitung — diulang terus sampai jatah jeda habis. Angka di layar pun ikut
// melompat NAIK tiap kali dimuat ulang, karena klien menghitung jam dinding
// sementara server memaafkan.
//
// Dengan jam dinding murni, hasilnya TIDAK BISA dipengaruhi siswa: memuat
// ulang, memutus jaringan, menutup tab, atau mengubah jam perangkat tidak
// mengubah waktu terpakai sedikit pun.
//
// KOMPENSASI UNTUK MATI LAMPU SUNGGUHAN: `pausedSec` & `pauseCount` TETAP
// dicatat dan wajib ditampilkan ke admin (lihat /api/admin/pause-report dan
// tab "Jeda & Kunci"). Perannya sekarang justru lebih penting: pengawas yang
// menilai apakah sebuah jeda layak diberi waktu tambahan lewat tombol
// "+ WAKTU" (/api/admin/subtest-unlock dengan extraSec).

export type LockReason = "MANUAL" | "TIME_UP" | "AUTO_FLAG";

// Grace 3 detik sebelum auto-lock supaya jawaban terakhir yang sedang
// di-flush oleh runner (saat ia mendeteksi timeUp) sempat sampai ke
// /api/answer dulu.
export const TIME_UP_GRACE_SEC = 3;
// Dipertahankan untuk kompatibilitas pemakai lama (satuan milidetik).
export const TIME_UP_GRACE_MS = TIME_UP_GRACE_SEC * 1_000;
// Selisih antar-denyut yang masih dianggap "siswa mengerjakan terus".
// Runner mengirim denyut tiap 15 detik → 45 detik memberi toleransi 3x
// denyut untuk jaringan sekolah yang lambat. Sekarang ambang ini hanya
// MENANDAI jeda untuk statistik pengawas, tidak lagi menghitung waktu.
export const HEARTBEAT_TOLERANCE_SEC = 45;
// Jatah jeda per subtes. TIDAK LAGI dipakai untuk menghitung waktu — timer
// sudah jam dinding murni. Dipertahankan sebagai konstanta acuan bagi modul
// lain yang mengimpornya.
export const PAUSE_BUDGET_SEC = 10 * 60;

export type SubtestLockInfo = {
  // Sudah dibuka siswa minimal sekali? Kalau belum, timer belum jalan.
  started: boolean;
  // Kapan siswa menekan MULAI (dipertahankan apa adanya, untuk audit).
  startedAt: Date | null;
  // Acuan timer UNTUK KLIEN: now - consumedSec. Dengan jam dinding murni
  // nilainya setara dengan startedAt. Dipertahankan supaya pemakai lama
  // tidak rusak; sumber utama timer klien sekarang adalah remainingSec.
  timerStartedAt: Date | null;
  // Kapan dikunci. null = belum dikunci.
  finishedAt: Date | null;
  finishReason: LockReason | null;
  // Kalau waktu sudah habis tapi siswa belum klik selesai, lock secara
  // LAZY: kembalikan true di sini & tulis finishedAt di DB.
  locked: boolean;
  // Waktu terpakai & sisanya (detik).
  consumedSec: number;
  remainingSec: number;
  // Statistik jeda untuk pengawas. Tidak memengaruhi perhitungan waktu.
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
  // true kalau selisih itu ditandai sebagai jeda (statistik saja).
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

  // JAM DINDING MURNI. Waktu terpakai dihitung ulang dari startedAt setiap
  // kali, bukan diakumulasi dari denyut. Konsekuensinya nilai ini tidak bisa
  // dikecilkan oleh siswa dengan cara apa pun: memuat ulang halaman,
  // memutus jaringan, atau menutup tab tidak mengubah hasilnya.
  const elapsedSec = Math.max(
    0,
    Math.floor((now.getTime() - p.startedAt.getTime()) / 1000),
  );
  const consumedSec = Math.min(elapsedSec, durationSec + TIME_UP_GRACE_SEC);

  // Statistik jeda TETAP dicatat untuk pengawas. Hilangnya denyut lebih lama
  // dari toleransi tetap ditandai sebagai jeda supaya mati lampu sungguhan
  // terlihat di tab "Jeda & Kunci" — bedanya, sekarang jeda itu TIDAK
  // mengurangi waktu terpakai. Pengawas yang memutuskan kompensasinya.
  let pausedSec = Math.max(0, p.pausedSec ?? 0);
  let pauseCount = Math.max(0, p.pauseCount ?? 0);
  let paused = false;
  if (gapSec > HEARTBEAT_TOLERANCE_SEC) {
    paused = true;
    pausedSec += gapSec;
    pauseCount += 1;
  }

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
 * auto-finish (write ke DB) kalau waktu sudah habis tapi belum dikunci
 * secara eksplisit. Idempoten.
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
    // Waktu habis → auto-finish TIME_UP. Pakai updateMany + filter
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
 * terpakai + statistik jeda. Kalau waktu sudah habis, sekalian kunci.
 *
 * Aman dipanggil kapan saja: kalau subtes belum dimulai (belum ada baris
 * SubtestProgress), fungsi ini TIDAK membuat baris baru dan tidak
 * menghabiskan waktu — jadi layar instruksi/contoh soal tetap gratis.
 *
 * `minWriteGapSec` (opsional) menekan biaya tulis DB: denyut tiap 15 detik
 * per siswa aktif berarti 40 siswa ≈ 2,7 tulis/detik terus-menerus. Kalau
 * denyut datang lebih rapat dari nilai ini dan waktu belum habis, proyeksi
 * tetap dihitung & dikembalikan tapi TIDAK ditulis ke DB. Akuntansi waktu
 * tetap benar karena waktu terpakai dihitung dari startedAt, bukan
 * diakumulasi antar-denyut.
 */
export async function touchSubtest(args: {
  submissionId: string;
  subtestId: string;
  durationSec: number;
  minWriteGapSec?: number;
}): Promise<SubtestLockInfo> {
  const { submissionId, subtestId, durationSec, minWriteGapSec = 0 } = args;
  const progress = await prisma.subtestProgress.findUnique({
    where: { submissionId_subtestId: { submissionId, subtestId } },
  });
  if (!progress) return notStartedInfo(durationSec);
  if (progress.finishedAt) return lockedInfo(progress, durationSec);

  const now = new Date();
  const projected = projectSubtestTime(progress, durationSec, now);
  const timeUp = projected.consumedSec >= durationSec + TIME_UP_GRACE_SEC;
  const consumedSec = Math.min(projected.consumedSec, durationSec);

  // Hemat tulis DB: denyut yang datang terlalu rapat cukup dijawab dari
  // proyeksi, tanpa UPDATE. Kalau waktu sudah habis, TETAP tulis supaya
  // subtes benar-benar terkunci.
  if (!timeUp && minWriteGapSec > 0 && projected.gapSec < minWriteGapSec) {
    return runningInfo(progress, projected, durationSec, now);
  }

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
 * catat denyut: membuka ulang halaman setelah mati lampu tercatat sebagai
 * JEDA pada statistik pengawas, tetapi waktunya TETAP dihitung.
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
