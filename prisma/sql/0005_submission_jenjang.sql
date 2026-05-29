-- Tambah kolom `jenjang` di `Submission`.
--
-- Jenjang pendidikan peserta ("SMP" / "SMA" / "SMK") dipilih saat mengisi
-- data diri di awal tes, dan menentukan bentuk rekomendasi di laporan PDF
-- (SMP: lanjut SMA/SMK + jurusan, SMA: kuliah + karir, SMK: pekerjaan + jurusan).
--
-- Idempotent: aman dijalankan ulang.

ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "jenjang" TEXT;
