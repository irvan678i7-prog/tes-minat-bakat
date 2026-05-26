import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint diagnostik publik (READ-ONLY, tanpa secret) untuk membantu
 * troubleshooting di production. Tidak membocorkan nilai env — hanya
 * boolean "ada / tidak" + panjang minimum.
 *
 * Dibuat karena saat login gagal dengan 500, admin sulit tahu apakah
 * masalahnya di JWT_SECRET, DATABASE_URL, atau konektivitas DB.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; note: string }> = {};

  // 1. NODE_ENV
  checks.nodeEnv = {
    ok: true,
    note: process.env.NODE_ENV || "(unset)",
  };

  // 2. JWT_SECRET — wajib di production, min 32 char.
  const jwt = process.env.JWT_SECRET || "";
  checks.jwtSecret = {
    ok: jwt.length >= 32,
    note:
      jwt.length === 0
        ? "JWT_SECRET tidak diset di Vercel env"
        : jwt.length < 32
        ? `JWT_SECRET hanya ${jwt.length} karakter (butuh ≥32)`
        : `JWT_SECRET ada (${jwt.length} chars)`,
  };

  // 3. DATABASE_URL — wajib, format postgres://...
  const db = process.env.DATABASE_URL || "";
  checks.databaseUrl = {
    ok: db.startsWith("postgres://") || db.startsWith("postgresql://"),
    note:
      db.length === 0
        ? "DATABASE_URL tidak diset"
        : !db.startsWith("postgres")
        ? "DATABASE_URL bukan postgres:// atau postgresql://"
        : `DATABASE_URL terlihat valid (${db.length} chars)`,
  };

  // 4. DIRECT_URL — opsional, tapi wajib kalau pakai pgbouncer (Supabase).
  const direct = process.env.DIRECT_URL || "";
  checks.directUrl = {
    ok: true,
    note: direct ? `DIRECT_URL set (${direct.length} chars)` : "(tidak diset, opsional)",
  };

  // 5. Konektivitas DB — coba SELECT 1.
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.dbConnection = { ok: true, note: "Berhasil query DB" };
  } catch (e) {
    checks.dbConnection = {
      ok: false,
      note: e instanceof Error ? e.message.slice(0, 200) : "Unknown DB error",
    };
  }

  // 6. AdminUser table populated?
  try {
    const count = await prisma.adminUser.count();
    checks.adminUsers = {
      ok: count > 0,
      note:
        count === 0
          ? "Tabel AdminUser kosong — jalankan `prisma db seed` atau buat user manual"
          : `${count} admin user(s) terdaftar`,
    };
  } catch (e) {
    checks.adminUsers = {
      ok: false,
      note: e instanceof Error ? e.message.slice(0, 200) : "Tidak bisa query AdminUser",
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "OK" : "PROBLEM",
      checks,
      hint: allOk
        ? "Semua check lolos. Kalau login masih gagal, kemungkinan kombinasi email/password salah."
        : "Setidaknya satu check gagal. Periksa note di tiap check.",
    },
    { status: allOk ? 200 : 503 },
  );
}
