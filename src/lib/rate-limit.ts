// Rate limiter in-memory (sliding-window) sederhana. Cocok untuk Vercel
// single-region atau hosting dengan satu instance. Untuk multi-instance
// (mis. Vercel multi-region atau scale-out), ganti dengan Redis (Upstash)
// — tinggal swap implementasi `check()` saja.
//
// Per-IP keying: ambil IP dari header `x-forwarded-for` atau `x-real-ip`
// (Vercel/Cloudflare proxy menambahkannya); fallback ke "unknown".

import type { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Bucket>();

// Cleanup ringan supaya Map tidak tumbuh tanpa batas pada server long-running.
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of BUCKETS) {
    if (v.resetAt <= now) BUCKETS.delete(k);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  maybeCleanup();
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + windowMs };
    BUCKETS.set(key, fresh);
    return { ok: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, resetAt: b.resetAt };
}

export function getClientIp(req: NextRequest): string {
  // x-forwarded-for bisa "ip1, ip2, ip3" — ambil paling kiri (client asli).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
