import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { verifyAdminToken, verifyStudentToken, type AdminPayload, type StudentPayload } from "./jwt";

export const ADMIN_COOKIE = "tmb_admin";
export const STUDENT_COOKIE = "tmb_student";

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
