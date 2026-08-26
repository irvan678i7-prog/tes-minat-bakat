-- 0011: Kolom sekolah/kelas di tabel TOKEN — perbaikan drift schema.
--
-- GEJALA
--   Tombol "BUAT TOKEN" gagal dengan pesan umum "Gagal generate", dan daftar
--   token tampil kosong walau token pernah dibuat.
--
-- SEBAB
--   schema.prisma dan kode API sudah memakai kolom di bawah, tapi TIDAK ADA
--   satu pun file migrasi yang pernah menambahkannya ke database:
--     AccessToken."school"      → POST & GET /api/admin/tokens
--     CfitAccessToken."school"  → POST & GET /api/admin/cfit/tokens (wajib)
--     CfitAccessToken."grade"   → POST & GET /api/admin/cfit/tokens
--   Prisma menolak query APA PUN yang menyebut kolom yang tidak ada di DB
--   (error P2022), jadi pembuatan DAN pembacaan token dua-duanya gagal 500.
--
--   Khusus dua kolom CFIT: 0006_cfit_tables.sql membuat tabel
--   "CfitAccessToken" TANPA "school"/"grade", jadi database yang barusan
--   di-apply dari 0006 pasti terkena. Kolomnya ditambahkan di sini, bukan di
--   0006, karena tabelnya sudah ada — CREATE TABLE IF NOT EXISTS di 0006
--   dilewati dan tidak akan pernah menambah kolom baru.
--
-- Idempoten: aman dijalankan ulang.

ALTER TABLE "AccessToken"     ADD COLUMN IF NOT EXISTS "school" TEXT;
ALTER TABLE "CfitAccessToken" ADD COLUMN IF NOT EXISTS "school" TEXT;
ALTER TABLE "CfitAccessToken" ADD COLUMN IF NOT EXISTS "grade"  TEXT;

-- Drift SEJENIS di tabel peserta tes IQ: "nis" (Nomor Induk Siswa) ada di
-- schema.prisma dan dipakai form data diri peserta, tapi juga tidak pernah
-- dibuat oleh 0006. Dibereskan sekalian supaya alur tes IQ tidak berhenti di
-- langkah berikutnya. Hapus baris ini kalau hanya ingin memperbaiki token.
ALTER TABLE "CfitSubmission"  ADD COLUMN IF NOT EXISTS "nis" TEXT;
