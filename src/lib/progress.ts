// Per-subtest timer / completion progress helpers.
//
// Stored on Submission.subtestProgress as a JSON map keyed by subtest code:
//   { "<code>": { startedAt: <epoch ms>, completedAt?: <epoch ms | null> } }
//
// Semantics:
// - A subtest's timer starts the FIRST time the student opens it (startedAt).
//   It then keeps running (server-authoritative) and cannot be reset by
//   leaving/re-entering or by clearing localStorage.
// - A subtest is "completed" (locked, review-only) when EITHER the student
//   finished it early (completedAt set) OR its time has elapsed.

export type SubtestProgressEntry = {
  startedAt: number;
  completedAt?: number | null;
};

export type SubtestProgressMap = Record<string, SubtestProgressEntry>;

/** Safely parse the JSON value stored in Submission.subtestProgress. */
export function parseProgress(raw: unknown): SubtestProgressMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SubtestProgressMap = {};
  for (const [code, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    const startedAt = typeof v.startedAt === "number" ? v.startedAt : Number(v.startedAt);
    if (!Number.isFinite(startedAt)) continue;
    const completedRaw = v.completedAt;
    const completedAt =
      completedRaw == null
        ? null
        : Number.isFinite(Number(completedRaw))
          ? Number(completedRaw)
          : null;
    out[code] = { startedAt, completedAt };
  }
  return out;
}

/** Whether a subtest is completed/locked given its entry and duration. */
export function isSubtestCompleted(
  entry: SubtestProgressEntry | undefined,
  durationSec: number,
  now: number = Date.now(),
): boolean {
  if (!entry) return false;
  if (entry.completedAt != null) return true;
  return (now - entry.startedAt) / 1000 >= durationSec;
}

/** Remaining seconds for a subtest (0 if completed or time is up). */
export function remainingSeconds(
  entry: SubtestProgressEntry | undefined,
  durationSec: number,
  now: number = Date.now(),
): number {
  if (!entry || entry.completedAt != null) return entry?.completedAt != null ? 0 : durationSec;
  const elapsed = (now - entry.startedAt) / 1000;
  return Math.max(0, Math.floor(durationSec - elapsed));
}
