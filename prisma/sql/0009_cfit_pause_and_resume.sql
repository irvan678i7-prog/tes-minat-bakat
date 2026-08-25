-- 0009_cfit_pause_and_resume.sql
--
-- ANTI MATI LAMPU UNTUK TES IQ (CFIT).
--
-- Timer sadar-jeda + "Kode Lanjut" sudah dipasang untuk minat-bakat lewat
-- 0007 (SubtestProgress) dan 0008 (Submission.resumeCode), TAPI tabel CFIT
-- dulu tidak ikut diperbaiki. Akibatnya tes IQ masih memakai timer jam
-- dinding (deadline = startedAt + durationSec) sehingga mati lampu tetap
-- menghabiskan waktu subtes, dan sesi CFIT yang cookie-nya hilang TIDAK BISA
-- dipulihkan sama sekali (bahkan oleh admin).
--
-- File ini menutup dua lubang itu sekaligus:
--   1. CfitSubtestProgress  → kolom waktu aktif & statistik jeda.
--   2. CfitSubmission        → kolom resumeCode (Kode Lanjut) + unique index.
--
-- Idempoten: aman dijalankan ulang.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Timer sadar-jeda per subtes CFIT
-- ───────────────────────────────────────────────────────────────────────────
-- consumedSec : waktu AKTIF yang sudah terpakai (detik). Inilah yang dipakai
--               timer, bukan (now - startedAt).
-- lastSeenAt  : denyut terakhir dari browser peserta (heartbeat / kirim
--               jawaban / buka halaman subtes).
-- pauseCount  : berapa kali sesi terputus.
-- pausedSec   : total detik jeda yang DIMAAFKAN (maks CFIT_PAUSE_BUDGET_SEC
--               = 300 detik, lihat src/lib/cfit/lock.ts — sengaja lebih kecil
--               dari minat-bakat karena satu subtes CFIT hanya 150-240 detik).
ALTER TABLE "CfitSubtestProgress" ADD COLUMN IF NOT EXISTS "consumedSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CfitSubtestProgress" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "CfitSubtestProgress" ADD COLUMN IF NOT EXISTS "pauseCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CfitSubtestProgress" ADD COLUMN IF NOT EXISTS "pausedSec" INTEGER NOT NULL DEFAULT 0;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. "Kode Lanjut" untuk sesi tes IQ
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "CfitSubmission" ADD COLUMN IF NOT EXISTS "resumeCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CfitSubmission_resumeCode_key"
  ON "CfitSubmission" ("resumeCode");

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Backfill sesi yang sudah ada (pola sama dengan 0007)
-- ───────────────────────────────────────────────────────────────────────────
-- Tanpa backfill, subtes lama punya consumedSec = 0 sehingga terlihat "masih
-- punya waktu penuh" padahal sudah dikerjakan/dikunci.

-- 3a. Subtes yang SUDAH terkunci: waktu terpakai = finishedAt - startedAt,
--     dibatasi durasi subtes.
UPDATE "CfitSubtestProgress" AS sp
SET "consumedSec" = LEAST(
      GREATEST(FLOOR(EXTRACT(EPOCH FROM (sp."finishedAt" - sp."startedAt")))::int, 0),
      st."durationSec"
    ),
    "lastSeenAt" = COALESCE(sp."lastSeenAt", sp."finishedAt")
FROM "CfitSubtest" AS st
WHERE st."id" = sp."subtestId"
  AND sp."finishedAt" IS NOT NULL
  AND sp."consumedSec" = 0;

-- 3b. Subtes yang MASIH berjalan saat migrasi dijalankan: anggap waktu
--     terpakai = now - startedAt (perilaku lama), lalu mulai hitung
--     sadar-jeda dari titik ini. Karena itu migrasi ini sebaiknya dijalankan
--     SAAT TIDAK ADA SESI TES BERJALAN.
UPDATE "CfitSubtestProgress" AS sp
SET "consumedSec" = LEAST(
      GREATEST(FLOOR(EXTRACT(EPOCH FROM (NOW() - sp."startedAt")))::int, 0),
      st."durationSec"
    ),
    "lastSeenAt" = COALESCE(sp."lastSeenAt", NOW())
FROM "CfitSubtest" AS st
WHERE st."id" = sp."subtestId"
  AND sp."finishedAt" IS NULL
  AND sp."consumedSec" = 0;
