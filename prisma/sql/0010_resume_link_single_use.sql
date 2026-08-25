-- 0010_resume_link_single_use.sql
--
-- LINK PEMULIHAN SEKALI PAKAI.
--
-- Masalah: link buatan pengawas (/lanjut?t=...) hanya dibatasi umur token
-- (30 menit) dan bisa dibuka BERKALI-KALI oleh siapa pun yang memegangnya.
-- Jalur link ini MELEWATI verifikasi nama, jadi kalau pengawas mengirimnya ke
-- grup WA kelas, siswa lain bisa ikut membukanya dan masuk ke sesi orang lain.
--
-- Solusi: setiap link membawa `jti` (id token) yang dicatat di baris
-- submission. Link hanya sah kalau jti-nya sama dengan yang terakhir
-- diterbitkan admin DAN belum pernah dipakai. Sekali dipakai,
-- `resumeLinkUsedAt` terisi dan link itu mati. Menerbitkan link baru akan
-- menimpa jti lama (link lama otomatis tidak berlaku).
--
-- Idempoten: aman dijalankan ulang.

-- Minat-bakat
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "resumeLinkJti" TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "resumeLinkUsedAt" TIMESTAMP(3);

-- Tes IQ (CFIT)
ALTER TABLE "CfitSubmission" ADD COLUMN IF NOT EXISTS "resumeLinkJti" TEXT;
ALTER TABLE "CfitSubmission" ADD COLUMN IF NOT EXISTS "resumeLinkUsedAt" TIMESTAMP(3);
