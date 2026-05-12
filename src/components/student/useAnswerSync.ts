"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Per-question queued payload. We re-send the most-recent value if the user
// edits the same answer multiple times.
type Pending = Record<string, { selected: string | string[]; ts: number }>;

const STORE_KEY = "tmb-pending-answers-v1";
const RETRY_INTERVAL_MS = 4000; // background flush every 4s
const MAX_BACKOFF_MS = 30000;

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

export type SyncStatus = "idle" | "syncing" | "queued" | "offline" | "error";

export function useAnswerSync() {
  // In-memory mirror of the persisted queue. Avoids reading localStorage on
  // every render.
  const pendingRef = useRef<Pending>({});
  const [pendingCount, setPendingCount] = useState(0);
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

  // Hydrate from localStorage on mount.
  useEffect(() => {
    pendingRef.current = loadPending();
    updateCount();
  }, [updateCount]);

  // Send one item, returns true if successful.
  const sendOne = async (
    questionId: string,
    selected: string | string[],
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/student/test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, selected }),
      });
      // 4xx other than 401 means the row is bad — drop it so we don't retry
      // forever. 401/network errors are kept for retry.
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 401) {
        return true; // treat as "done" so we stop spinning on bad payloads
      }
      return false;
    } catch {
      return false;
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
      setStatus("idle");
      return;
    }
    flushingRef.current = true;
    setStatus("syncing");
    let anyFailed = false;
    for (const qid of ids) {
      const item = pendingRef.current[qid];
      if (!item) continue;
      const ok = await sendOne(qid, item.selected);
      if (ok) {
        // Only drop if the value hasn't been bumped during this attempt.
        if (pendingRef.current[qid]?.ts === item.ts) {
          delete pendingRef.current[qid];
        }
      } else {
        anyFailed = true;
      }
    }
    persist();
    flushingRef.current = false;
    if (anyFailed) {
      setStatus("queued");
      backoffRef.current = Math.min(
        backoffRef.current ? backoffRef.current * 2 : RETRY_INTERVAL_MS,
        MAX_BACKOFF_MS,
      );
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flushRef.current(), backoffRef.current);
    } else {
      setStatus("idle");
      backoffRef.current = 0;
    }
  }, [persist]);

  // Keep the ref in sync so the setTimeout closure always uses the latest fn.
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Queue an answer and trigger a flush.
  const queueAnswer = useCallback(
    (questionId: string, selected: string | string[]) => {
      pendingRef.current[questionId] = { selected, ts: Date.now() };
      persist();
      // Fire-and-forget; flush handles its own state.
      flush();
    },
    [persist, flush],
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

  // Clear all pending (used after finish-success).
  const clearAll = useCallback(() => {
    pendingRef.current = {};
    persist();
    setStatus("idle");
    backoffRef.current = 0;
  }, [persist]);

  return { queueAnswer, flush, clearAll, status, pendingCount };
}
