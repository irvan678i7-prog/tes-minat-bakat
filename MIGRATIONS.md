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
| `prisma/sql/0002_drop_stale_subtestprogress_userid.sql` | Drop kolom `userId` (peninggalan schema lama) dari `SubtestProgress` (fix error P2011 saat upsert) | **PERLU DI-APPLY** |

Setiap SQL di folder `prisma/sql/` ditulis idempoten, jadi tidak masalah
kalau kamu jalankan ulang.

## Untuk perubahan schema ke depan

Pilihan terbersih jangka panjang: pindah ke `prisma migrate dev` /
`prisma migrate deploy` agar history migration tersimpan di repo. Tapi
itu butuh baseline migration dari struktur tabel yang sudah ada — bisa
dilakukan saat ada momen merapikan ulang database (mis. environment baru
atau backup-restore).
