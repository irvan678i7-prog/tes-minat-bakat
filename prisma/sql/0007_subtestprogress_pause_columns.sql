-- 0007_subtestprogress_pause_columns.sql
-- Timer sadar-jeda (pause-aware) untuk subtes minat-bakat.
--
-- Sebelumnya timer memakai jam dinding: deadline = startedAt + durationSec.
-- Akibatnya kalau listrik mati / browser tertutup, waktu tetap habis dan
-- subtes terkunci TIME_UP walau siswa belum mengerjakan.
--
-- Setelah migrasi ini, timer memakai `consumedSec` = akumulasi waktu AKTIF
-- (bertambah dari denyut/heartbeat, pengiriman jawaban, dan pembukaan
-- halaman). Selisih waktu saat browser mati dihitung sebagai jeda dan
-- DIMAAFKAN maksimal 600 detik (10 menit) per subtes; sisanya tetap
-- dihitung sebagai waktu terpakai.
--
-- Aman dijalankan berulang (idempoten). Jalankan di Supabase SQL Editor.

ALTER TABLE "SubtestProgress" ADD COLUMN IF NOT EXISTS "consumedSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubtestProgress" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "SubtestProgress" ADD COLUMN IF NOT EXISTS "pauseCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubtestProgress" ADD COLUMN IF NOT EXISTS "pausedSec" INTEGER NOT NULL DEFAULT 0;

-- Backfill 1 — subtes yang SUDAH terkunci: anggap waktunya terpakai sesuai
-- lama pengerjaan (dibatasi durasi subtes). Tanpa ini, rekap lama akan
-- terlihat seperti "0 detik terpakai".
UPDATE "SubtestProgress" sp
SET "consumedSec" = LEAST(
      GREATEST(FLOOR(EXTRACT(EPOCH FROM (sp."finishedAt" - sp."startedAt")))::int, 0),
      s."durationSec"
    )
FROM "Subtest" s
WHERE s."id" = sp."subtestId"
  AND sp."finishedAt" IS NOT NULL
  AND sp."consumedSec" = 0;

-- Backfill 2 — subtes yang SEDANG berjalan saat migrasi: waktu yang sudah
-- lewat tetap dihitung terpakai, jadi tidak ada peserta yang tiba-tiba
-- mendapat waktu penuh lagi karena migrasi ini.
UPDATE "SubtestProgress" sp
SET "consumedSec" = LEAST(
      GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - sp."startedAt")))::int, 0),
      s."durationSec"
    ),
    "lastSeenAt" = now()
FROM "Subtest" s
WHERE s."id" = sp."subtestId"
  AND sp."finishedAt" IS NULL
  AND sp."consumedSec" = 0;
