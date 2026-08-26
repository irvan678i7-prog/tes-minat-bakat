"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Per-question queued payload. We re-send the most-recent value if the user
// edits the same answer multiple times.
type Pending = Record<string, { selected: string | string[]; ts: number }>;

// Jawaban yang DITOLAK server — bukan "selesai", bukan "antri". Ini catatan
// kehilangan data yang harus dilihat siswa & pengawas.
export type RejectedAnswer = {
  questionId: string;
  selected: string | string[];
  ts: number;
  status: number;
  error: string;
};

const STORE_KEY = "tmb-pending-answers-v1";
const REJECTED_KEY = "tmb-rejected-answers-v1";
const RETRY_INTERVAL_MS = 4000; // background flush every 4s
const MAX_BACKOFF_MS = 30000;
// Sesi mati (401) tidak akan sembuh dengan retry cepat — hanya bisa sembuh
// kalau siswa memulihkan sesi lewat /lanjut. Perlambat supaya tidak
// menghantam server selama itu.
const SESSION_DEAD_BACKOFF_MS = 30000;
const MAX_REJECTED = 50;

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

// Status yang berarti "jawaban ini BUKAN milik sesi tes yang sedang aktif":
//   403 → "Soal tidak sesuai dengan jenis tes"
//   404 → "Soal tidak ditemukan"
//
// Antrean ini tersimpan di localStorage per PERANGKAT, bukan per sesi. Jadi
// jawaban sisa dari sesi atau jenis tes sebelumnya di komputer yang sama ikut
// terkirim ke sesi baru dan PASTI ditolak dengan salah satu status di atas.
// Itu sampah antrean, BUKAN kehilangan data sesi ini — jadi jangan dicatat
// sebagai kehilangan dan jangan memicu banner merah. Penolakan lain (mis. 409
// "Waktu subtes sudah habis") tetap dilaporkan apa adanya.
const STALE_STATUSES = [403, 404];

function isStaleStatus(status: number): boolean {
  return STALE_STATUSES.includes(status);
}

// Disiarkan ke seluruh halaman supaya banner peringatan (AnswerSyncAlert)
// tidak perlu berbagi instance hook dengan SubtestRunner.
export const ANSWER_REJECTED_EVENT = "tmb:answer-rejected";
export const SESSION_DEAD_EVENT = "tmb:session-dead";

function loadPending(): Pending {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Pending) : {};
  } catch {
    return {};
  }
}

function savePending(p: Pending) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // Quota exceeded etc — ignore; in-memory state still drives retries.
  }
}

// Dibaca juga oleh AnswerSyncAlert, termasuk setelah halaman di-refresh:
// catatan kehilangan data harus selamat dari reload.
export function readRejectedAnswers(): RejectedAnswer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REJECTED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RejectedAnswer[]) : [];
  } catch {
    return [];
  }
}

function saveRejected(list: RejectedAnswer[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REJECTED_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export type SyncStatus = "idle" | "syncing" | "queued" | "offline" | "error";

// Hasil satu kali kirim. Dipisah tegas supaya "ditolak" TIDAK BISA lagi
// tersamar sebagai "berhasil" — itu inti bug audit #2. `stale` dipisah dari
// `rejected` supaya sampah antrean sesi lain tidak dilaporkan sebagai
// kehilangan data milik siswa yang sedang mengerjakan.
type SendResult =
  | { kind: "ok" }
  | { kind: "retry" }
  | { kind: "unauthorized" }
  | { kind: "stale"; status: number }
  | { kind: "rejected"; status: number; error: string };

export function useAnswerSync() {
  // In-memory mirror of the persisted queue. Avoids reading localStorage on
  // every render.
  const pendingRef = useRef<Pending>({});
  const rejectedRef = useRef<RejectedAnswer[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const flushingRef = useRef(false);
  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const updateCount = useCallback(() => {
    setPendingCount(Object.keys(pendingRef.current).length);
  }, []);

  const persist = useCallback(() => {
    savePending(pendingRef.current);
    updateCount();
  }, [updateCount]);

  const persistRejected = useCallback(() => {
    saveRejected(rejectedRef.current);
    setRejectedCount(rejectedRef.current.length);
  }, []);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    pendingRef.current = loadPending();
    const stored = readRejectedAnswers();
    // Bersihkan catatan lama berstatus 403/404 — itu jawaban sisa sesi lain di
    // perangkat ini yang dulu salah dicatat sebagai kehilangan data. Tanpa
    // pembersihan ini, banner merah palsu dan badge GAGAL SYNC menempel di
    // browser siswa selamanya, di semua subtes.
    const cleaned = stored.filter((r) => !isStaleStatus(r.status));
    rejectedRef.current = cleaned;
    if (cleaned.length !== stored.length) saveRejected(cleaned);
    updateCount();
    setRejectedCount(cleaned.length);
    // Kehilangan data dari sesi sebelumnya harus tetap terlihat setelah
    // refresh, bukan hilang bersama state React.
    if (cleaned.length > 0) setStatus("error");
  }, [updateCount]);

  // Send one item. `keepalive: true` membuat request tetap dikirim meski user
  // keburu klik tombol navigasi — penting supaya jawaban terakhir sebelum
  // pindah soal/subtes tidak hilang. `signal` memberi batas waktu keras
  // supaya request yang menggantung tidak ikut menahan flush().
  const sendOne = async (
    questionId: string,
    selected: string | string[],
  ): Promise<SendResult> => {
    const controller =
      typeof AbortController === "undefined" ? null : new AbortController();
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
      : null;
    try {
      const res = await fetch("/api/student/test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, selected }),
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
        // 4xx lain (mis. 409 "Waktu subtes sudah habis") = penolakan permanen.
        // Mengulang tidak akan menolong, tapi ini WAJIB dilaporkan, bukan
        // disembunyikan.
        let error = "";
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body?.error === "string") error = body.error;
        } catch {
          // body bukan JSON — pakai pesan bawaan di bawah.
        }
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

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    const ids = Object.keys(pendingRef.current);
    if (ids.length === 0) {
      setStatus(rejectedRef.current.length > 0 ? "error" : "idle");
      return;
    }
    flushingRef.current = true;
    setStatus("syncing");
    let anyFailed = false;
    let anyRejected = false;
    let unauthorized = false;

    // Kirim jawaban dengan jumlah request serentak TERBATAS. Sebelumnya semua
    // item dikirim sekaligus lewat Promise.all: 27 jawaban = 27 request
    // keepalive serentak, melebihi batas browser, sehingga sebagian request
    // menggantung dan Promise.all tidak pernah selesai — itu yang membuat
    // tombol kunci subtes macet di "MENGUNCI…". Server tetap upsert per
    // (submissionId, questionId) sehingga aman dikirim bersamaan.
    const queue = ids.slice();
    const sendNext = async (): Promise<void> => {
      for (;;) {
        const qid = queue.shift();
        if (!qid) return;
        const item = pendingRef.current[qid];
        if (!item) continue;
        const result = await sendOne(qid, item.selected);
        // Nilai sempat diubah siswa selama percobaan ini → jangan diapa-apakan,
        // biarkan percobaan berikutnya mengirim nilai terbaru.
        const bumped = pendingRef.current[qid]?.ts !== item.ts;
        if (result.kind === "ok") {
          if (!bumped) delete pendingRef.current[qid];
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
          if (!bumped) delete pendingRef.current[qid];
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
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL_SENDS, queue.length) }, () =>
        sendNext(),
      ),
    );
    persist();
    if (anyRejected) persistRejected();
    flushingRef.current = false;

    if (unauthorized) setSessionExpired(true);

    // Siarkan supaya banner peringatan bisa muncul dari mana saja di halaman.
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

    if (anyRejected || unauthorized || rejectedRef.current.length > 0) {
      // Status TIDAK BOLEH "idle"/hijau selama masih ada jawaban yang gagal.
      setStatus("error");
    } else if (anyFailed) {
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

  // Buang catatan penolakan (dipakai tombol "MENGERTI" di banner peringatan).
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
    clearAll,
    clearRejected,
    status,
    pendingCount,
    rejectedCount,
    sessionExpired,
  };
}
