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

  // 4b. Pooling untuk tes serentak. DATABASE_URL yang menunjuk pooler
  // transaksi Supabase (port 6543) WAJIB memakai `pgbouncer=true`, kalau
  // tidak Prisma akan kena "prepared statement s0 already exists" begitu
  // banyak siswa mengerjakan tes bersamaan. Lihat docs/SUPABASE.md.
  if (db) {
    const isTransactionPooler = db.includes(":6543");
    const hasPgBouncerFlag = /[?&]pgbouncer=true/.test(db);
    const hasConnectionLimit = /[?&]connection_limit=/.test(db);
    checks.dbPooling = {
      ok: !isTransactionPooler || (hasPgBouncerFlag && hasConnectionLimit),
      note: !isTransactionPooler
        ? "DATABASE_URL bukan pooler transaksi (:6543). Untuk Vercel + banyak siswa serentak, pakai pooler transaksi — baca docs/SUPABASE.md"
        : !hasPgBouncerFlag
        ? "Pooler :6543 dipakai TANPA ?pgbouncer=true — rawan error 'prepared statement s0 already exists' saat tes serentak"
        : !hasConnectionLimit
        ? "Tambahkan &connection_limit=1 pada DATABASE_URL agar tiap function Vercel tidak menahan banyak koneksi"
        : "Pooler transaksi + pgbouncer=true + connection_limit sudah diset",
    };
  }

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

  // 7. Kolom pemulihan sesi ("Kode Lanjut" + link sekali pakai).
  //
  // Repo ini tidak menjalankan `prisma migrate deploy` saat build, jadi SQL di
  // prisma/sql/ harus di-apply manual di Supabase. Semua kode pemulihan
  // sengaja menelan error "kolom tidak ada" supaya halaman tes tidak ikut
  // mati — efek sampingnya, kalau SQL-nya lupa dijalankan fiturnya GAGAL
  // DIAM-DIAM: submission dibuat tanpa Kode Lanjut, lalu siswa dituduh salah
  // memasukkan kode. Check ini membuat kegagalan itu terlihat.
  try {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'Submission'
            AND column_name IN ('resumeCode', 'resumeLinkJti', 'resumeLinkUsedAt'))
          OR (table_name = 'CfitSubmission'
            AND column_name IN ('resumeCode', 'resumeLinkJti', 'resumeLinkUsedAt'))
        )
    `;
    const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const required: Array<{ column: string; sql: string }> = [
      { column: "Submission.resumeCode", sql: "prisma/sql/0008_submission_resume_code.sql" },
      { column: "Submission.resumeLinkJti", sql: "prisma/sql/0010_resume_link_single_use.sql" },
      { column: "Submission.resumeLinkUsedAt", sql: "prisma/sql/0010_resume_link_single_use.sql" },
      { column: "CfitSubmission.resumeCode", sql: "prisma/sql/0009_cfit_pause_and_resume.sql" },
      { column: "CfitSubmission.resumeLinkJti", sql: "prisma/sql/0010_resume_link_single_use.sql" },
      { column: "CfitSubmission.resumeLinkUsedAt", sql: "prisma/sql/0010_resume_link_single_use.sql" },
    ];
    const missing = required.filter((r) => !have.has(r.column));
    const files = [...new Set(missing.map((r) => r.sql))];
    checks.recoveryColumns = {
      ok: missing.length === 0,
      note:
        missing.length === 0
          ? "Semua kolom pemulihan sesi sudah ada"
          : `Kolom belum ada: ${missing.map((r) => r.column).join(", ")}. ` +
            `Jalankan di Supabase SQL Editor: ${files.join(", ")}. ` +
            "Selama kolom ini belum ada, Kode Lanjut TIDAK pernah dibuat dan siswa tidak bisa melanjutkan tes.",
    };
  } catch (e) {
    checks.recoveryColumns = {
      ok: false,
      note:
        e instanceof Error
          ? e.message.slice(0, 200)
          : "Tidak bisa memeriksa kolom pemulihan sesi",
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
