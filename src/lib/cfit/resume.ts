import { randomUUID } from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "@/lib/db";
import { JWT_SECRET } from "@/lib/env";
import { generateResumeCode, isMissingColumnError } from "@/lib/resume";

// PEMULIHAN SESI TES IQ ("Kode Lanjut" CFIT)
//
// Sejajar dengan src/lib/resume.ts milik minat-bakat, tapi memakai tabel
// CfitSubmission dan cookie `tmb_cfit`.
//
// Sebelum ini, identitas sesi tes IQ HANYA cookie `tmb_cfit`. Kalau cookie
// hilang — komputer lab mereset profil browser, siswa pindah komputer,
// incognito, atau JWT-nya kadaluarsa — sesi tes IQ itu HILANG PERMANEN:
// tidak ada kode, tidak ada halaman /lanjut, dan admin pun tidak punya cara
// memulihkannya. Modul ini menutup lubang itu dengan dua jalur yang sama
// seperti minat-bakat:
//   1. Kode Lanjut  — kode pendek milik peserta (CfitSubmission.resumeCode),
//                      dipakai di /lanjut bersama kode tes IQ & nama.
//   2. Link pengawas — token SEKALI PAKAI berumur pendek dari /admin/pemulihan.

const MAX_ATTEMPTS = 8;

// Umur link pemulihan buatan pengawas. Sengaja pendek: link ini melewati
// verifikasi nama, jadi jangan sampai beredar lama di grup WA.
const CFIT_RESUME_LINK_TTL: SignOptions["expiresIn"] = "30m";
export const CFIT_RESUME_LINK_TTL_MINUTES = 30;

export type CfitResumeLinkPayload = {
  sub: string; // CfitSubmission.id
  role: "cfit-resume";
  jti: string; // id token, dicatat di DB supaya benar-benar sekali pakai
};

let warnedMissingColumn = false;
function warnMissingColumnOnce(): void {
  if (warnedMissingColumn) return;
  warnedMissingColumn = true;
  console.warn(
    "[cfit/resume] Kolom resumeCode/resumeLink* belum ada di CfitSubmission. " +
      "Pemulihan sesi tes IQ tidak aktif. Apply " +
      "prisma/sql/0009_cfit_pause_and_resume.sql dan " +
      "prisma/sql/0010_resume_link_single_use.sql.",
  );
}

/** Cari Kode Lanjut CFIT yang belum terpakai. null kalau gagal terus. */
export async function pickFreeCfitResumeCode(): Promise<string | null> {
  try {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const code = generateResumeCode();
      const taken = await prisma.cfitSubmission.findUnique({
        where: { resumeCode: code },
        select: { id: true },
      });
      if (!taken) return code;
    }
    return null;
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    warnMissingColumnOnce();
    return null;
  }
}

/**
 * Pastikan satu sesi tes IQ punya Kode Lanjut. Idempoten: kode yang sudah ada
 * TIDAK pernah diganti supaya peserta yang sudah mencatatnya tidak bingung.
 */
export async function ensureCfitResumeCode(
  submissionId: string,
): Promise<string | null> {
  try {
    const current = await prisma.cfitSubmission.findUnique({
      where: { id: submissionId },
      select: { resumeCode: true },
    });
    if (!current) return null;
    if (current.resumeCode) return current.resumeCode;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const code = generateResumeCode();
      try {
        const updated = await prisma.cfitSubmission.update({
          where: { id: submissionId },
          data: { resumeCode: code },
          select: { resumeCode: true },
        });
        return updated.resumeCode;
      } catch (err) {
        if (isMissingColumnError(err)) {
          warnMissingColumnOnce();
          return null;
        }
        // Bentrok unique (kode sudah dipakai sesi lain) → coba lagi.
      }
    }
    return null;
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    warnMissingColumnOnce();
    return null;
  }
}

/** Cari sesi tes IQ dari Kode Lanjut. null kalau tidak ada / kolom belum ada. */
export async function findCfitSubmissionByResumeCode(code: string) {
  try {
    return await prisma.cfitSubmission.findUnique({
      where: { resumeCode: code },
      select: {
        id: true,
        form: true,
        fullName: true,
        finishedAt: true,
        tokenId: true,
        token: { select: { id: true, code: true, expiresAt: true } },
      },
    });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    warnMissingColumnOnce();
    return null;
  }
}

/**
 * Terbitkan link pemulihan tes IQ. jti dicatat di DB dan `resumeLinkUsedAt`
 * di-reset, jadi link BARU otomatis mematikan link lama.
 */
export async function issueCfitResumeLinkToken(
  submissionId: string,
): Promise<string> {
  const jti = randomUUID();
  const payload: CfitResumeLinkPayload = {
    sub: submissionId,
    role: "cfit-resume",
    jti,
  };
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: CFIT_RESUME_LINK_TTL,
  });
  try {
    await prisma.cfitSubmission.update({
      where: { id: submissionId },
      data: { resumeLinkJti: jti, resumeLinkUsedAt: null },
    });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    warnMissingColumnOnce();
    // Link tetap diterbitkan, hanya belum benar-benar sekali pakai.
  }
  return token;
}

export function verifyCfitResumeLinkToken(
  token: string,
): CfitResumeLinkPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as CfitResumeLinkPayload;
    // Token peserta / admin / link minat-bakat TIDAK boleh dipakai di sini.
    if (!decoded || decoded.role !== "cfit-resume" || !decoded.sub) return null;
    if (!decoded.jti) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Pakai link pemulihan tes IQ SEKALI SAJA. Konsumsi atomik: hanya baris yang
 * jti-nya cocok DAN belum terpakai yang berubah, jadi dua orang yang membuka
 * link sama secara bersamaan tidak bisa dua-duanya masuk.
 */
export async function consumeCfitResumeLinkToken(
  submissionId: string,
  jti: string,
): Promise<boolean> {
  try {
    const res = await prisma.cfitSubmission.updateMany({
      where: { id: submissionId, resumeLinkJti: jti, resumeLinkUsedAt: null },
      data: { resumeLinkUsedAt: new Date() },
    });
    return res.count > 0;
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    warnMissingColumnOnce();
    // Kolom belum ada → jangan matikan pemulihan; link sementara masih bisa
    // dipakai berulang (perilaku lama).
    return true;
  }
}
