// Shared helpers for tracking subtest timer & completion state in localStorage.
// Used by both SubtestRunner (to persist timer & mark finished) and TestHub
// (to know which subtests are done even if not all questions were answered).

const TIMER_KEY = (code: string) => `tmb-runner-${code}`;
const FINISHED_KEY = (code: string) => `tmb-finished-${code}`;

/** Get the epoch‑ms when this subtest's timer was first started, or null. */
export function getStartedAt(code: string): number | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(TIMER_KEY(code));
  return v ? parseInt(v, 10) : null;
}

/** Persist the timer start timestamp (only if not already set). Returns the startedAt value. */
export function ensureStartedAt(code: string): number {
  const existing = getStartedAt(code);
  if (existing != null) return existing;
  const now = Date.now();
  window.localStorage.setItem(TIMER_KEY(code), String(now));
  return now;
}

/** Mark a subtest as finished (time expired or manually completed). */
export function markSubtestFinished(code: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FINISHED_KEY(code), "1");
}

/** Check if a subtest was already marked as finished. */
export function isSubtestFinished(code: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FINISHED_KEY(code)) === "1";
}
