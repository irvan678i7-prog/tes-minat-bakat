# Setting Supabase & Vercel untuk tes serentak

Panduan ini untuk dua hal:

1. **Menerapkan SQL yang belum jalan** (penyebab siswa tidak bisa melanjutkan tes).
2. **Menyetel koneksi database** supaya banyak siswa bisa tes bersamaan tanpa error.

---

## 1. Repo ini TIDAK menjalankan migrasi otomatis

`package.json` hanya menjalankan `prisma generate` saat build — **tidak ada**
`prisma migrate deploy`. Folder `prisma/migrations/` juga tidak ada. Artinya:

> Setiap file di `prisma/sql/` harus dijalankan **manual** di
> **Supabase → SQL Editor**. Deploy ke Vercel tidak mengubah struktur tabel.

Kalau langkah ini terlewat, fitur baru yang butuh kolom baru akan **gagal
diam-diam**, karena `isMissingColumnError()` di `src/lib/resume.ts` sengaja
menelan error `P2022` supaya halaman tes tidak ikut mati.

### Gejala khas kalau SQL pemulihan belum di-apply

| Yang dilihat pengguna | Sebabnya |
| --- | --- |
| Siswa masukkan Kode Lanjut → "kode tidak ditemukan" | `pickFreeResumeCode()` mengembalikan `null`, jadi submission dibuat **tanpa** kode. Kode yang dipegang siswa memang tidak ada di database. |
| Halaman/panel Pemulihan admin error atau daftar tidak muncul | `SELECT "resumeCode"` melempar `P2022` → API balas 500. |
| Link pemulihan bisa dipakai berkali-kali | Kolom `resumeLinkJti` / `resumeLinkUsedAt` belum ada. |

### Cara memastikan

Buka `https://<domain-anda>/api/admin/diagnose` dan lihat
`checks.recoveryColumns`. Kalau `ok: false`, `note`-nya menyebut kolom dan file
SQL yang harus dijalankan.

### Urutan apply

1. `prisma/sql/0008_submission_resume_code.sql` — kolom `Submission.resumeCode`.
2. `prisma/sql/0009_cfit_pause_and_resume.sql` — pemulihan untuk tes IQ (CFIT).
3. `prisma/sql/0010_resume_link_single_use.sql` — link pemulihan sekali pakai.
4. `prisma/sql/0099_backfill_resume_code.sql` — beri Kode Lanjut ke sesi yang
   **sudah** berjalan (tanpa ini, siswa yang terputus sebelum SQL di-apply
   tetap tidak bisa dipulihkan lewat `/lanjut`).

Semua file itu idempoten (`ADD COLUMN IF NOT EXISTS`), jadi aman dijalankan
ulang. Setelah selesai, **redeploy Vercel** agar Prisma Client memakai skema
terbaru.

---

## 2. Dua connection string: pooler untuk aplikasi, direct untuk migrasi

`prisma/schema.prisma` sudah menyiapkan keduanya:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Vercel menjalankan setiap request di serverless function yang bisa muncul
ratusan sekaligus. Kalau setiap function membuka koneksi langsung ke Postgres,
kuota koneksi habis dan muncul error seperti
`Timed out fetching a new connection from the connection pool` atau
`too many clients already`. Solusinya: aplikasi menembus **pooler**.

Ambil kedua string dari **Supabase → Project Settings → Database →
Connection string** (jangan ditulis manual, host/region tiap project beda).

| Env var | Ambil dari | Port | Dipakai untuk |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Transaction pooler** | `6543` | Semua request aplikasi |
| `DIRECT_URL` | **Session pooler / Direct connection** | `5432` | Prisma CLI, migrasi, seed |

Tambahkan parameter ini pada `DATABASE_URL`:

```
?pgbouncer=true&connection_limit=1&pool_timeout=20
```

Bentuk akhirnya:

```
postgresql://postgres.<project-ref>:<password>@<host>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20
```

Kenapa tiap parameter penting:

- **`pgbouncer=true`** — mematikan prepared statement. Tanpa ini, pooler mode
  transaksi akan melempar `prepared statement "s0" already exists` begitu
  beban naik (mis. 40 siswa menyimpan jawaban bersamaan). Ini error yang
  paling sering muncul saat tes serentak.
- **`connection_limit=1`** — tiap instance function cukup memegang 1 koneksi;
  penggandaan paralel diurus pooler. Angka besar di sini justru cepat
  menghabiskan kuota.
- **`pool_timeout=20`** — beri jeda antre alih-alih langsung gagal saat ada
  lonjakan.

> Jangan pakai port `6543` untuk `DIRECT_URL`. Migrasi dan `prisma db seed`
> butuh session mode (`5432`).

Setelah mengubah env di Vercel, **redeploy** — env baru tidak berlaku pada
deployment lama.

---

## 3. Yang perlu disetel di paket Pro

Upgrade ke Pro **tidak otomatis** menaikkan kapasitas koneksi; compute-nya
masih ukuran awal sampai diubah. Cek tiga hal ini:

### a. Ukuran compute

**Project Settings → Compute and Disk.** Batas koneksi mengikuti ukuran
compute (angka pooler jauh lebih besar dari koneksi langsung):

| Compute | Koneksi langsung | Lewat pooler |
| --- | --- | --- |
| Nano / Micro | ~60 | ~200 |
| Small | ~90 | ~400 |
| Medium | ~120 | ~600 |
| Large | ~160 | ~800 |

Dengan pooling yang benar, **Micro biasanya cukup untuk satu-dua kelas
(±30–80 siswa serentak)**. Untuk ujian serentak satu angkatan (200+ siswa),
naikkan ke **Small atau Medium** sehari sebelum jadwal, lalu turunkan lagi
kalau ingin menghemat.

### b. Pool size pooler

**Project Settings → Database → Connection pooling.** Naikkan *Pool Size*
(mis. 15 → 40). Catatan: kuota ini **dibagi** antara port `5432` dan `6543`,
jadi jangan menyisakan nol untuk migrasi.

### c. Region

Region Supabase dan region Vercel sebaiknya sama (untuk Indonesia:
**Singapore / ap-southeast-1**). Beda benua menambah 200–300 ms per query, dan
halaman tes melakukan banyak query kecil saat menyimpan jawaban.

---

## 4. Sebelum hari-H (checklist)

- [ ] `/api/admin/diagnose` → `status: "OK"`, khususnya `recoveryColumns` dan
      `dbPooling`.
- [ ] `DATABASE_URL` port `6543` + `pgbouncer=true&connection_limit=1`.
- [ ] `DIRECT_URL` port `5432`.
- [ ] Pool size dinaikkan; compute sesuai jumlah peserta.
- [ ] SQL `0008`, `0009`, `0010`, `0099` sudah dijalankan.
- [ ] Uji dengan 5–10 siswa dulu, lihat **Supabase → Reports → Database**
      (grafik jumlah koneksi) sambil tes berjalan.
- [ ] Briefing siswa: **catat/foto Kode Lanjut** yang muncul saat mulai tes.
- [ ] Pengawas tahu jalur `/admin/pemulihan` untuk siswa yang tidak mencatat
      kode. Link berumur 30 menit, sekali pakai, dan **tidak boleh** disebar
      ke grup kelas karena melewati verifikasi nama.

---

## 5. Kalau masih error saat ramai

| Pesan error | Tindakan |
| --- | --- |
| `prepared statement "s0" already exists` | `pgbouncer=true` belum ada di `DATABASE_URL`. |
| `Timed out fetching a new connection from the connection pool` | Turunkan `connection_limit`, naikkan `pool_timeout`, naikkan pool size, atau naikkan compute. |
| `too many clients already` / `Max client connections reached` | Aplikasi masih memakai koneksi langsung. Pastikan port `6543`. |
| `Can't reach database server` | Cek status project (Pro tidak auto-pause, tapi cek juga password yang baru diputar). |
| Halaman tes lambat saat menyimpan | Cek region Vercel vs Supabase, lalu grafik CPU/IO di Reports. |

### Bacaan

- <https://supabase.com/docs/guides/database/prisma>
- <https://supabase.com/docs/guides/database/connecting-to-postgres>
- <https://supabase.com/docs/guides/platform/compute-and-disk>
- <https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting>
