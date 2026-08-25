import { randomInt, randomUUID } from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "@/lib/db";
import { JWT_SECRET } from "@/lib/env";

// PEMULIHAN SESI ("Kode Lanjut")
//
// Identitas sesi siswa selama ini HANYA cookie `tmb_student` (JWT berisi
// submissionId). Cookie itu biasanya bertahan walau listrik mati — tapi
// hilang kalau: komputer lab mereset profil browser tiap restart (Deep
// Freeze / mode guest / cleaner), siswa pindah komputer, memakai incognito,
// atau JWT-nya sudah kadaluarsa (6 jam).
//
// File ini menyediakan dua jalur pemulihan:
//   1. Kode Lanjut  — kode pendek milik siswa (Submission.resumeCode),
//                      dipakai di halaman /lanjut bersama token kelas & nama.
//   2. Link pengawas — token SEKALI PAKAI berumur pendek yang dibuat admin
//                      dari /admin/pemulihan, langsung memulihkan sesi.

// Alfabet 32 huruf tanpa karakter yang mudah keliru (0/O, 1/I, dst) — sama
// polanya dengan generator token kelas di src/lib/token.ts.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GROUP = 3; // format ABC-DEF
const MAX_ATTEMPTS = 8;

// Umur link pemulihan buatan pengawas. Sengaja pendek: link ini melewati
// verifikasi nama, jadi jangan sampai beredar lama di grup WA.
const RESUME_LINK_TTL: SignOptions["expiresIn"] = "30m";
export const RESUME_LINK_TTL_MINUTES = 30;

export type ResumeLinkPayload = {
  sub: string; // submissionId
  role: "resume";
  jti: string; // id token, dicatat di DB supaya benar-benar sekali pakai
};

/**
 * Kolom baru (migrasi 0008/0010) mungkin belum ada di database production.
 * Dipakai bersama oleh modul pemulihan minat-bakat & tes IQ supaya kolom yang
 * belum ada tidak pernah menjatuhkan halaman tes.
 */
export function isMissingColumnError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2022" || code === "P2021") return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /resumeCode|resumeLinkJti|resumeLinkUsedAt|does not exist in the current database|Unknown argument|Unknown field/i.test(
    msg,
  );
}

let warnedMissingColumn = false;
function warnMissingColumnOnce(): void {
  if (warnedMissingColumn) return;
  warnedMissingColumn = true;
  console.warn(
    "[resume] Kolom resumeLinkJti/resumeLinkUsedAt belum ada di database. " +
      "Link pemulihan masih bisa dipakai berulang. Apply " +
      "prisma/sql/0010_resume_link_single_use.sql.",
  );
}

/** Bangkitkan satu Kode Lanjut acak, format ABC-DEF. */
export function generateResumeCode(): string {
  let out = "";
  for (let i = 0; i < GROUP * 2; i++) {
    if (i === GROUP) out += "-";
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

/**
 * Rapikan kode yang diketik siswa: huruf besar, buang spasi/tanda hubung,
 * lalu pasang kembali tanda hubungnya. Jadi "abc def", "abcdef", dan
 * "ABC-DEF" semuanya diterima.
 */
export function normalizeResumeCode(raw: string): string {
  const clean = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length <= GROUP) return clean;
  return `${clean.slice(0, GROUP)}-${clean.slice(GROUP, GROUP * 2)}`;
}

/** Cari kode yang belum terpakai. Mengembalikan null kalau gagal terus. */
export async function pickFreeResumeCode(): Promise<string | null> {
  try {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const code = generateResumeCode();
      const taken = await prisma.submission.findUnique({
        where: { resumeCode: code },
        select: { id: true },
      });
      if (!taken) return code;
    }
    return null;
  } catch (err) {
    // Kolom belum ada (0008 belum di-apply) → redeem TIDAK boleh gagal.
    if (!isMissingColumnError(err)) throw err;
    return null;
  }
}

/**
 * Pastikan sebuah submission punya Kode Lanjut. Idempoten: kalau sudah ada,
 * kode yang lama dikembalikan apa adanya (kode tidak pernah berubah supaya
 * siswa yang sudah mencatatnya tidak bingung).
 */
export async function ensureResumeCode(submissionId: string): Promise<string | null> {
  try {
    const current = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { resumeCode: true },
    });
    if (!current) return null;
    if (current.resumeCode) return current.resumeCode;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const code = generateResumeCode();
      try {
        const updated = await prisma.submission.update({
          where: { id: submissionId },
          data: { resumeCode: code },
          select: { resumeCode: true },
        });
        return updated.resumeCode;
      } catch {
        // Bentrok unique (kode sudah dipakai submission lain) → coba lagi.
      }
    }
    return null;
  } catch {
    // Kolom belum ada di DB (migrasi 0008 belum di-apply) → jangan sampai
    // menjatuhkan halaman tes. Fitur Kode Lanjut sekadar tidak tampil.
    return null;
  }
}

/**
 * Terbitkan link pemulihan (dibuat pengawas). Umur pendek DAN sekali pakai:
 * `jti` dicatat di baris submission, `resumeLinkUsedAt` di-reset. Karena jti
 * yang dicatat hanya SATU, menerbitkan link baru otomatis mematikan link lama
 * yang mungkin masih beredar di grup WA.
 */
export async function issueResumeLinkToken(submissionId: string): Promise<string> {
  const jti = randomUUID();
  const payload: ResumeLinkPayload = { sub: submissionId, role: "resume", jti };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: RESUME_LINK_TTL });
  try {
    await prisma.submission.update({
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

export function verifyResumeLinkToken(token: string): ResumeLinkPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as ResumeLinkPayload;
    // Token student & admin TIDAK boleh dipakai sebagai link pemulihan.
    if (!decoded || decoded.role !== "resume" || !decoded.sub) return null;
    // Token lama tanpa jti tidak bisa dipastikan sekali pakai → tolak.
    if (!decoded.jti) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Pakai link pemulihan SEKALI SAJA. Konsumsi atomik lewat updateMany dengan
 * filter `resumeLinkUsedAt: null`, jadi kalau link tersebar di grup WA dan
 * dibuka beberapa orang sekaligus, hanya SATU yang berhasil masuk.
 */
export async function consumeResumeLinkToken(
  submissionId: string,
  jti: string,
): Promise<boolean> {
  try {
    const res = await prisma.submission.updateMany({
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

/** Terjemahkan "6h" / "90m" / angka detik → detik. Untuk maxAge cookie. */
export function expiresInToSeconds(v: string | number): number {
  if (typeof v === "number") return v;
  const m = /^(\d+)\s*([smhd])$/.exec(String(v).trim());
  if (!m) return 6 * 60 * 60;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 60 * 60;
    case "d": return n * 24 * 60 * 60;
    default: return 6 * 60 * 60;
  }
}

/** Samakan bentuk nama untuk verifikasi: huruf kecil, spasi dirapikan. */
export function normalizeName(v: string): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}
