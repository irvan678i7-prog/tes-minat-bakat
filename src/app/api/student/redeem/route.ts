import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { signStudentToken } from "@/lib/jwt";
import { STUDENT_COOKIE } from "@/lib/auth";

const Body = z.object({ code: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const code = parsed.data.code.trim().toUpperCase();
  const tok = await prisma.accessToken.findUnique({ where: { code }, include: { submission: true } });
  if (!tok) return NextResponse.json({ error: "Token tidak ditemukan" }, { status: 404 });
  if (tok.expiresAt < new Date() && !tok.submission) {
    return NextResponse.json({ error: "Token sudah kadaluarsa" }, { status: 410 });
  }

  let submission = tok.submission;
  if (!submission) {
    submission = await prisma.submission.create({
      data: {
        tokenId: tok.id,
        testKind: tok.testKind,
        randomSeed: randomUUID(),
      },
    });
    await prisma.accessToken.update({
      where: { id: tok.id },
      data: { redeemedAt: new Date() },
    });
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
    finishedAt: submission.finishedAt,
  });
  res.cookies.set(STUDENT_COOKIE, jwtTok, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // 12 jam: cukup lama supaya tidak putus di tengah tes. Batas waktu tes
    // tetap dikendalikan oleh durationSec per subtes — bukan oleh cookie.
    maxAge: 12 * 60 * 60,
  });
  return res;
}
