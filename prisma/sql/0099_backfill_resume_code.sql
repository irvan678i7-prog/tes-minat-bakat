-- 0099_backfill_resume_code.sql
--
-- BACKFILL "KODE LANJUT" UNTUK SESI YANG SUDAH ADA.
--
-- Kenapa perlu: kode di 0008/0010 sengaja menelan error "kolom belum ada"
-- supaya halaman tes tidak ikut mati. Akibatnya, selama SQL 0008 belum
-- di-apply, setiap submission dibuat dengan resumeCode = NULL — tanpa suara.
-- Setelah 0008 dijalankan, sesi BARU otomatis dapat kode, tapi sesi yang
-- sudah berjalan (siswa yang kemarin keluar dan tidak bisa lanjut) tetap
-- NULL, jadi tidak bisa dipulihkan lewat halaman /lanjut.
--
-- Script ini mengisi kode untuk semua sesi yang BELUM selesai.
-- Format & alfabetnya sama dengan generateResumeCode() di src/lib/resume.ts:
-- 6 karakter dari "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" (tanpa 0/O/1/I supaya
-- tidak salah baca), dipisah tanda hubung → ABC-DEF.
--
-- URUTAN: jalankan 0008 (dan 0009 kalau tes IQ dipakai) LEBIH DULU.
-- Aman dijalankan berulang: baris yang sudah punya kode tidak disentuh.

-- ── Minat-bakat ────────────────────────────────────────────────────────────
DO $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  rec RECORD;
  raw TEXT;
  candidate TEXT;
  i INT;
  attempts INT;
  filled INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Submission'
      AND column_name = 'resumeCode'
  ) THEN
    RAISE NOTICE 'Kolom Submission.resumeCode belum ada — jalankan 0008 dulu. Bagian minat-bakat dilewati.';
    RETURN;
  END IF;

  FOR rec IN
    SELECT "id" FROM "Submission"
    WHERE "resumeCode" IS NULL AND "finishedAt" IS NULL
  LOOP
    attempts := 0;
    LOOP
      attempts := attempts + 1;
      raw := '';
      FOR i IN 1..6 LOOP
        raw := raw || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      candidate := substr(raw, 1, 3) || '-' || substr(raw, 4, 3);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Submission" WHERE "resumeCode" = candidate);
      IF attempts >= 20 THEN
        RAISE EXCEPTION 'Gagal menemukan Kode Lanjut unik untuk Submission %', rec."id";
      END IF;
    END LOOP;

    UPDATE "Submission" SET "resumeCode" = candidate WHERE "id" = rec."id";
    filled := filled + 1;
  END LOOP;

  RAISE NOTICE 'Minat-bakat: % sesi diberi Kode Lanjut.', filled;
END $$;

-- ── Tes IQ (CFIT) ──────────────────────────────────────────────────────────
DO $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  rec RECORD;
  raw TEXT;
  candidate TEXT;
  i INT;
  attempts INT;
  filled INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CfitSubmission'
      AND column_name = 'resumeCode'
  ) THEN
    RAISE NOTICE 'Kolom CfitSubmission.resumeCode belum ada — jalankan 0009 dulu. Bagian tes IQ dilewati.';
    RETURN;
  END IF;

  FOR rec IN
    SELECT "id" FROM "CfitSubmission"
    WHERE "resumeCode" IS NULL AND "finishedAt" IS NULL
  LOOP
    attempts := 0;
    LOOP
      attempts := attempts + 1;
      raw := '';
      FOR i IN 1..6 LOOP
        raw := raw || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      candidate := substr(raw, 1, 3) || '-' || substr(raw, 4, 3);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "CfitSubmission" WHERE "resumeCode" = candidate);
      IF attempts >= 20 THEN
        RAISE EXCEPTION 'Gagal menemukan Kode Lanjut unik untuk CfitSubmission %', rec."id";
      END IF;
    END LOOP;

    UPDATE "CfitSubmission" SET "resumeCode" = candidate WHERE "id" = rec."id";
    filled := filled + 1;
  END LOOP;

  RAISE NOTICE 'Tes IQ: % sesi diberi Kode Lanjut.', filled;
END $$;

-- Lihat hasilnya (berikan kode ini ke siswa yang kemarin terputus):
-- SELECT "fullName", "school", "grade", "resumeCode", "startedAt"
-- FROM "Submission" WHERE "finishedAt" IS NULL ORDER BY "startedAt" DESC;
