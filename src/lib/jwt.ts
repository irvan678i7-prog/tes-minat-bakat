import jwt, { type SignOptions } from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";

export type AdminPayload = { sub: string; role: "admin"; email: string };
export type StudentPayload = {
  sub: string;
  role: "student";
  testKind: "MINAT" | "BAKAT";
  tokenId: string;
};

export function signAdminToken(p: AdminPayload, expiresIn: SignOptions["expiresIn"] = "12h"): string {
  return jwt.sign(p, SECRET, { expiresIn });
}

// Sesi siswa diberi masa berlaku panjang (12 jam) supaya "waktu token" tidak
// memutus sesi di tengah pengerjaan. Batas waktu tes diatur via durationSec
// per subtes — bukan dari masa berlaku JWT.
export function signStudentToken(p: StudentPayload, expiresIn: SignOptions["expiresIn"] = "12h"): string {
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
