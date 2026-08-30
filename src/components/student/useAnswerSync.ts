"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionScope } from "./SessionScope";

// Per-question queued payload. We re-send the most-recent value if the user
// edits the same answer multiple times.
type Pending = Record<string, { selected: string | string[]; ts: number }>;

// Jawaban yang DITOLAK server — bukan "selesai", bukan "antri". Ini catatan
// kehilangan data yang harus bisa diperiksa pengawas.
export type RejectedAnswer = {
  questionId: string;
  selected: string | string[];
  ts: number;
  status: number;
  error: string;
};

// Kunci penyimpanan DIPISAH PER SESI (Submission.id). Versi v1 memakai satu
// kunci global untuk semua sesi di satu perangkat, sehingga jawaban sisa sesi
// lain ikut terkirim ke sesi yang sedang jalan — ditolak server kalau jenis
// tesnya beda, atau lebih buruk lagi TERSIMPAN ke sesi yang salah kalau jenis
// tesnya sama.
const PENDING_PREFIX = "tmb-pending-answers-v2";
const REJECTED_PREFIX = "tmb-rejected-answers-v2";
const LEGACY_PENDING_KEY = "tmb-pending-answers-v1";
const LEGACY_REJECTED_KEY = "tmb-rejected-answers-v1";

const RETRY_INTERVAL_MS = 4000; // background flush every 4s
const MAX_BACKOFF_MS = 30000;
// Sesi mati (401) tidak akan sembuh dengan retry cepat — hanya bisa sembuh
// kalau siswa memulihkan sesi lewat /lanjut. Perlambat supaya tidak
// menghantam server selama itu.
const SESSION_DEAD_BACKOFF_MS = 30000;
const MAX_REJECTED = 50;

// MASA KEDALUWARSA CATATAN PENOLAKAN.
//
// Tanpa batas ini, catatan penolakan menempel di perangkat SELAMANYA. Satu
// perangkat yang pernah dipakai latihan minggu lalu akan terus menampilkan
// peringatan kehilangan jawaban kepada siswa berikutnya, padahal sesi itu
// sudah lama ditutup dan tidak ada lagi yang bisa dilakukan siapa pun.
// Catatan yang lebih tua dari ini dibuang saat halaman tes dibuka.
const REJECTED_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// BERAPA LAMA JAWABAN "SUBTES BELUM DIMULAI" BOLEH DICOBA ULANG.
//
// Server menolak jawaban untuk subtes yang belum punya baris SubtestProgress
// (penjagaan anti pre-answering). Dua penyebabnya:
//   1. Perlombaan: satu putaran flush jalan sebelum /subtest-start selesai
//      membuat baris itu — hitungan detik.
//   2. /subtest-start GAGAL TOTAL (jaringan sekolah putus >30 detik saat
//      klik MULAI). Ini yang paling berbahaya: dulu jawaban seperti itu
//      hanya dicoba ulang 2 menit lalu DIBUANG PERMANEN, badge tetap hijau
//      "TERSIMPAN", siswa mengerjakan sampai habis, dan PDF-nya 0.
//
// Sekarang batasnya disamakan dengan umur sesi (6 jam): jawaban tetap di
// antrean sampai subtes benar-benar dimulai di server. Ini TIDAK membuka
// lubang pre-answering baru — runner hanya meng-antre jawaban untuk subtes
// yang sedang dibuka siswa, dan semua penjagaan server (progress harus ada,
// waktu belum habis) tetap berlaku saat jawaban akhirnya diterima. Selain
// dicoba ulang, penolakan ini juga MENYIARKAN event supaya runner memanggil
// ulang /subtest-start (lihat SUBTEST_NOT_STARTED_EVENT).
const NOT_STARTED_RETRY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Batas waktu SATU request jawaban. Tanpa ini `fetch` bisa menggantung tanpa
// batas: request dikirim dengan `keepalive`, dan jumlah request keepalive
// serentak dibatasi browser — antrean besar (mis. 27 jawaban) bisa saling
// mengunci sehingga `flush()` tidak pernah selesai. Akibatnya tombol
// "SELESAIKAN SUBTES" berhenti di "MENGUNCI…" selamanya, karena runner
// menunggu flush selesai sebelum mengunci subtes.
const SEND_TIMEOUT_MS = 12000;
// Kirim maksimal 6 jawaban sekaligus, sisanya menyusul. Masih cepat untuk
// menyusul setelah offline, tapi tidak menabrak batas request keepalive.
const MAX_PARALLEL_SENDS = 6;
// Batas waktu TOTAL satu putaran flush. Kalau antrean masih panjang saat
// jatah habis, sisanya ditinggal untuk putaran berikutnya. Penting karena
// SubtestRunner menunggu `await sync.flush()` sebelum mengunci subtes: tanpa
// batas ini, antrean panjang di jaringan lambat bisa menahan tombol kunci.
const FLUSH_BUDGET_MS = 10000;

// Status yang berarti "jawaban ini BUKAN milik sesi tes yang sedang aktif":
//   403 → "Soal tidak sesuai dengan jenis tes"
//   404 → "Soal tidak ditemukan"
//
// Sejak antrean dipisah per sesi, ini seharusnya jarang terjadi — tapi tetap
// dipertahankan sebagai jaring pengaman: itu sampah antrean, BUKAN kehilangan
// data sesi ini, jadi jangan dicatat sebagai kehilangan.
const STALE_STATUSES = [403, 404];

function isStaleStatus(status: number): boolean {
  return STALE_STATUSES.includes(status);
}

function scopeOf(sessionId?: string | null): string {
  const trimmed = (sessionId ?? "").trim();
  return trimmed || "anon";
}

function pendingStoreKey(sessionId?: string | null): string {
  return `${PENDING_PREFIX}:${scopeOf(sessionId)}`;
}

function rejectedStoreKey(sessionId?: string | null): string {
  return `${REJECTED_PREFIX}:${scopeOf(sessionId)}`;
}

// Pindahkan antrean lama (kunci global tanpa id sesi) ke kunci sesi ini,
// sekali saja per perangkat.
//
// - Antrean PENDING dipindahkan hanya kalau antrean sesi ini masih kosong,
//   supaya jawaban siswa yang sedang mengerjakan saat versi ini di-deploy
//   tidak hilang.
// - Catatan PENOLAKAN lama TIDAK dipindahkan: isinya bercampur antar sesi dan
//   itulah sumber banner merah palsu yang tidak pernah bisa hilang.
//
// Antrean sesi LAIN (kunci v2 milik Submission.id lain) sengaja TIDAK dihapus:
// kalau siswa itu memulihkan sesinya lewat /lanjut, Submission.id-nya sama,
// jadi jawabannya masih bisa terkirim.
function migrateLegacyKeys(sessionId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const legacy = window.localStorage.getItem(LEGACY_PENDING_KEY);
    if (legacy) {
      const key = pendingStoreKey(sessionId);
      const current = window.localStorage.getItem(key);
      if (!current || current === "{}") {
        window.localStorage.setItem(key, legacy);
      }
      window.localStorage.removeItem(LEGACY_PENDING_KEY);
    }
    window.localStorage.removeItem(LEGACY_REJECTED_KEY);
  } catch {
    // localStorage tidak tersedia / penuh — abaikan.
  }
}

// Disiarkan ke seluruh halaman supaya banner sesi-berakhir (AnswerSyncAlert)
// tidak perlu berbagi instance hook dengan SubtestRunner.
export const ANSWER_REJECTED_EVENT = "tmb:answer-rejected";
export const SESSION_DEAD_EVENT = "tmb:session-dead";
// Server bilang "subtes belum dimulai" — runner harus memanggil ulang
// /subtest-start. Tanpa siaran ini, kegagalan /subtest-start saat klik MULAI
// tidak pernah sembuh dan SEMUA jawaban subtes itu tertahan di antrean.
export const SUBTEST_NOT_STARTED_EVENT = "tmb:subtest-not-started";

function loadPending(sessionId?: string | null): Pending {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(pendingStoreKey(sessionId));
    return raw ? (JSON.parse(raw) as Pending) : {};
  } catch {
    return {};
  }
}

function savePending(sessionId: string | null | undefined, p: Pending) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pendingStoreKey(sessionId), JSON.stringify(p));
  } catch {
    // Quota exceeded etc — ignore; in-memory state still drives retries.
  }
}

// Catatan penolakan milik SESI INI. Dipakai untuk pemeriksaan pengawas, bukan
// untuk menakut-nakuti siswa di tengah ujian.
export function readRejectedAnswers(
  sessionId?: string | null,
): RejectedAnswer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(rejectedStoreKey(sessionId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RejectedAnswer[]) : [];
  } catch {
    return [];
  }
}

function saveRejected(
  sessionId: string | null | undefined,
  list: RejectedAnswer[],
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      rejectedStoreKey(sessionId),
      JSON.stringify(list),
    );
  } catch {
    // ignore
  }
}

export type SyncStatus = "idle" | "syncing" | "queued" | "offline" | "error";

// Hasil satu kali kirim. Dipisah tegas supaya "ditolak" TIDAK BISA tersamar
// sebagai "berhasil" di dalam antrean — itu inti bug audit #2. `stale` dipisah
// dari `rejected` supaya sampah antrean sesi lain tidak dihitung sebagai
// kehilangan data milik siswa yang sedang mengerjakan.
type SendResult =
  | { kind: "ok" }
  | { kind: "retry" }
  | { kind: "unauthorized" }
  | { kind: "stale"; status: number }
  | { kind: "rejected"; status: number; error: string };

export function useAnswerSync() {
  // Id sesi tes aktif (Submission.id), disuntikkan server lewat layout /test.
  // Semua penyimpanan lokal di hook ini memakai id ini sebagai pemisah.
  const sessionId = useSessionScope();

  // In-memory mirror of the persisted queue. Avoids reading localStorage on
  // every render.
  const pendingRef = useRef<Pending>({});
  const rejectedRef = useRef<RejectedAnswer[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const updateCount = useCallback(() => {
    setPendingCount(Object.keys(pendingRef.current).length);
  }, []);

  const persist = useCallback(() => {
    savePending(sessionId, pendingRef.current);
    updateCount();
  }, [sessionId, updateCount]);

  const persistRejected = useCallback(() => {
    saveRejected(sessionId, rejectedRef.current);
    setRejectedCount(rejectedRef.current.length);
  }, [sessionId]);

  // Hydrate from localStorage on mount — hanya antrean milik sesi ini.
  useEffect(() => {
    migrateLegacyKeys(sessionId);
    pendingRef.current = loadPending(sessionId);
    const stored = readRejectedAnswers(sessionId);
    // Dua pembersihan sekaligus:
    //   1. status 403/404 bukan kehilangan data sesi ini (lihat STALE_STATUSES)
    //   2. catatan yang sudah kedaluwarsa — sisa sesi lama di perangkat ini
    const freshAfter = Date.now() - REJECTED_MAX_AGE_MS;
    const cleaned = stored.filter(
      (r) => !isStaleStatus(r.status) && r.ts >= freshAfter,
    );
    rejectedRef.current = cleaned;
    if (cleaned.length !== stored.length) saveRejected(sessionId, cleaned);
    updateCount();
    setRejectedCount(cleaned.length);

    // VERIFIKASI KE SERVER. Catatan penolakan hanya berarti kalau jawabannya
    // BENAR-BENAR tidak ada di server. Kalau ternyata sudah tersimpan —
    // misalnya percobaan lain berhasil, atau server menerimanya sebagai
    // susulan — catatannya dibuang supaya pengawas tidak mengejar masalah
    // yang sudah tidak ada.
    if (cleaned.length === 0) return;
    let alive = true;
    const ids = cleaned.map((r) => r.questionId);
    (async () => {
      try {
        const res = await fetch(
          `/api/student/test/answer?ids=${encodeURIComponent(ids.join(","))}`,
        );
        if (!res.ok || !alive) return;
        const body = (await res.json()) as { saved?: unknown };
        const saved = Array.isArray(body?.saved)
          ? body.saved.filter((v): v is string => typeof v === "string")
          : [];
        if (!alive || saved.length === 0) return;
        const keep = rejectedRef.current.filter(
          (r) => !saved.includes(r.questionId),
        );
        if (keep.length === rejectedRef.current.length) return;
        rejectedRef.current = keep;
        persistRejected();
      } catch {
        // Offline atau server tidak menjawab — biarkan catatan apa adanya.
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, updateCount, persistRejected]);

  // Send one item. `keepalive: true` membuat request tetap dikirim meski user
  // keburu klik tombol navigasi — penting supaya jawaban terakhir sebelum
  // pindah soal/subtes tidak hilang. `signal` memberi batas waktu keras
  // supaya request yang menggantung tidak ikut menahan flush().
  //
  // `pickedAtMs` = kapan siswa MEMILIH jawaban ini. Yang dikirim ke server
  // adalah USIA jawaban (sekarang - waktu pilih), bukan jam perangkat, supaya
  // jam perangkat yang tidak akurat tidak ikut menolak jawaban yang sah.
  // Server memakainya untuk menerima jawaban SUSULAN: jawaban yang dipilih
  // sebelum subtes terkunci tetap disimpan walau baru sampai setelah terkunci
  // (mati lampu, jaringan putus, atau antrean belum habis saat tombol
  // "SELESAIKAN SUBTES" ditekan).
  const sendOne = async (
    questionId: string,
    selected: string | string[],
    pickedAtMs: number,
  ): Promise<SendResult> => {
    const answeredAgoMs = Math.max(0, Date.now() - pickedAtMs);
    const controller =
      typeof AbortController === "undefined" ? null : new AbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
      : null;
    try {
      const res = await fetch("/api/student/test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, selected, answeredAgoMs }),
        keepalive: true,
        signal: controller ? controller.signal : undefined,
      });
      if (res.ok) return { kind: "ok" };
      // Sesi mati — jawaban HARUS tetap di antrean. Begitu siswa memulihkan
      // sesi lewat /lanjut, antrean ini yang menyelamatkan jawabannya.
      if (res.status === 401) return { kind: "unauthorized" };
      // Kena rate limit atau server bermasalah → jelas BELUM tersimpan.
      // Dulu 429 ikut dianggap sukses dan jawabannya dibuang.
      if (res.status === 429 || res.status >= 500) return { kind: "retry" };
      // Soal tidak dikenali sesi ini (403/404) = sisa antrean sesi lain di
      // perangkat yang sama. Bukan kehilangan data siswa ini.
      if (isStaleStatus(res.status)) return { kind: "stale", status: res.status };
      if (res.status >= 400) {
        let error = "";
        let code = "";
        try {
          const body = (await res.json()) as {
            error?: unknown;
            code?: unknown;
          };
          if (typeof body?.error === "string") error = body.error;
          if (typeof body?.code === "string") code = body.code;
        } catch {
          // body bukan JSON — pakai pesan bawaan di bawah.
        }
        // "Subtes belum dimulai" = server belum punya baris SubtestProgress.
        // Bisa perlombaan sesaat, bisa juga /subtest-start yang gagal total.
        // Dua-duanya disembuhkan dengan cara yang sama: minta runner memanggil
        // ulang /subtest-start (lewat event), lalu simpan jawaban di antrean
        // sampai berhasil. Jangan pernah membuangnya diam-diam — itulah bug
        // "siswa isi jawaban tapi PDF-nya 0".
        if (code === "SUBTEST_NOT_STARTED") {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(SUBTEST_NOT_STARTED_EVENT));
          }
          if (answeredAgoMs < NOT_STARTED_RETRY_MAX_AGE_MS) {
            return { kind: "retry" };
          }
        }
        // 4xx lain (mis. 409 di luar jendela susulan) = penolakan permanen.
        // Mengulang tidak akan menolong, tapi ini WAJIB dicatat, bukan
        // dianggap berhasil.
        return {
          kind: "rejected",
          status: res.status,
          error: error || `Ditolak server (kode ${res.status}).`,
        };
      }
      return { kind: "retry" };
    } catch {
      // Termasuk abort karena timeout — jawaban tetap di antrean dan dicoba
      // ulang, TIDAK dianggap hilang.
      return { kind: "retry" };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  // Keep a stable ref to the latest flush so timers/listeners always invoke the
  // most recent implementation without re-binding.
  const flushRef = useRef<() => void>(() => {});
  // Promise flush yang sedang berjalan. PENTING: pemanggil yang datang saat
  // flush lain sedang jalan harus IKUT MENUNGGU flush itu, bukan langsung
  // pulang. Versi lama langsung `return` bila flushingRef true — akibatnya
  // `await sync.flush()` di tombol "SELESAIKAN SUBTES" selesai seketika TANPA
  // menunggu apa pun, subtes dikunci saat antrean masih terkirim setengah,
  // dan jumlah terjawab di daftar subtes tampak BERKURANG.
  const flushPromiseRef = useRef<Promise<void> | null>(null);

  const doFlush = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    const ids = Object.keys(pendingRef.current);
    if (ids.length === 0) {
      setStatus("idle");
      return;
    }
    setStatus("syncing");
    let anyFailed = false;
    let anyRejected = false;
    let rejectedChanged = false;
    let unauthorized = false;

    // Kirim jawaban dengan jumlah request serentak TERBATAS dan jatah waktu
    // TOTAL. Sebelumnya semua item dikirim sekaligus lewat Promise.all: 27
    // jawaban = 27 request keepalive serentak, melebihi batas browser,
    // sehingga sebagian menggantung dan Promise.all tidak pernah selesai —
    // itu yang membuat tombol kunci subtes macet di "MENGUNCI…". Server tetap
    // upsert per (submissionId, questionId) sehingga aman dikirim bersamaan.
    const deadline = Date.now() + FLUSH_BUDGET_MS;
    const queue = ids.slice();
    const sendNext = async (): Promise<void> => {
      for (;;) {
        if (Date.now() >= deadline) {
          // Jatah habis: sisa antrean ditinggal untuk putaran berikutnya
          // supaya pemanggil (mis. tombol kunci subtes) tidak ikut tertahan.
          if (queue.length > 0) anyFailed = true;
          return;
        }
        const qid = queue.shift();
        if (!qid) return;
        const item = pendingRef.current[qid];
        if (!item) continue;
        const result = await sendOne(qid, item.selected, item.ts);
        // Nilai sempat diubah siswa selama percobaan ini → jangan diapa-apakan,
        // biarkan percobaan berikutnya mengirim nilai terbaru.
        const bumped = pendingRef.current[qid]?.ts !== item.ts;
        if (result.kind === "ok") {
          if (!bumped) delete pendingRef.current[qid];
          // Akhirnya tersimpan → catatan penolakan lama untuk soal ini sudah
          // tidak benar lagi.
          if (rejectedRef.current.some((r) => r.questionId === qid)) {
            rejectedRef.current = rejectedRef.current.filter(
              (r) => r.questionId !== qid,
            );
            rejectedChanged = true;
          }
          continue;
        }
        if (result.kind === "stale") {
          // Sisa antrean dari sesi lain di perangkat ini. Buang dari antrean
          // tanpa menakut-nakuti siswa; cukup catat di console untuk pengawas.
          if (!bumped) delete pendingRef.current[qid];
          console.warn(
            `[answer-sync] jawaban lama dibuang (status ${result.status}): bukan milik sesi tes ini.`,
          );
          continue;
        }
        if (result.kind === "rejected") {
          // Keluarkan dari antrean supaya tidak berputar selamanya, TAPI catat
          // sebagai kehilangan data — inilah yang dulu dibuang diam-diam.
          // Catatan ini TIDAK ditampilkan ke siswa (lihat AnswerSyncAlert):
          // di tengah ujian siswa tidak bisa berbuat apa pun soal ini, jadi
          // yang perlu tahu adalah pengawas.
          if (!bumped) delete pendingRef.current[qid];
          console.warn(
            `[answer-sync] jawaban DITOLAK server (status ${result.status}): ${result.error}`,
          );
          rejectedRef.current = [
            ...rejectedRef.current.filter((r) => r.questionId !== qid),
            {
              questionId: qid,
              selected: item.selected,
              ts: item.ts,
              status: result.status,
              error: result.error,
            },
          ].slice(-MAX_REJECTED);
          anyRejected = true;
          rejectedChanged = true;
          continue;
        }
        if (result.kind === "unauthorized") {
          unauthorized = true;
          anyFailed = true;
          continue;
        }
        anyFailed = true;
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(MAX_PARALLEL_SENDS, queue.length) }, () =>
          sendNext(),
        ),
      );
    } catch {
      // Kesalahan tak terduga di dalam putaran. Antrean TIDAK dibuang —
      // ditandai gagal supaya dicoba lagi di putaran berikutnya.
      anyFailed = true;
    } finally {
      // WAJIB di finally. Sebelumnya tiga baris ini hanya jalan di jalur
      // sukses: satu kesalahan tak terduga saja membuat status flush macet
      // SELAMANYA, sehingga setiap flush() berikutnya langsung keluar di
      // baris pertama, denyut latar 4 detik ikut mati, status terkunci di
      // "syncing" (badge macet di "MENYIMPAN…"), dan jawaban berhenti
      // terkirim tanpa peringatan apa pun ke siswa. Satu-satunya pemulihan
      // adalah muat ulang halaman — yang tidak diketahui siswa.
      persist();
      if (rejectedChanged) persistRejected();
    }

    if (unauthorized) setSessionExpired(true);

    // Siarkan supaya pengawas/halaman lain bisa bereaksi. Banner merah untuk
    // siswa sudah dihapus, tapi event-nya dipertahankan sebagai titik sambung.
    if (typeof window !== "undefined") {
      if (anyRejected) {
        window.dispatchEvent(
          new CustomEvent(ANSWER_REJECTED_EVENT, {
            detail: { count: rejectedRef.current.length },
          }),
        );
      }
      if (unauthorized) window.dispatchEvent(new CustomEvent(SESSION_DEAD_EVENT));
    }

    // Badge sinkronisasi menggambarkan ANTREAN YANG HIDUP saja. Catatan
    // penolakan tidak lagi mewarnai badge merah: sejak jawaban susulan
    // diterima server, hampir semua penolakan yang tersisa adalah kejadian
    // lama yang tidak bisa ditindaklanjuti siswa, dan badge merah permanen di
    // tengah ujian hanya membuat panik.
    if (anyFailed) {
      setStatus("queued");
    } else {
      setStatus("idle");
    }

    if (anyFailed) {
      backoffRef.current = unauthorized
        ? SESSION_DEAD_BACKOFF_MS
        : Math.min(
            backoffRef.current ? backoffRef.current * 2 : RETRY_INTERVAL_MS,
            MAX_BACKOFF_MS,
          );
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flushRef.current(), backoffRef.current);
    } else {
      backoffRef.current = 0;
    }
  }, [persist, persistRejected]);

  // Pembungkus yang menjamin: (1) hanya SATU flush berjalan pada satu waktu,
  // (2) pemanggil kedua menunggu flush yang sedang berjalan itu selesai.
  const flush = useCallback((): Promise<void> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    const p = doFlush().finally(() => {
      flushPromiseRef.current = null;
    });
    flushPromiseRef.current = p;
    return p;
  }, [doFlush]);

  // KURAS ANTREAN SAMPAI KOSONG (atau jatah waktu habis). Dipakai tombol
  // "SELESAIKAN SUBTES": subtes baru boleh dikunci setelah antrean jawaban
  // benar-benar kosong, supaya jumlah terjawab di server sama dengan yang
  // dilihat siswa di layar. Mengembalikan sisa antrean (0 = semua terkirim).
  const flushUntilEmpty = useCallback(
    async (budgetMs = 15000): Promise<number> => {
      const deadline = Date.now() + budgetMs;
      for (;;) {
        if (Object.keys(pendingRef.current).length === 0) return 0;
        if (Date.now() >= deadline) {
          return Object.keys(pendingRef.current).length;
        }
        await flush();
        if (Object.keys(pendingRef.current).length === 0) return 0;
        if (Date.now() >= deadline) {
          return Object.keys(pendingRef.current).length;
        }
        // Jeda singkat sebelum putaran berikutnya supaya tidak berputar
        // kencang saat offline (flush langsung pulang tanpa mengirim).
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
      }
    },
    [flush],
  );

  // Keep the ref in sync so the setTimeout closure always uses the latest fn.
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Queue an answer and trigger a flush.
  const queueAnswer = useCallback(
    (questionId: string, selected: string | string[]) => {
      pendingRef.current[questionId] = { selected, ts: Date.now() };
      // Siswa mengisi ulang soal ini → catatan penolakan lamanya tidak lagi
      // relevan; kalau ditolak lagi, akan dicatat lagi.
      if (rejectedRef.current.some((r) => r.questionId === questionId)) {
        rejectedRef.current = rejectedRef.current.filter(
          (r) => r.questionId !== questionId,
        );
        persistRejected();
      }
      persist();
      // Fire-and-forget; flush handles its own state.
      flush();
    },
    [persist, persistRejected, flush],
  );

  // Online/offline + page lifecycle integration.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onOnline = () => {
      onlineRef.current = true;
      backoffRef.current = 0;
      flush();
    };
    const onOffline = () => {
      onlineRef.current = false;
      setStatus("offline");
    };
    const onFocus = () => flush();
    const onVisibility = () => {
      if (!document.hidden) flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);

  // Periodic background flush as a safety net.
  useEffect(() => {
    const id = setInterval(() => {
      if (Object.keys(pendingRef.current).length === 0) return;
      flush();
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Buang catatan penolakan.
  const clearRejected = useCallback(() => {
    rejectedRef.current = [];
    persistRejected();
    setStatus(Object.keys(pendingRef.current).length > 0 ? "queued" : "idle");
  }, [persistRejected]);

  // Clear all pending (used after finish-success).
  const clearAll = useCallback(() => {
    pendingRef.current = {};
    rejectedRef.current = [];
    persist();
    persistRejected();
    setStatus("idle");
    setSessionExpired(false);
    backoffRef.current = 0;
  }, [persist, persistRejected]);

  return {
    queueAnswer,
    flush,
    flushUntilEmpty,
    clearAll,
    clearRejected,
    status,
    pendingCount,
    rejectedCount,
    sessionExpired,
  };
}

// Adakah jawaban yang masih menunggu di antrean localStorage sesi ini?
// Dipakai halaman daftar subtes untuk memutuskan perlu-tidaknya menguras.
export function hasPendingAnswers(sessionId?: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(pendingStoreKey(sessionId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Pending;
    return Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}

// ── PENGURAS ANTREAN DI LUAR RUNNER ─────────────────────────────────────────
//
// Setelah subtes dikunci, runner memuat ulang penuh ke daftar subtes (/test).
// Di halaman itu useAnswerSync TIDAK terpasang, jadi jawaban yang masih
// tersisa di antrean localStorage tidak pernah terkirim — dan jumlah
// terjawab di daftar tampak BERKURANG dibanding yang dikerjakan siswa.
//
// Fungsi ini membaca antrean langsung dari localStorage dan mengirimkannya
// satu per satu (dengan answeredAgoMs, supaya diterima server sebagai jawaban
// susulan bila subtesnya sudah terkunci). HANYA boleh dipakai di halaman yang
// TIDAK memasang useAnswerSync (mis. daftar subtes) supaya tidak berebut
// menulis localStorage dengan instance hook di runner.
export async function drainPendingAnswers(
  sessionId: string | null | undefined,
  budgetMs = 12000,
): Promise<number> {
  if (typeof window === "undefined") return 0;
  const deadline = Date.now() + budgetMs;
  const key = pendingStoreKey(sessionId);
  const load = (): Pending => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Pending) : {};
    } catch {
      return {};
    }
  };
  const save = (p: Pending) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(p));
    } catch {
      // localStorage penuh / tidak tersedia — antrean in-memory tetap benar.
    }
  };
  const recordRejected = (
    qid: string,
    item: Pending[string],
    status: number,
    error: string,
  ) => {
    const list = readRejectedAnswers(sessionId)
      .filter((r) => r.questionId !== qid)
      .concat({ questionId: qid, selected: item.selected, ts: item.ts, status, error })
      .slice(-MAX_REJECTED);
    saveRejected(sessionId, list);
  };

  const pending = load();
  const ids = Object.keys(pending);
  if (ids.length === 0) return 0;

  for (const qid of ids) {
    if (Date.now() >= deadline) break;
    const item = pending[qid];
    if (!item) continue;
    try {
      const res = await fetch("/api/student/test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: qid,
          selected: item.selected,
          answeredAgoMs: Math.max(0, Date.now() - item.ts),
        }),
        keepalive: true,
      });
      if (res.ok) {
        delete pending[qid];
        save(pending);
        continue;
      }
      // Sesi mati — berhenti; antrean menunggu pemulihan lewat /lanjut.
      if (res.status === 401) break;
      // Sampah antrean sesi lain (bukan kehilangan data sesi ini).
      if (isStaleStatus(res.status)) {
        delete pending[qid];
        save(pending);
        continue;
      }
      // 429 / 5xx → biarkan di antrean, putaran berikutnya mencoba lagi.
      if (res.status === 429 || res.status >= 500) continue;
      // 4xx lain = penolakan permanen — keluarkan dari antrean TAPI catat
      // sebagai kehilangan data supaya pengawas bisa memeriksanya.
      let error = "";
      let code = "";
      try {
        const body = (await res.json()) as { error?: unknown; code?: unknown };
        if (typeof body?.error === "string") error = body.error;
        if (typeof body?.code === "string") code = body.code;
      } catch {
        // body bukan JSON.
      }
      if (code === "SUBTEST_NOT_STARTED") continue; // tunggu subtest-start
      recordRejected(qid, item, res.status, error || `Ditolak server (kode ${res.status}).`);
      delete pending[qid];
      save(pending);
    } catch {
      // Jaringan bermasalah — biarkan di antrean.
    }
  }
  return Object.keys(load()).length;
}
