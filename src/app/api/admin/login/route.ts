import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signAdminToken } from "@/lib/jwt";
import { ADMIN_COOKIE } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { ADMIN_JWT_EXPIRES_IN } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

// 8 percobaan / 10 menit per IP. Cukup ketat untuk mencegah brute-force,
// cukup longgar untuk user yang lupa password & coba beberapa kali.
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

function expiresInToSeconds(v: string | number): number {
  if (typeof v === "number") return v;
  const m = /^(\d+)\s*([smhd])$/.exec(v.trim());
  if (!m) return 8 * 60 * 60;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 60 * 60;
    case "d": return n * 24 * 60 * 60;
    default: return 8 * 60 * 60;
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`admin-login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!rl.ok) {
    const retry = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Terlalu banyak percobaan login. Coba lagi nanti." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retry),
          "X-RateLimit-Limit": String(LOGIN_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (!user) return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });

  const tok = signAdminToken({ sub: user.id, role: "admin", email: user.email });
  const res = NextResponse.json({ ok: true, name: user.name, email: user.email });
  res.cookies.set(ADMIN_COOKIE, tok, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresInToSeconds(ADMIN_JWT_EXPIRES_IN),
  });
  return res;
}
