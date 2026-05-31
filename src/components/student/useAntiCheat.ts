"use client";

import { useEffect, useRef, useState } from "react";

export type ViolationType =
  | "tab_hidden"
  | "fullscreen_exit"
  | "copy"
  | "paste"
  | "cut"
  | "context_menu"
  | "shortcut"
  | "screenshot"
  | "screen_record";

export type AntiCheatState = {
  count: number;
  flagged: boolean;
  threshold: number;
  lastType: ViolationType | null;
  lastAt: number;
};

// Dedupe rapid-fire events. Banyak aksi user yang tunggal sebenarnya memicu
// >1 event browser (mis. pindah tab → blur + visibilitychange; tekan Ctrl+C
// → keydown + copy; keluar fullscreen → fullscreenchange + blur). Dengan
// dedupe ini, 1 aksi user dihitung sebagai 1 pelanggaran, bukan 2-3.
const SUPPRESS_MS = 1200;

// Pasangan event yang harus dianggap satu aksi. Kalau salah satu sudah
// dilaporkan dalam SUPPRESS_MS terakhir, yang lain di-suppress.
const SAME_ACTION_GROUPS: ViolationType[][] = [
  ["shortcut", "copy"],
  ["shortcut", "paste"],
  ["shortcut", "cut"],
  ["shortcut", "screenshot"],
];

// Tab harus tersembunyi minimal sebanyak ini supaya dianggap pelanggaran.
// Visibility-change yang sangat singkat biasanya berasal dari OS overlay
// (notifikasi, screenshot tool yang sekejap menutupi tab) — kita TIDAK
// menghitungnya sebagai pindah tab. Untuk screenshot, ada deteksi terpisah
// via keyboard shortcut.
const TAB_HIDDEN_MIN_MS = 600;

function inSameActionGroup(a: ViolationType, b: ViolationType): boolean {
  if (a === b) return true;
  return SAME_ACTION_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

type ShortcutKind = "none" | "copy_family" | "shortcut" | "screenshot";

function classifyShortcut(e: KeyboardEvent): { blocked: boolean; kind: ShortcutKind } {
  const k = e.key.toLowerCase();

  // Screenshot detection — dapat di-trigger dari kombinasi tombol di OS
  // utama. Walau preventDefault tidak menghalangi OS untuk mengambil
  // screenshot, kita tetap mencatatnya sebagai pelanggaran.
  // macOS: Cmd+Shift+3 (fullscreen), Cmd+Shift+4 (selection), Cmd+Shift+5
  //        (Screenshot.app), Cmd+Shift+6 (Touch Bar)
  // Windows: PrintScreen, Alt+PrintScreen, Win+Shift+S (Snipping Tool),
  //          Win+PrintScreen
  // Linux/ChromeOS: PrintScreen, Ctrl+Shift+PrintScreen, Ctrl+Show Windows
  if (e.key === "PrintScreen" || k === "printscreen") {
    return { blocked: true, kind: "screenshot" };
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && ["3", "4", "5", "6", "s"].includes(k)) {
    return { blocked: true, kind: "screenshot" };
  }

  if (e.metaKey || e.ctrlKey) {
    // c/v/x ditangani oleh listener copy/paste/cut — jangan double-report.
    if (["c", "v", "x"].includes(k)) return { blocked: true, kind: "copy_family" };
    if (["a", "s", "p", "u", "f", "t", "n"].includes(k)) return { blocked: true, kind: "shortcut" };
  }
  if (e.key === "F12") return { blocked: true, kind: "shortcut" };
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
    if (["i", "j"].includes(k)) return { blocked: true, kind: "shortcut" };
    // shift+c via Ctrl+Shift+C = devtools inspector; sudah ditangkap di blok
    // screenshot di atas untuk 's' (yang juga screenshot di mac), jadi kita
    // pisah eksplisit di sini supaya 'c' tetap kena report shortcut.
    if (k === "c") return { blocked: true, kind: "shortcut" };
  }
  return { blocked: false, kind: "none" };
}

// Type guard untuk Screen Wake Lock API yang masih experimental di beberapa
// browser tapi sudah dukungan luas di Chromium/Safari iOS 16.4+.
type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

/**
 * Tracks anti-cheat violations during an active test subtest:
 * tab/app switches, exit fullscreen, copy/paste/cut, right click, screenshot
 * shortcuts, screen recording, dan cheat shortcuts lain.
 *
 * Sengaja TIDAK menghitung:
 *  - Window blur (terlalu noisy: pindah ke devtools, klik di luar, dsb.)
 *  - Visibility-change sangat singkat (< 600ms) — biasanya overlay OS
 *  - Layar mati / device sleep — kita aktifkan Screen Wake Lock supaya layar
 *    tidak auto-lock selama tes. Kalau wake lock tidak didukung browser,
 *    kita memang masih bisa salah hitung saat screen lock, tapi minimal
 *    kasus tab-switch < 5 menit pasti tetap kena.
 *
 * Setiap event di-POST ke /api/student/test/violation supaya admin bisa
 * review dan siswa auto-flagged setelah `threshold` event.
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
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const hiddenSinceRef = useRef<number | null>(null);

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
      // Dedupe: kalau event yang sama ATAU event dari grup aksi yang sama
      // sudah dilaporkan dalam SUPPRESS_MS terakhir, abaikan. Ini mencegah
      // 1 aksi user (mis. pindah tab) dihitung 2x karena memicu beberapa
      // event browser sekaligus.
      if (
        lastFireRef.current.type != null &&
        now - lastFireRef.current.at < SUPPRESS_MS &&
        inSameActionGroup(lastFireRef.current.type, type)
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

    const requestWakeLock = async () => {
      const nav = navigator as WakeLockNavigator;
      if (!nav.wakeLock) return;
      try {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      } catch {
        // Beberapa browser melempar saat tab tidak fokus / permission ditolak.
        // Kita abaikan saja — wake lock bersifat best-effort.
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
          // Visibility change sangat singkat (mis. overlay OS, screenshot
          // tool yang sekejap menutupi tab) atau sangat lama (mis. layar
          // mati / device sleep berkepanjangan) TIDAK kita hitung sebagai
          // pelanggaran. Hanya rentang "tab switch wajar" yang dihitung.
          // Catatan: dengan Wake Lock aktif, screen-off seharusnya tidak
          // terjadi otomatis, tapi user bisa tetap menekan tombol power
          // — di kasus itu kita tetap permisif.
          if (duration >= TAB_HIDDEN_MIN_MS && duration < 5 * 60_000) {
            report("tab_hidden");
          }
        }
        // Re-acquire wake lock saat tab kembali fokus (sentinel di-release
        // otomatis oleh browser saat tab tersembunyi).
        if (!wakeLockRef.current) requestWakeLock();
      }
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
      const { blocked, kind } = classifyShortcut(e);
      if (blocked) {
        e.preventDefault();
        if (kind === "screenshot") report("screenshot");
        else if (kind === "shortcut") report("shortcut");
        // copy_family ditangani oleh listener copy/paste/cut.
      }
    };

    // ── Deteksi rekam layar via getDisplayMedia ──────────────────────────
    // Monkey-patch navigator.mediaDevices.getDisplayMedia supaya panggilan
    // dari ekstensi/recorder dalam tab yang sama bisa kita tangkap. Tidak
    // bisa menangkap rekam layar OS-level (QuickTime, OBS) — itu di luar
    // jangkauan browser.
    const md = navigator.mediaDevices;
    const origGetDisplayMedia = md?.getDisplayMedia?.bind(md);
    if (md && origGetDisplayMedia) {
      md.getDisplayMedia = (...args: Parameters<MediaDevices["getDisplayMedia"]>) => {
        report("screen_record");
        return origGetDisplayMedia(...args);
      };
    }

    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("keydown", onKey);

    // Cegah layar auto-lock selama tes aktif. Sentinel akan di-release
    // otomatis saat unmount (di cleanup).
    requestWakeLock();

    // Sync fullscreen state once after activation in a microtask so we don't
    // setState synchronously inside the effect body.
    Promise.resolve().then(() => {
      if (mounted) setFullscreenActive(!!document.fullscreenElement);
    });

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("keydown", onKey);
      if (md && origGetDisplayMedia) {
        md.getDisplayMedia = origGetDisplayMedia;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, subtestCode]);

  return { state, requestFullscreen, fullscreenActive };
}
