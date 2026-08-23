import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signStudentToken } from "@/lib/jwt";
import { STUDENT_COOKIE } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { STUDENT_JWT_EXPIRES_IN } from "@/lib/env";
import {
  expiresInToSeconds,
  normalizeName,
  normalizeResumeCode,
  verifyResumeLinkToken,
} from "@/lib/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  // Jalur 1 — siswa mengetik sendiri.
  classCode: z.string().min(1).max(32).optional(),
  resumeCode: z.string().min(1).max(32).optional(),
  fullName: z.string().min(1).max(120).optional(),
  // Jalur 2 — link buatan pengawas (/lanjut?t=...).
  linkToken: z.string().min(10).max(4000).optional(),
});

// 15 percobaan / 5 menit per IP. Kode Lanjut hanya 6 karakter, jadi limit ini
// yang menahan percobaan menebak, ditambah verifikasi token kelas & nama.
const RESUME_LIMIT = 15;
const RESUME_WINDOW_MS = 5 * 60 * 1000;

// MELANJUTKAN SESI YANG TERPUTUS.
// Endpoint ini TIDAK pernah membuat Submission baru — ia hanya memasang
// kembali cookie sesi ke submission yang SUDAH ada, sehingga seluruh jawaban
// dan sisa waktu subtes (consumedSec) tetap utuh.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`student-resume:${ip}`, RESUME_LIMIT, RESUME_WINDOW_MS);
    if (!rl.ok) {
      const retry = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi beberapa menit." },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Input tidak valid." }, { status: 400 });
    }

    let submission: {
      id: string;
      testKind: "MINAT" | "BAKAT";
      tokenId: string;
      fullName: string | null;
      finishedAt: Date | null;
      token: { code: string };
    } | null = null;

    if (parsed.data.linkToken) {
      // ── Jalur 2: link pemulihan dari pengawas ──────────────────────────
      const payload = verifyResumeLinkToken(parsed.data.linkToken);
      if (!payload) {
        return NextResponse.json(
          { error: "Link pemulihan tidak valid atau sudah kadaluarsa. Minta link baru ke pengawas." },
          { status: 401 },
        );
      }
      submission = await prisma.submission.findUnique({
        where: { id: payload.sub },
        select: {
          id: true, testKind: true, tokenId: true, fullName: true, finishedAt: true,
          token: { select: { code: true } },
        },
      });
      if (!submission) {
        return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
      }
    } else {
      // ── Jalur 1: siswa mengetik token kelas + Kode Lanjut + nama ────────
      const classCode = (parsed.data.classCode ?? "").trim().toUpperCase();
      const resumeCode = normalizeResumeCode(parsed.data.resumeCode ?? "");
      const fullName = (parsed.data.fullName ?? "").trim();
      if (!classCode || !resumeCode || !fullName) {
        return NextResponse.json(
          { error: "Isi kode token kelas, Kode Lanjut, dan nama lengkap." },
          { status: 400 },
        );
      }
      submission = await prisma.submission.findUnique({
        where: { resumeCode },
        select: {
          id: true, testKind: true, tokenId: true, fullName: true, finishedAt: true,
          token: { select: { code: true } },
        },
      });
      if (!submission) {
        return NextResponse.json(
          { error: "Kode Lanjut tidak ditemukan. Periksa kembali, atau minta bantuan pengawas." },
          { status: 404 },
        );
      }
      if (submission.token.code !== classCode) {
        return NextResponse.json(
          { error: "Kode Lanjut tidak cocok dengan token kelas yang dimasukkan." },
          { status: 409 },
        );
      }
      // Verifikasi nama — penjaga terakhir supaya siswa lain tidak bisa
      // membajak sesi hanya dengan kode yang terlihat di layar.
      if (submission.fullName && normalizeName(submission.fullName) !== normalizeName(fullName)) {
        return NextResponse.json(
          { error: "Nama tidak cocok dengan data sesi. Minta bantuan pengawas." },
          { status: 403 },
        );
      }
    }

    if (submission.finishedAt) {
      return NextResponse.json(
        { error: "Tes pada sesi ini sudah selesai dan tidak bisa dilanjutkan." },
        { status: 409 },
      );
    }

    const jwtTok = signStudentToken({
      sub: submission.id,
      role: "student",
      testKind: submission.testKind,
      tokenId: submission.tokenId,
    });
    const res = NextResponse.json({
      ok: true,
      testKind: submission.testKind,
      profileFilled: !!submission.fullName,
      redirect: submission.fullName ? "/test" : "/test/profile",
    });
    res.cookies.set(STUDENT_COOKIE, jwtTok, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: expiresInToSeconds(STUDENT_JWT_EXPIRES_IN),
    });
    return res;
  } catch (err) {
    console.error("[resume] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Terjadi kesalahan server: ${msg}` }, { status: 500 });
  }
}
