"use client";

import { useEffect, useRef, useState } from "react";

export type ViolationType =
  | "tab_hidden"
  | "fullscreen_exit"
  | "screenshot";

export type AntiCheatState = {
  count: number;
  flagged: boolean;
  threshold: number;
  lastType: ViolationType | null;
  lastAt: number;
};

// Dedupe rapid-fire events. Device sleep / screen lock memicu KEDUA event
// sekaligus: tab menjadi hidden (visibilitychange) DAN fullscreen keluar
// (fullscreenchange). Dengan dedupe ini, 1 aksi tersebut dihitung 1 saja.
const SUPPRESS_MS = 1200;

const SAME_ACTION_GROUPS: ViolationType[][] = [
  ["tab_hidden", "fullscreen_exit"],
];

// Tab harus tersembunyi minimal sebanyak ini supaya dianggap pelanggaran.
// Visibility-change yang sangat singkat biasanya berasal dari OS overlay
// (notifikasi, screenshot tool yang sekejap menutupi tab) — kita TIDAK
// menghitungnya sebagai pindah tab.
const TAB_HIDDEN_MIN_MS = 600;

// Endpoint default (tes minat-bakat). Tes lain (mis. CFIT) bisa memakai hook
// yang sama dengan mengirim opsi `endpoint` sendiri.
const DEFAULT_ENDPOINT = "/api/student/test/violation";

function inSameActionGroup(a: ViolationType, b: ViolationType): boolean {
  if (a === b) return true;
  return SAME_ACTION_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

// Type guard untuk Screen Wake Lock API.
type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

/**
 * Tracks anti-cheat violations during an active test subtest:
 * - Pindah tab / ganti aplikasi (tab_hidden)
 * - Keluar fullscreen (fullscreen_exit)
 * - Screenshot (keyboard shortcut)
 *
 * Setiap event di-POST ke `endpoint` (default /api/student/test/violation)
 * supaya admin bisa review dan peserta auto-flagged setelah `threshold` event.
 */
export function useAntiCheat(opts: {
  active: boolean;
  subtestCode: string;
  endpoint?: string;
  onUpdate?: (s: AntiCheatState) => void;
}) {
  const { active, subtestCode, endpoint, onUpdate } = opts;
  const violationEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  const [state, setState] = useState<AntiCheatState>({
    count: 0,
    flagged: false,
    threshold: 5,
    lastType: null,
    lastAt: 0,
  });
  const lastFireRef = useRef<{ type: ViolationType | null; at: number }>({
    type: null,
    at: 0,
  });
  const [fullscreenActive, setFullscreenActive] = useState<boolean>(() =>
    typeof document === "undefined" ? false : !!document.fullscreenElement,
  );
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const hiddenSinceRef = useRef<number | null>(null);

  const requestFullscreen = () => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const req =
      el.requestFullscreen ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any).webkitRequestFullscreen ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any).msRequestFullscreen;
    if (req) {
      try {
        const p = req.call(el);
        if (p && typeof p.then === "function") p.catch(() => {});
      } catch {
        // Some browsers throw if not in user gesture; ignored.
      }
    }
  };

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let mounted = true;

    const report = async (type: ViolationType) => {
      const now = Date.now();
      if (
        lastFireRef.current.type != null &&
        now - lastFireRef.current.at < SUPPRESS_MS &&
        inSameActionGroup(lastFireRef.current.type, type)
      ) {
        return;
      }
      lastFireRef.current = { type, at: now };
      try {
        const res = await fetch(violationEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            subtestCode,
            occurredAt: new Date(now).toISOString(),
          }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          count?: number;
          flagged?: boolean;
          threshold?: number;
        };
        if (!mounted) return;
        const next: AntiCheatState = {
          count: d.count ?? state.count + 1,
          flagged: d.flagged ?? state.flagged,
          threshold: d.threshold ?? state.threshold,
          lastType: type,
          lastAt: now,
        };
        setState(next);
        onUpdate?.(next);
      } catch {
        const next: AntiCheatState = {
          count: state.count + 1,
          flagged: state.count + 1 >= state.threshold,
          threshold: state.threshold,
          lastType: type,
          lastAt: now,
        };
        if (!mounted) return;
        setState(next);
        onUpdate?.(next);
      }
    };

    const requestWakeLock = async () => {
      const nav = navigator as WakeLockNavigator;
      if (!nav.wakeLock) return;
      try {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      } catch {
        // Beberapa browser melempar saat tab tidak fokus / permission ditolak.
      }
    };

    const onVis = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else {
        const startedAt = hiddenSinceRef.current;
        hiddenSinceRef.current = null;
        if (startedAt != null) {
          const duration = Date.now() - startedAt;
          if (duration >= TAB_HIDDEN_MIN_MS && duration < 5 * 60_000) {
            report("tab_hidden");
          }
        }
        if (!wakeLockRef.current) requestWakeLock();
      }
    };
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setFullscreenActive(fs);
      if (!fs) report("fullscreen_exit");
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Screenshot shortcuts: PrintScreen, Cmd/Ctrl+Shift+3/4/5/6/S
      if (e.key === "PrintScreen" || k === "printscreen") {
        e.preventDefault();
        report("screenshot");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ["3", "4", "5", "6", "s"].includes(k)) {
        e.preventDefault();
        report("screenshot");
      }
    };

    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("keydown", onKey);

    requestWakeLock();

    Promise.resolve().then(() => {
      if (mounted) setFullscreenActive(!!document.fullscreenElement);
    });

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("keydown", onKey);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, subtestCode, violationEndpoint]);

  return { state, requestFullscreen, fullscreenActive };
}
