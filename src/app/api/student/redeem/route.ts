import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { signStudentToken } from "@/lib/jwt";
import { STUDENT_COOKIE, getStudentFromRequest } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { STUDENT_JWT_EXPIRES_IN } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(1).max(32),
  // Bila dikirim, server validasi cocok dengan jenis token. Mismatch → 409,
  // cookie TIDAK diset — mencegah peserta yang salah klik kartu tetap
  // masuk ke jenis tes yang salah.
  testKind: z.enum(["MINAT", "BAKAT"]).optional(),
  // forceNew = true → abaikan cookie yang ada, buat submission baru.
  // Dipakai saat 2+ siswa bergantian di browser yang sama.
  forceNew: z.boolean().optional(),
});

// 20 percobaan redeem / 5 menit per IP. Token 8 karakter dari alfabet 32 huruf
// = 32^8 ≈ 1.1 triliun kombinasi — brute-force tidak realistis, tapi limit ini
// tetap menjaga endpoint dari DoS.
const REDEEM_LIMIT = 20;
const REDEEM_WINDOW_MS = 5 * 60 * 1000;

function expiresInToSeconds(v: string | number): number {
  if (typeof v === "number") return v;
  const m = /^(\d+)\s*([smhd])$/.exec(v.trim());
  if (!m) return 3 * 60 * 60;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 60 * 60;
    case "d": return n * 24 * 60 * 60;
    default: return 3 * 60 * 60;
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`student-redeem:${ip}`, REDEEM_LIMIT, REDEEM_WINDOW_MS);
  if (!rl.ok) {
    const retry = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi nanti." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retry),
          "X-RateLimit-Limit": String(REDEEM_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const code = parsed.data.code.trim().toUpperCase();
  const requestedKind = parsed.data.testKind;
  const tok = await prisma.accessToken.findUnique({ where: { code } });
  if (!tok) return NextResponse.json({ error: "Token tidak ditemukan" }, { status: 404 });

  // Validasi testKind sebelum set cookie. Tolak bila mismatch.
  if (requestedKind && requestedKind !== tok.testKind) {
    return NextResponse.json(
      { error: `Token ini untuk ${tok.testKind}, bukan ${requestedKind}.`, testKind: tok.testKind },
      { status: 409 },
    );
  }

  // Class/broadcast token: 1 token = banyak siswa. Tiap browser baru → submission
  // baru. Browser yang sama (refresh) → resume submission lama lewat cookie
  // student JWT (sub = submissionId). Token expired hanya melarang submission
  // BARU; resume submission lama yang sudah jalan tetap diizinkan.
  // forceNew: abaikan cookie, selalu buat submission baru (peserta
  // bergantian di browser/HP yang sama).
  const existing = parsed.data.forceNew ? null : getStudentFromRequest(req);
  let submission =
    existing && existing.tokenId === tok.id
      ? await prisma.submission.findUnique({ where: { id: existing.sub } })
      : null;
  // Cookie kadaluarsa / submission dihapus / token beda → buat baru.
  if (submission && submission.tokenId !== tok.id) submission = null;

  if (!submission) {
    // Token expired & belum pernah dipakai siapa pun → tolak.
    // Token expired tapi sudah pernah di-redeem (class token) → izinkan
    // peserta baru bergabung (siswa lain di kelas yang sama yang lebih lambat
    // membuka link).
    if (tok.expiresAt < new Date() && !tok.redeemedAt) {
      return NextResponse.json({ error: "Token sudah kadaluarsa" }, { status: 410 });
    }
    submission = await prisma.submission.create({
      data: {
        tokenId: tok.id,
        testKind: tok.testKind,
        randomSeed: randomUUID(),
      },
    });
    // Tandai waktu redeem pertama kali (sekedar informasi untuk admin —
    // tidak meng-lock token). updateMany dengan filter redeemedAt=null
    // memastikan idempoten kalau token sudah pernah dipakai siswa lain.
    if (!tok.redeemedAt) {
      await prisma.accessToken.updateMany({
        where: { id: tok.id, redeemedAt: null },
        data: { redeemedAt: new Date() },
      });
    }
  }

  const jwtTok = signStudentToken({
    sub: submission.id,
    role: "student",
    testKind: tok.testKind,
    tokenId: tok.id,
  });
  const res = NextResponse.json({
    ok: true,
    submissionId: submission.id,
    testKind: tok.testKind,
    profileFilled: !!submission.fullName,
    fullName: submission.fullName ?? null,
    finishedAt: submission.finishedAt,
  });
  res.cookies.set(STUDENT_COOKIE, jwtTok, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Sinkron dengan masa berlaku JWT student (default 3 jam, bisa di-override
    // via env STUDENT_JWT_EXPIRES_IN). Cukup untuk semua subtes BAKAT + buffer
    // — sebelumnya 12 jam terlalu panjang dari sisi keamanan.
    maxAge: expiresInToSeconds(STUDENT_JWT_EXPIRES_IN),
  });
  return res;
}
