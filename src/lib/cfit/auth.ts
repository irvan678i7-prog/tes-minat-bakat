import { NextRequest } from "next/server";
import jwt, { type SignOptions } from "jsonwebtoken";
import { JWT_SECRET, STUDENT_JWT_EXPIRES_IN } from "@/lib/env";
import type { CfitFormCode } from "./config";

// Sesi peserta CFIT memakai cookie SENDIRI (tmb_cfit), terpisah dari cookie
// siswa minat-bakat (tmb_student) — supaya peserta bisa mengerjakan CFIT dan
// minat-bakat di browser yang sama tanpa saling menimpa sesi.
export const CFIT_COOKIE = "tmb_cfit";

export type CfitParticipantPayload = {
  sub: string; // CfitSubmission.id
  role: "cfit";
  form: CfitFormCode;
  tokenId: string; // CfitAccessToken.id
};

export function signCfitToken(
  p: CfitParticipantPayload,
  expiresIn: SignOptions["expiresIn"] = STUDENT_JWT_EXPIRES_IN as SignOptions["expiresIn"],
): string {
  return jwt.sign(p, JWT_SECRET, { expiresIn });
}

export function verifyCfitToken(token: string): CfitParticipantPayload | null {
  try {
    const d = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & CfitParticipantPayload;
    if (d.role !== "cfit") return null;
    return { sub: d.sub!, role: "cfit", form: d.form, tokenId: d.tokenId };
  } catch {
    return null;
  }
}

export function getCfitFromRequest(req: NextRequest): CfitParticipantPayload | null {
  const tok = req.cookies.get(CFIT_COOKIE)?.value;
  if (!tok) return null;
  return verifyCfitToken(tok);
}

/** Konversi "3h" / "30m" / angka detik → detik (untuk maxAge cookie). */
export function expiresInToSeconds(v: string | number): number {
  if (typeof v === "number") return v;
  const m = /^(\d+)\s*([smhd])$/.exec(v.trim());
  if (!m) return 3 * 60 * 60;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 60 * 60;
    case "d": return n * 24 * 60 * 60;
    default: return 3 * 60 * 60;
  }
}

/** Bentuk fisik (3A/3B) yang harus dikerjakan untuk satu kode bentuk tes. */
export function formsFor(form: CfitFormCode): Array<"FORM_3A" | "FORM_3B"> {
  return form === "FORM_3AB" ? ["FORM_3A", "FORM_3B"] : [form];
}
