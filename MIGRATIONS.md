# Database Migrations

Repo ini **belum menggunakan `prisma migrate`** — schema disinkron ke
database (Supabase) lewat `prisma db push` manual. Karena itu, setiap
kali `prisma/schema.prisma` diubah, kamu harus menjalankan satu langkah
sinkronisasi ke database production.

## Cara apply perubahan schema

### Opsi A — paste SQL di Supabase (paling mudah)

Setiap perubahan schema yang butuh DDL ditaruh di `prisma/sql/` sebagai
file `NNNN_*.sql` yang **idempoten** (pakai `IF NOT EXISTS` / `IF EXISTS`
sehingga aman dijalankan ulang).

1. Buka Supabase Dashboard → project kamu → **SQL Editor** → **New query**.
2. Buka file SQL yang belum di-apply (lihat daftar di bawah), copy semua isinya,
   paste ke editor.
3. Klik **Run**.
4. Setelah sukses, tandai file itu sebagai "applied" di catatan kamu
   (atau update list di bawah).

### Opsi B — `prisma db push` lokal (lebih konsisten)

Kalau kamu punya akses ke `DATABASE_URL` production dari mesin lokal:

```bash
# pastikan .env punya DATABASE_URL & DIRECT_URL ke production
npx prisma db push
```

Perintah ini akan mendeteksi diff antara `schema.prisma` dan struktur tabel
di DB, lalu menjalankan `ALTER TABLE` yang diperlukan secara otomatis.

> ⚠️ **Jangan jalankan `prisma db push` dari komputer yang tidak terjamin** —
> command ini langsung mengubah production DB tanpa konfirmasi per-statement.

## Daftar SQL hotfix yang harus di-apply (kronologis)

| File | Deskripsi | Status |
|------|-----------|--------|
| `prisma/sql/0001_subtestprogress_lock_columns.sql` | Tambah kolom `finishedAt` & `finishReason` di `SubtestProgress` (fix error P2022 di Vercel) | applied |
| `prisma/sql/0002_drop_stale_subtestprogress_userid.sql` | Drop kolom `userId` (peninggalan schema lama) dari `SubtestProgress` (fix error P2011 saat upsert) | applied |
| `prisma/sql/0003_drop_stale_subtestprogress_updatedat.sql` | Drop kolom `updatedAt` (peninggalan schema lama) dari `SubtestProgress` (fix error P2011 saat upsert) | **PERLU DI-APPLY** |
| `prisma/sql/0004_class_token_drop_submission_tokenid_unique.sql` | Token kelas: drop unique index `Submission.tokenId` supaya SATU token bisa di-redeem banyak siswa | belum tercatat — cek di Supabase |
| `prisma/sql/0005_submission_jenjang.sql` | Tambah kolom `jenjang` (TEXT) di `Submission` untuk pilihan jenjang SMP/SMA/SMK | **PERLU DI-APPLY** |
| `prisma/sql/0006_cfit_tables.sql` | Tes IQ CFIT Skala 3 (3A & 3B): tabel `Cfit*` (token, subtes, bank soal, submission, jawaban, hasil, norma) TERPISAH dari minat-bakat + seed 8 subtes & norma RS→IQ usia 17+ | **PERLU DI-APPLY** |
| `prisma/sql/0007_enable_rls_lock_public.sql` | Aktifkan RLS + tutup akses anon ke tabel publik (temuan security advisor Supabase). Tidak dipakai kode aplikasi, jadi urutannya bebas | belum tercatat — cek di Supabase |
| `prisma/sql/0007_subtestprogress_pause_columns.sql` | Timer sadar-jeda: kolom `consumedSec`, `lastSeenAt`, `pauseCount`, `pausedSec` di `SubtestProgress` + backfill sesi lama & sesi berjalan | **PERLU DI-APPLY** |
| `prisma/sql/0008_submission_resume_code.sql` | "Kode Lanjut": kolom `resumeCode` + unique index di `Submission` untuk melanjutkan sesi yang cookie-nya hilang | **PERLU DI-APPLY** |
| `prisma/sql/0009_cfit_pause_and_resume.sql` | **Anti mati lampu TES IQ**: kolom `consumedSec`, `lastSeenAt`, `pauseCount`, `pausedSec` di `CfitSubtestProgress` + `resumeCode` (unique) di `CfitSubmission` + backfill sesi lama & sesi berjalan | **PERLU DI-APPLY** |
| `prisma/sql/0010_resume_link_single_use.sql` | Link pemulihan SEKALI PAKAI: kolom `resumeLinkJti` & `resumeLinkUsedAt` di `Submission` dan `CfitSubmission` | **PERLU DI-APPLY** |
| `prisma/sql/0011_token_school_columns.sql` | **Fix tombol BUAT TOKEN**: kolom `school` di `AccessToken`, `school` & `grade` di `CfitAccessToken`, plus `nis` di `CfitSubmission` — kolom yang sudah dipakai kode tapi belum pernah punya migrasi | **PERLU DI-APPLY** |
| `prisma/sql/0012_retire_legacy_cfit_norm.sql` | Hapus hanya 50 baris seed norma CFIT lama yang masih cocok persis dengan 0006; norma aktif dan hasil peserta tidak berubah | **PERLU DI-APPLY** |

Setiap SQL di folder `prisma/sql/` ditulis idempoten, jadi tidak masalah
kalau kamu jalankan ulang.

> ⚠️ **Urutan penting untuk 0007, 0008, 0009 & 0010.** Empat file itu menambah
> kolom yang LANGSUNG dipakai kode (timer jeda, pemulihan sesi, link sekali
> pakai). Apply `0003`, `0005`, `0006` lebih dulu, lalu `0007`, `0008`,
> `0009`, `0010`, dan lakukan SAAT TIDAK ADA SESI TES BERJALAN — karena
> backfill sesi yang sedang berjalan memakai `NOW()` sebagai titik awal
> hitungan waktu aktif.

### Kalau 0009 / 0010 belum di-apply

Kode sudah dibuat **tidak jatuh** kalau kolom barunya belum ada, tapi
fiturnya mati sebagian — jadi jangan dianggap opsional:

| Belum di-apply | Akibat |
|----------------|--------|
| `0009` | Tes IQ kembali memakai timer jam dinding lama (mati lampu tetap menghabiskan waktu subtes) dan "Kode Lanjut" tes IQ tidak muncul. Peringatan `[cfit/lock]` / `[cfit/resume]` tercatat di log server. |
| `0010` | Link pemulihan pengawas tetap berfungsi tapi **belum benar-benar sekali pakai** (masih bisa dibuka berkali-kali sampai 30 menit). Peringatan `[resume]` tercatat di log server. |

### Kalau 0011 belum di-apply

Berbeda dari 0009/0010, yang ini **tidak** ada jalur amannya di kode: tombol
"BUAT TOKEN" (minat-bakat maupun tes IQ) akan gagal dengan pesan umum "Gagal
generate", dan daftar token tampil kosong karena request GET-nya juga ikut
gagal. Tanpa token, tidak ada siswa yang bisa mulai tes.

### Khusus 0012: pembersihan data norma CFIT lama

- Jalankan **file SQL 0012** setelah `0006` tersedia, diawali uji staging dan
  backup. Ini pembersihan **data**, bukan perubahan schema: `prisma db push`
  maupun deploy Vercel **tidak menjalankan pembersihan ini**.
- Hanya baris seed `0006` yang cocok pada **id, normGroup, rawScore, dan iq**
  sekaligus yang dihapus. Baris yang sudah diubah atau ditambahkan manual
  dipertahankan; bukan berarti baris tersisa telah divalidasi sebagai norma.
- Norma aktif tetap `src/lib/cfit/norms.ts`. Tidak ada perubahan skor peserta,
  bank soal, tabel tes minat-bakat, atau definisi enum `CfitForm`.
- File dijalankan dalam satu transaksi. Jika timeout atau gagal, transaksi
  harus di-rollback; jangan melanjutkan sebagian perintah lalu commit manual.
- Bila `0006` dijalankan ulang setelah `0012`, jalankan `0012` lagi karena seed
  lama dapat terisi kembali. Jangan mengubah migrasi historis `0006`.

Pembatasan **sesi CFIT baru wajib 3A+3B** dilakukan di endpoint redeem dan
**tidak memerlukan penghapusan enum**. Penanda `FORM_3A` / `FORM_3B` tetap
dibutuhkan bank soal serta riwayat/sesi lama. Sesi lama tetap boleh dilanjutkan;
token satu bentuk tidak bisa dipakai membuat sesi baru, termasuk `forceNew`.

## Untuk perubahan schema ke depan

Pilihan terbersih jangka panjang: pindah ke `prisma migrate dev` /
`prisma migrate deploy` agar history migration tersimpan di repo. Tapi
itu butuh baseline migration dari struktur tabel yang sudah ada — bisa
dilakukan saat ada momen merapikan ulang database (mis. environment baru
atau backup-restore).
