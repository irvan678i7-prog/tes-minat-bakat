-- =====================================================================
-- HOTFIX: SubtestProgress.finishedAt & finishReason columns
-- =====================================================================
-- Issue:
--   PrismaClientKnownRequestError (P2022):
--   The column `SubtestProgress.finishedAt` does not exist in the current database.
--
-- Cause:
--   Repo ini tidak memakai `prisma/migrations/` — schema disinkron ke
--   database via `prisma db push`. PR #22 (subtest-lock) menambahkan dua
--   kolom baru ke model `SubtestProgress` (`finishedAt`, `finishReason`),
--   tapi `db push` belum dijalankan ke database production sehingga
--   schema Prisma client di kode tidak cocok dengan struktur tabel di DB.
--
-- Fix:
--   Tambahkan dua kolom yang hilang. Idempotent — aman dijalankan ulang.
--
-- Cara apply:
--   Buka Supabase Dashboard → SQL Editor → paste isi file ini → Run.
--   Atau via psql:
--     psql "$DATABASE_URL" -f prisma/sql/0001_subtestprogress_lock_columns.sql
--
-- =====================================================================

ALTER TABLE "SubtestProgress"
  ADD COLUMN IF NOT EXISTS "finishedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finishReason" TEXT;
