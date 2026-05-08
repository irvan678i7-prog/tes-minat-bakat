import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signAdminToken } from "@/lib/jwt";
import { ADMIN_COOKIE } from "@/lib/auth";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
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
    maxAge: 12 * 60 * 60,
  });
  return res;
}
