-- =====================================================================
-- 0007: KUNCI SELURUH TABEL PUBLIK (perbaikan peringatan Supabase
--       "Table publicly accessible / rls_disabled_in_public").
--
-- MASALAH:
--   Semua tabel dibuat lewat `prisma db push`, sehingga tercipta di schema
--   `public` TANPA Row Level Security. Di Supabase, role `anon` dan
--   `authenticated` secara default punya hak akses ke tabel baru di schema
--   `public`. Akibatnya siapa pun yang tahu URL project + anon key bisa
--   membaca/mengubah/menghapus data lewat PostgREST (https://<ref>.supabase.co/rest/v1/...).
--   Data yang terekspos: identitas siswa, jawaban, hasil tes, dan token akses.
--
-- KENAPA AMAN UNTUK APLIKASI INI:
--   Aplikasi TIDAK PERNAH memakai anon key. Semua query lewat Prisma dengan
--   role `postgres` (punya atribut BYPASSRLS), dan upload gambar memakai
--   SUPABASE_SERVICE_ROLE_KEY yang juga bypass RLS. Jadi mengaktifkan RLS
--   tanpa policy apa pun = pintu ditutup untuk publik, aplikasi tetap jalan
--   normal 100%.
--
-- Idempoten: aman dijalankan berulang kali.
--
-- Cara apply:
--   Buka Supabase Dashboard -> SQL Editor -> paste isi file ini -> Run.
--   Atau via psql:
--     psql "$DIRECT_URL" -f prisma/sql/0007_enable_rls_lock_public.sql
--
-- PENTING: ulangi skrip ini setiap kali menambah tabel baru lewat
--          `prisma db push`, karena tabel baru selalu lahir tanpa RLS.
-- =====================================================================

-- 1) Aktifkan RLS + cabut hak akses anon/authenticated pada SEMUA tabel
--    di schema public (termasuk tabel yang ditambahkan di masa depan saat
--    skrip ini dijalankan ulang).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated;', t.tablename);
  END LOOP;
END $$;

-- 2) Cabut juga hak akses ke sequence & function di schema public.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3) Matikan default privileges supaya tabel BARU tidak otomatis terbuka
--    lagi untuk anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 4) OPSIONAL (kunci paling rapat): cabut izin memakai schema public dari
--    anon/authenticated. Aplikasi ini tidak terpengaruh karena tidak pernah
--    memakai anon key, dan Supabase Storage memakai schema `storage`.
--    Hapus komentar di bawah kalau ingin dipakai.
--
-- REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- =====================================================================
-- VERIFIKASI (jalankan setelah skrip di atas).
-- Query 1 harus mengembalikan 0 baris = tidak ada lagi tabel tanpa RLS.
-- =====================================================================
--
-- SELECT tablename
-- FROM pg_tables
-- WHERE schemaname = 'public' AND NOT rowsecurity;
--
-- Query 2: pastikan anon sudah tidak punya hak apa pun.
--
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
