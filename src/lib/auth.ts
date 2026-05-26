import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken, verifyStudentToken, type AdminPayload, type StudentPayload } from "./jwt";

export const ADMIN_COOKIE = "tmb_admin";
export const STUDENT_COOKIE = "tmb_student";

const ADMIN_TTL_SEC = 12 * 60 * 60;
const STUDENT_TTL_SEC = 3 * 60 * 60;

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function setAdminCookie(res: NextResponse, token: string) {
  res.cookies.set(ADMIN_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: ADMIN_TTL_SEC,
  });
}

export function setStudentCookie(res: NextResponse, token: string) {
  res.cookies.set(STUDENT_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: STUDENT_TTL_SEC,
  });
}

/**
 * Hapus cookie dengan attribute yang sama persis seperti saat di-set.
 * Beberapa browser menolak menghapus cookie kalau atribut (httpOnly,
 * sameSite, secure, path) tidak cocok.
 */
export function clearAdminCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE, "", {
    ...baseCookieOptions(),
    maxAge: 0,
  });
}

export function clearStudentCookie(res: NextResponse) {
  res.cookies.set(STUDENT_COOKIE, "", {
    ...baseCookieOptions(),
    maxAge: 0,
  });
}

export async function getAdminFromCookies(): Promise<AdminPayload | null> {
  const c = await cookies();
  const tok = c.get(ADMIN_COOKIE)?.value;
  if (!tok) return null;
  return verifyAdminToken(tok);
}

export async function getStudentFromCookies(): Promise<StudentPayload | null> {
  const c = await cookies();
  const tok = c.get(STUDENT_COOKIE)?.value;
  if (!tok) return null;
  return verifyStudentToken(tok);
}

export function getAdminFromRequest(req: NextRequest): AdminPayload | null {
  const tok = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!tok) return null;
  return verifyAdminToken(tok);
}

export function getStudentFromRequest(req: NextRequest): StudentPayload | null {
  const tok = req.cookies.get(STUDENT_COOKIE)?.value;
  if (!tok) return null;
  return verifyStudentToken(tok);
}
