import jwt, { type SignOptions } from "jsonwebtoken";
import { ADMIN_JWT_EXPIRES_IN, JWT_SECRET, STUDENT_JWT_EXPIRES_IN } from "./env";

const SECRET = JWT_SECRET;

export type AdminPayload = { sub: string; role: "admin"; email: string };
export type StudentPayload = {
  sub: string;
  role: "student";
  testKind: "MINAT" | "BAKAT";
  tokenId: string;
};

export function signAdminToken(
  p: AdminPayload,
  expiresIn: SignOptions["expiresIn"] = ADMIN_JWT_EXPIRES_IN as SignOptions["expiresIn"],
): string {
  return jwt.sign(p, SECRET, { expiresIn });
}

// Sesi siswa diberi masa berlaku menengah (3 jam) — cukup untuk semua subtes
// BAKAT (max ~64 menit) + buffer kalau ada gangguan jaringan. Sebelumnya 12
// jam terlalu panjang dari sisi keamanan.
export function signStudentToken(
  p: StudentPayload,
  expiresIn: SignOptions["expiresIn"] = STUDENT_JWT_EXPIRES_IN as SignOptions["expiresIn"],
): string {
  return jwt.sign(p, SECRET, { expiresIn });
}

export function verifyAdminToken(token: string): AdminPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload & AdminPayload;
    if (decoded.role !== "admin") return null;
    return { sub: decoded.sub!, role: "admin", email: decoded.email };
  } catch {
    return null;
  }
}

export function verifyStudentToken(token: string): StudentPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload & StudentPayload;
    if (decoded.role !== "student") return null;
    return {
      sub: decoded.sub!,
      role: "student",
      testKind: decoded.testKind,
      tokenId: decoded.tokenId,
    };
  } catch {
    return null;
  }
}
