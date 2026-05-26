import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { signStudentToken } from "@/lib/jwt";
import { setStudentCookie } from "@/lib/auth";

const Body = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .transform((s) => s.trim().toUpperCase()),
  // testKind diambil dari kartu tombol di halaman utama. Bila dikirim, kami
  // wajib memvalidasi cocok dengan jenis tes yang sebenarnya milik token,
  // dan TIDAK boleh memasang cookie student kalau mismatch.
  testKind: z.enum(["MINAT", "BAKAT"]).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { code, testKind: requestedKind } = parsed.data;

  const tok = await prisma.accessToken.findUnique({
    where: { code },
    include: { submission: true },
  });
  if (!tok) return NextResponse.json({ error: "Token tidak ditemukan" }, { status: 404 });
  if (tok.expiresAt < new Date() && !tok.submission) {
    return NextResponse.json({ error: "Token sudah kadaluarsa" }, { status: 410 });
  }
  if (requestedKind && requestedKind !== tok.testKind) {
    // Jangan set cookie. Kembalikan testKind sebenarnya supaya UI bisa
    // mengarahkan peserta ke kartu yang benar.
    return NextResponse.json(
      {
        error: `Token ini untuk ${tok.testKind}, bukan ${requestedKind}.`,
        testKind: tok.testKind,
      },
      { status: 409 },
    );
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
  setStudentCookie(res, jwtTok);
  return res;
}
