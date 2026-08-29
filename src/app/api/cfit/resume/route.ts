import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { STUDENT_JWT_EXPIRES_IN } from "@/lib/env";
import {
  CFIT_COOKIE,
  expiresInToSeconds,
  signCfitToken,
} from "@/lib/cfit/auth";
import { normalizeName, normalizeResumeCode } from "@/lib/resume";
import {
  consumeCfitResumeLinkToken,
  findCfitSubmissionByResumeCode,
  verifyCfitResumeLinkToken,
} from "@/lib/cfit/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PEMULIHAN SESI TES IQ — sejajar dengan /api/student/resume.
//
// Dua jalur:
//   1. Kode Lanjut : { code, resumeCode, fullName } — diverifikasi bertingkat
//      (kode tes IQ kelas + Kode Lanjut + nama peserta).
//   2. Link pengawas: { linkToken } — SEKALI PAKAI, melewati verifikasi nama.
const Body = z.object({
  linkToken: z.string().min(10).optional(),
  code: z.string().min(1).max(32).optional(),
  resumeCode: z.string().min(1).max(16).optional(),
  fullName: z.string().min(1).max(120).optional(),
});

const RESUME_LIMIT = 20;
const RESUME_WINDOW_MS = 5 * 60 * 1000;

function setCookieAndRespond(submission: {
  id: string;
  form: string;
  tokenId: string;
  fullName: string | null;
}) {
  const jwtTok = signCfitToken({
    sub: submission.id,
    role: "cfit",
    form: submission.form as never,
    tokenId: submission.tokenId,
  });
  const res = NextResponse.json({
    ok: true,
    submissionId: submission.id,
    form: submission.form,
    profileFilled: !!submission.fullName,
    fullName: submission.fullName ?? null,
    // Halaman hub tes IQ sendiri yang mengarahkan ke biodata kalau belum diisi.
    redirect: "/cfit/test",
  });
  res.cookies.set(CFIT_COOKIE, jwtTok, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresInToSeconds(STUDENT_JWT_EXPIRES_IN),
  });
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`cfit-resume:${ip}`, RESUME_LIMIT, RESUME_WINDOW_MS);
    if (!rl.ok) {
      const retry = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi nanti." },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Input tidak valid." }, { status: 400 });
    }

    // ── JALUR 1: link pemulihan buatan pengawas (SEKALI PAKAI) ───────────
    if (parsed.data.linkToken) {
      const payload = verifyCfitResumeLinkToken(parsed.data.linkToken);
      if (!payload) {
        return NextResponse.json(
          { error: "Link pemulihan tidak valid atau sudah kadaluarsa. Minta link baru ke pengawas." },
          { status: 401 },
        );
      }
      const submission = await prisma.cfitSubmission.findUnique({
        where: { id: payload.sub },
        select: { id: true, form: true, tokenId: true, fullName: true, finishedAt: true },
      });
      if (!submission) {
        return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
      }
      if (submission.finishedAt) {
        return NextResponse.json({ error: "Sesi ini sudah diselesaikan." }, { status: 409 });
      }
      // Konsumsi atomik: kalau link sudah dipakai (atau sudah digantikan link
      // yang lebih baru), tolak. Ini yang membuat link tidak bisa dipakai
      // ulang oleh siswa lain yang ikut menerimanya di grup WA.
      const consumed = await consumeCfitResumeLinkToken(submission.id, payload.jti);
      if (!consumed) {
        return NextResponse.json(
          { error: "Link pemulihan ini sudah dipakai. Minta link baru ke pengawas." },
          { status: 409 },
        );
      }
      return setCookieAndRespond(submission);
    }

    // ── JALUR 2: Kode Lanjut milik peserta ────────────────────────────
    const code = (parsed.data.code ?? "").trim().toUpperCase();
    const resumeCode = normalizeResumeCode(parsed.data.resumeCode ?? "");
    const fullName = (parsed.data.fullName ?? "").trim();
    if (!code || !resumeCode || !fullName) {
      return NextResponse.json(
        { error: "Isi kode tes IQ, Kode Lanjut, dan nama lengkap." },
        { status: 400 },
      );
    }

    const submission = await findCfitSubmissionByResumeCode(resumeCode);
    // Pesan error SENGAJA disamakan untuk semua kegagalan verifikasi supaya
    // tidak bisa dipakai menebak Kode Lanjut peserta lain.
    const generic = {
      error: "Kode Lanjut tidak cocok dengan kode tes dan nama yang dimasukkan.",
    };
    if (!submission) return NextResponse.json(generic, { status: 404 });
    if (submission.token?.code?.toUpperCase() !== code) {
      return NextResponse.json(generic, { status: 404 });
    }
    if (normalizeName(submission.fullName ?? "") !== normalizeName(fullName)) {
      return NextResponse.json(generic, { status: 404 });
    }
    if (submission.finishedAt) {
      return NextResponse.json({ error: "Sesi ini sudah diselesaikan." }, { status: 409 });
    }

    return setCookieAndRespond({
      id: submission.id,
      form: submission.form as unknown as string,
      tokenId: submission.tokenId,
      fullName: submission.fullName,
    });
  } catch (err) {
    console.error("[cfit/resume] unhandled error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server saat memulihkan sesi." },
      { status: 500 },
    );
  }
}
