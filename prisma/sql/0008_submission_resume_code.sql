-- 0008_submission_resume_code.sql
-- "Kode Lanjut" — kode pemulihan sesi di tabel Submission.
--
-- Sebelum ini, satu-satunya penanda sesi siswa adalah cookie `tmb_student`.
-- Kalau cookie hilang (komputer lab mereset profil browser setiap restart,
-- siswa pindah komputer, atau memakai mode incognito), sesi lama TIDAK bisa
-- dijangkau lagi: membuka link kelas hanya membuat Submission baru dan
-- jawaban lama jadi yatim.
--
-- Dengan kolom ini, tiap Submission punya kode pendek unik (format ABC-DEF)
-- yang bisa dipakai di halaman /lanjut untuk melanjutkan sesi yang sama.
--
-- Aman dijalankan berulang (idempoten). Jalankan di Supabase SQL Editor.

ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "resumeCode" TEXT;

-- Unique index: Postgres mengizinkan banyak baris NULL pada unique index,
-- jadi submission lama yang belum punya kode tidak bentrok.
CREATE UNIQUE INDEX IF NOT EXISTS "Submission_resumeCode_key"
  ON "Submission" ("resumeCode");
