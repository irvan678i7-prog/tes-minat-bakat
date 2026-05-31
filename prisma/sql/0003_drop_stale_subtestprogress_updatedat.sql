-- =====================================================================
-- HOTFIX: Drop stale `updatedAt` column from `SubtestProgress`
-- =====================================================================
-- Issue:
--   PrismaClientKnownRequestError (P2011):
--   Null constraint violation on the fields: (`updatedAt`)
--   pada prisma.subtestProgress.upsert()
--
-- Cause:
--   Sama seperti hotfix 0002 (kolom `userId`): DB production punya kolom
--   `updatedAt` NOT NULL di tabel `SubtestProgress` yang sudah tidak ada
--   di `prisma/schema.prisma` saat ini. `prisma db push` tidak otomatis
--   menghapus kolom yang sudah tidak ada di schema, jadi kolom lama itu
--   tetap di DB dengan constraint NOT NULL → setiap INSERT/UPSERT gagal.
--
-- Fix:
--   Drop kolom `updatedAt`. Idempotent.
--
-- Cara apply:
--   Buka Supabase Dashboard → SQL Editor → paste isi file ini → Run.
--
-- =====================================================================

ALTER TABLE "SubtestProgress"
  DROP COLUMN IF EXISTS "updatedAt";
