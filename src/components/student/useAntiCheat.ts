"use client";

import { useEffect, useRef, useState } from "react";

export type ViolationType =
  | "tab_hidden"
  | "blur"
  | "fullscreen_exit"
  | "copy"
  | "paste"
  | "cut"
  | "context_menu"
  | "shortcut";

export type AntiCheatState = {
  count: number;
  flagged: boolean;
  threshold: number;
  lastType: ViolationType | null;
  lastAt: number;
};

const SUPPRESS_MS = 800; // dedupe rapid-fire events (e.g. blur + visibilitychange).

function isShortcutBlocked(e: KeyboardEvent): boolean {
  // Block obvious cheat shortcuts: copy/paste/cut, save page, view source, print,
  // dev tools, find in page, open new tab. Whitelist Tab/Enter/letters/arrows.
  if (e.metaKey || e.ctrlKey) {
    const k = e.key.toLowerCase();
    if (["c", "v", "x", "a", "s", "p", "u", "f", "t", "n"].includes(k)) return true;
  }
  if (e.key === "F12") return true;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
    const k = e.key.toLowerCase();
    if (["i", "j", "c"].includes(k)) return true;
  }
  return false;
}

/**
 * Tracks anti-cheat violations during an active test subtest:
 * tab switches, window blurs, exit fullscreen, copy/paste/cut, right click,
 * cheat shortcuts. Each event is POSTed to /api/student/test/violation so the
 * admin can review and the student is auto-flagged after `threshold` events.
 *
 * The hook also exposes a `requestFullscreen()` helper so the UI can offer a
 * button to re-enter fullscreen if the student accidentally exits.
 */
export function useAntiCheat(opts: {
  active: boolean;
  subtestCode: string;
  onUpdate?: (s: AntiCheatState) => void;
}) {
  const { active, subtestCode, onUpdate } = opts;
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
  // Lazy initializer reads fullscreenElement once on mount instead of via a
  // setState call inside an effect (which lint flags as a cascading render).
  const [fullscreenActive, setFullscreenActive] = useState<boolean>(() =>
    typeof document === "undefined" ? false : !!document.fullscreenElement,
  );

  // Request fullscreen on activation. Safe to call repeatedly.
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
      // Dedupe identical event firing twice within suppress window.
      if (
        lastFireRef.current.type === type &&
        now - lastFireRef.current.at < SUPPRESS_MS
      ) {
        return;
      }
      lastFireRef.current = { type, at: now };
      try {
        const res = await fetch("/api/student/test/violation", {
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
        // Even if server is unreachable, update local count so UI still warns.
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

    const onVis = () => {
      if (document.hidden) report("tab_hidden");
    };
    const onBlur = () => {
      // Ignore blur when document is hidden (we already report tab_hidden).
      if (!document.hidden) report("blur");
    };
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setFullscreenActive(fs);
      if (!fs) report("fullscreen_exit");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      report("copy");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      report("paste");
    };
    const onCut = (e: ClipboardEvent) => {
      e.preventDefault();
      report("cut");
    };
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      report("context_menu");
    };
    const onKey = (e: KeyboardEvent) => {
      if (isShortcutBlocked(e)) {
        e.preventDefault();
        report("shortcut");
      }
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("keydown", onKey);

    // Sync fullscreen state once after activation in a microtask so we don't
    // setState synchronously inside the effect body.
    Promise.resolve().then(() => {
      if (mounted) setFullscreenActive(!!document.fullscreenElement);
    });

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, subtestCode]);

  return { state, requestFullscreen, fullscreenActive };
}
