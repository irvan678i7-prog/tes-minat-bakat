import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { STUDENT_JWT_EXPIRES_IN } from "@/lib/env";
import {
  CFIT_COOKIE,
  expiresInToSeconds,
  getCfitFromRequest,
  signCfitToken,
} from "@/lib/cfit/auth";
import { pickFreeCfitResumeCode } from "@/lib/cfit/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(1).max(32),
  // forceNew = true → abaikan cookie yang ada, buat submission baru
  // (peserta bergantian di browser/HP yang sama).
  forceNew: z.boolean().optional(),
});

const REDEEM_LIMIT = 20;
const REDEEM_WINDOW_MS = 5 * 60 * 1000;

type NewSubmissionData = {
  tokenId: string;
  // Sesi baru wajib lengkap; bentuk tunggal tetap dipakai bank soal/data lama.
  form: "FORM_3AB";
  school: string | null;
  grade: string | null;
  randomSeed: string;
};

/**
 * Buat sesi baru + "Kode Lanjut" sekaligus, TAPI kode tidak boleh pernah
 * menjatuhkan redeem: kalau kodenya bentrok (P2002, peluangnya 1 : 1,07
 * miliar) atau kolomnya belum ada di DB (migrasi 0009 belum di-apply), sesi
 * tetap dibuat TANPA kode. Peserta harus bisa mulai tes apa pun yang terjadi;
 * kode bisa dibuat menyusul oleh /api/cfit/resume-code.
 */
async function createSubmissionWithResumeCode(data: NewSubmissionData) {
  const resumeCode = await pickFreeCfitResumeCode().catch(() => null);
  if (resumeCode) {
    try {
      return await prisma.cfitSubmission.create({ data: { ...data, resumeCode } });
    } catch (err) {
      console.warn(
        "[cfit/redeem] gagal menyimpan resumeCode, sesi dibuat tanpa Kode Lanjut:",
        err,
      );
    }
  }
  return prisma.cfitSubmission.create({ data });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`cfit-redeem:${ip}`, REDEEM_LIMIT, REDEEM_WINDOW_MS);
    if (!rl.ok) {
      const retry = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi nanti." },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Input tidak valid. Pastikan kode token terisi." }, { status: 400 });
    }
    const code = parsed.data.code.trim().toUpperCase();
    const tok = await prisma.cfitAccessToken.findUnique({ where: { code } });
    if (!tok) {
      return NextResponse.json({ error: `Token "${code}" tidak ditemukan. Periksa kembali kode token.` }, { status: 404 });
    }

    // Class/broadcast token: 1 token = banyak peserta. Browser yang sama
    // (refresh) → resume submission lama lewat cookie. Token expired hanya
    // melarang submission BARU.
    const existing = parsed.data.forceNew ? null : getCfitFromRequest(req);
    let submission =
      existing && existing.tokenId === tok.id
        ? await prisma.cfitSubmission.findUnique({ where: { id: existing.sub } })
        : null;
    if (submission && submission.tokenId !== tok.id) submission = null;

    if (!submission) {
      if (tok.expiresAt < new Date()) {
        return NextResponse.json({ error: "Token sudah kadaluarsa. Minta token baru ke admin." }, { status: 410 });
      }
      // Bentuk A/B tetap diperlukan untuk bank soal dan riwayat peserta.
      // Tolak hanya sesi BARU satu bentuk; sesi lama di atas tetap boleh resume.
      if (tok.form !== "FORM_3AB") {
        return NextResponse.json(
          { error: "Tes IQ baru wajib lengkap 3A + 3B. Token ini hanya untuk satu bentuk. Minta token 3A + 3B ke admin." },
          { status: 410 },
        );
      }
      // Sekolah & kelas diwarisi dari token (diisi admin saat membuat token),
      // supaya semua peserta satu sesi punya tulisan yang identik.
      submission = await createSubmissionWithResumeCode({
        tokenId: tok.id,
        form: tok.form,
        school: tok.school,
        grade: tok.grade,
        randomSeed: randomUUID(),
      });
      if (!tok.redeemedAt) {
        await prisma.cfitAccessToken.updateMany({
          where: { id: tok.id, redeemedAt: null },
          data: { redeemedAt: new Date() },
        });
      }
    }

    const jwtTok = signCfitToken({
      sub: submission.id,
      role: "cfit",
      form: tok.form,
      tokenId: tok.id,
    });
    const res = NextResponse.json({
      ok: true,
      submissionId: submission.id,
      form: tok.form,
      profileFilled: !!submission.fullName,
      fullName: submission.fullName ?? null,
      finishedAt: submission.finishedAt,
    });
    res.cookies.set(CFIT_COOKIE, jwtTok, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: expiresInToSeconds(STUDENT_JWT_EXPIRES_IN),
    });
    return res;
  } catch (err) {
    console.error("[cfit/redeem] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Terjadi kesalahan server: ${msg}` }, { status: 500 });
  }
}
