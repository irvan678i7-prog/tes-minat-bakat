"use client";

export default function AdminPanduan() {
  return (
    <div className="space-y-6">
      <div className="brut-card" style={{ background: "#facc15" }}>
        <h2 className="text-3xl font-black uppercase mb-2">Panduan Admin</h2>
        <p className="font-semibold">
          Halaman ini menjelaskan cara penilaian (terutama Tes Minat), cara mengisi template
          XLSX, dan kategori skor. Tidak perlu menghafal—silakan kembali ke sini kapan saja.
        </p>
      </div>

      <Section title="1. Alur Singkat Pakai Aplikasi" color="#22d3ee">
        <ol className="list-decimal pl-5 space-y-1 text-sm font-semibold">
          <li>
            Tab <Code>Bank Soal</Code> → klik <Code>TEMPLATE</Code> di baris subtes yang ingin
            diisi → unduh XLSX khusus subtes itu.
          </li>
          <li>
            Buka XLSX. Ada 3 sheet: <Code>PETUNJUK</Code> (info), <Code>CONTOH SOAL</Code>{" "}
            (latihan, tampil ke siswa <strong>sebelum</strong> timer mulai), dan{" "}
            <Code>SOAL</Code> (soal asli yang dinilai).
          </li>
          <li>
            Isi soal. Untuk gambar pakai tombol <Code>UPLOAD GAMBAR</Code> di tab Bank Soal—URL
            otomatis tersalin. Tempel ke kolom <Code>imageUrl</Code> atau{" "}
            <Code>option*Image</Code>.
          </li>
          <li>
            Simpan sebagai <Code>.xlsx</Code> lalu klik <Code>UPLOAD</Code> di baris subtes
            yang sama. Soal lama otomatis diganti dengan soal baru (tidak akumulasi).
          </li>
          <li>
            Klik <Code>INSTRUKSI</Code> untuk mengisi instruksi yang akan tampil ke siswa
            sebelum timer dimulai. Misal: cara memilih jawaban, peringatan tidak boleh kembali,
            dst.
          </li>
          <li>
            Tab <Code>Token</Code> → buat token akses 5 menit untuk siswa. Token dikirim ke
            siswa, mereka login dengan token itu.
          </li>
          <li>
            Tab <Code>Hasil</Code> → unduh PDF individu, rekap kelas, atau hapus data peserta.
          </li>
        </ol>
      </Section>

      <Section title="2. Cara Mengisi Template (Detail Kolom)" color="#a3e635">
        <table className="brut-table text-sm">
          <thead>
            <tr>
              <th>Kolom</th>
              <th>Wajib?</th>
              <th>Penjelasan</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><Code>questionNo</Code></td>
              <td>Ya</td>
              <td>Nomor urut soal mulai 1.</td>
            </tr>
            <tr>
              <td><Code>prompt</Code></td>
              <td>Ya*</td>
              <td>Teks soal. Boleh kosong jika hanya gambar (isi <Code>imageUrl</Code>).</td>
            </tr>
            <tr>
              <td><Code>imageUrl</Code></td>
              <td>Opsional</td>
              <td>URL gambar soal (dapat dari <Code>UPLOAD GAMBAR</Code>).</td>
            </tr>
            <tr>
              <td><Code>parts</Code></td>
              <td>Ya</td>
              <td>
                Banyak bagian per soal. Default <Code>1</Code>. Untuk subtes 3 Dimensi gunakan{" "}
                <Code>3</Code>; Penalaran Urutan <Code>2</Code>.
              </td>
            </tr>
            <tr>
              <td><Code>inputMode</Code></td>
              <td>Ya</td>
              <td>
                <Code>CHOICE</Code> = pilihan ganda (siswa pilih A/B/C…). <Code>TEXT</Code> ={" "}
                soal isian (siswa <strong>mengetik</strong> jawaban). Default per subtes sudah
                tertulis di sheet <Code>PETUNJUK</Code>.
              </td>
            </tr>
            <tr>
              <td><Code>optionA, optionB, …</Code></td>
              <td>Khusus CHOICE</td>
              <td>Teks pilihan jawaban. Untuk <Code>inputMode=TEXT</Code>, kolom ini diabaikan.</td>
            </tr>
            <tr>
              <td><Code>optionAImage, optionBImage, …</Code></td>
              <td>Opsional</td>
              <td>URL gambar untuk soal visual / pilihan jawaban gambar (CHOICE saja).</td>
            </tr>
            <tr>
              <td><Code>correctAnswer</Code></td>
              <td>Bakat: ya<br />Minat: kosong</td>
              <td>
                <strong>CHOICE</strong>: huruf kunci (<Code>A</Code>). Multi-bagian: pisah pakai{" "}
                <Code>;</Code> (<Code>A;B;C</Code>).{" "}
                <strong>TEXT</strong>: ketik jawaban yang diharapkan (mis. <Code>42</Code>,{" "}
                <Code>B</Code>, atau multi-bagian <Code>5;9</Code> / <Code>A;B;C</Code>).
                Pencocokan abaikan huruf besar/kecil &amp; spasi. Untuk Minat:{" "}
                <strong>biarkan kosong</strong>. Khusus{" "}
                <Code>BAKAT_7_SISTEMATISASI</Code> &amp; <Code>BAKAT_5_SPASIAL</Code>:
                kolom ini <strong>tidak dipakai</strong> — pakai{" "}
                <Code>kunci_1</Code>..<Code>kunci_N</Code> (lihat bagian khusus).
              </td>
            </tr>
            <tr>
              <td><Code>scoringTag</Code></td>
              <td>MINAT: <strong>WAJIB</strong></td>
              <td>
                Khusus subtes <Code>MINAT</Code> (Bidang &amp; Program A–H). Pasangan
                bidang/program yang dipasangkan di soal itu, dipisah koma.
                Contoh <Code>A,B</Code> = <Code>optionA</Code> mewakili bidang A,{" "}
                <Code>optionB</Code> mewakili bidang B. Untuk Bakat: kosongkan saja.
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs font-semibold opacity-80">
          *Baris yang kosong total (prompt+imageUrl+pilihan kosong) otomatis diabaikan saat
          upload.
        </p>
      </Section>

      <Section title="3. Cara Penilaian Tes Bakat" color="#fbcfe8">
        <p className="text-sm font-semibold mb-2">
          Setiap subtes Bakat dihitung berdasarkan jumlah jawaban benar. Skor mentah
          dikategorikan menjadi 5 tingkatan menurut tabel kategori (rentang berbeda tiap
          subtes):
        </p>
        <table className="brut-table text-sm mb-3">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Singkatan</th>
              <th>Arti</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Di bawah rata-rata</td><td><Code>BR</Code></td><td>Perlu pendampingan ekstra.</td></tr>
            <tr><td>Rata-rata</td><td><Code>RR</Code></td><td>Setara mayoritas peserta.</td></tr>
            <tr><td>Di atas rata-rata</td><td><Code>AR</Code></td><td>Lebih baik dari rata-rata.</td></tr>
            <tr><td>Baik</td><td><Code>B</Code></td><td>Bakat menonjol.</td></tr>
            <tr><td>Luar biasa</td><td><Code>LB</Code></td><td>Sangat menonjol.</td></tr>
          </tbody>
        </table>
        <p className="text-sm font-semibold mb-2">Tambahan:</p>
        <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
          <li>
            <strong>Estimasi IQ</strong> dihitung dari rata-rata persentase benar 9 subtes
            Bakat.
          </li>
          <li>
            <strong>Profil Bakat</strong> ditentukan oleh kombinasi 3 subtes tertinggi (sesuai
            Tabel Profil Bakat dari buku).
          </li>
          <li>
            Hasil profil terhubung otomatis ke rekomendasi <strong>jurusan</strong> dan{" "}
            <strong>karir</strong> yang sesuai.
          </li>
        </ul>
      </Section>

      <Section title="4. Cara Penilaian Tes Minat (PENTING)" color="#22d3ee">
        <p className="text-sm font-semibold mb-2">
          Tes Minat <strong>tidak ada benar/salah</strong>—kolom <Code>correctAnswer</Code>{" "}
          dikosongkan. Yang dihitung adalah <em>frekuensi</em> pilihan siswa.
        </p>
        <div className="brut-card mb-3" style={{ background: "#fef3c7" }}>
          <h4 className="text-lg font-black uppercase mb-1">A. Subtes Bidang Minat</h4>
          <p className="text-sm font-semibold mb-2">
            Subtes <Code>MINAT_BIDANG</Code> berisi 28 soal pasangan kata. Setiap soal{" "}
            <strong>HANYA 2 pilihan</strong> (<Code>optionA</Code> &amp; <Code>optionB</Code>).
            Masing-masing pilihan mewakili 1 dari 8 bidang minat (A–H).
          </p>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>
              Kolom <Code>scoringTag</Code> WAJIB. Contoh <Code>A,B</Code> →{" "}
              <Code>optionA → bidang A</Code>, <Code>optionB → bidang B</Code>. Soal lain
              boleh <Code>B,C</Code> atau <Code>C,D</Code> dst — bebas memasangkan 2 bidang.
            </li>
            <li>
              Skor tiap bidang = jumlah pilihan siswa yang masuk bidang itu, dikonversi ke{" "}
              <strong>persentase</strong>.
            </li>
            <li>
              <strong>3 bidang teratas</strong> menjadi rekomendasi minat utama siswa.
            </li>
          </ul>
          <p className="text-xs font-semibold mt-2 opacity-80">
            Pemetaan huruf bidang: A=Komunikasi, B=Seni, C=Kesehatan, D=Pariwisata,
            E=Administrasi, F=Teknologi, G=Agrobisnis, H=Industri.
          </p>
        </div>
        <div className="brut-card mb-3" style={{ background: "#fef3c7" }}>
          <h4 className="text-lg font-black uppercase mb-1">B. Subtes Program A–H</h4>
          <p className="text-sm font-semibold mb-2">
            Subtes <Code>MINAT_PROG_A</Code> s/d <Code>MINAT_PROG_H</Code>: tiap soal juga{" "}
            <strong>HANYA 2 pilihan</strong> (pasangan karier/program). <Code>scoringTag</Code>{" "}
            mengaitkan optionA &amp; optionB ke huruf program (A–H atau A–J).
          </p>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>Skor tiap huruf program = banyaknya pilihan yang masuk huruf itu.</li>
            <li>
              Sistem mengambil 3 bidang teratas, lalu untuk tiap bidang B mencari subtes{" "}
              <Code>MINAT_PROG_B</Code> dan rekomendasikan top 3 huruf program-nya{" "}
              (sesuai Tabel 4.3 buku panduan).
            </li>
            <li>
              Hasil akhir Tes Minat: peringkat bidang + program keahlian SMK yang sesuai.
            </li>
          </ul>
        </div>
        <p className="text-xs font-bold opacity-80">
          Catatan: aplikasi sudah otomatis mengkalkulasi semua ini saat siswa selesai tes.
          Admin tinggal menyiapkan soal sesuai panduan ini.
        </p>
      </Section>

      <Section title="5. Tips Mencegah Error Upload" color="#ff4d8d">
        <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
          <li>
            Upload <strong>per subtes</strong>—bukan satu file untuk semua sekaligus. Tombol{" "}
            <Code>UPLOAD</Code> ada di setiap baris subtes.
          </li>
          <li>
            Jangan ubah nama sheet (<Code>CONTOH SOAL</Code> dan <Code>SOAL</Code>). Sistem
            mengenali sheet berdasarkan nama tersebut.
          </li>
          <li>
            Pastikan kolom <Code>questionNo</Code> berisi angka mulai 1 (boleh tidak urut, akan
            dirapikan otomatis).
          </li>
          <li>
            Tipe file harus <Code>.xlsx</Code> (Excel). <Code>.csv</Code> bisa, tapi tidak
            mendukung lebih dari 1 sheet.
          </li>
          <li>
            Untuk subtes Minat, biarkan <Code>correctAnswer</Code> kosong agar tidak dianggap
            salah/benar.
          </li>
        </ul>
      </Section>

      <Section title="6. Subtes dengan Soal Isian (TEXT)" color="#fde68a">
        <p className="text-sm font-semibold mb-2">
          Beberapa subtes Bakat tidak cocok dengan pilihan ganda — siswa
          <strong> mengetik</strong> jawabannya. Pada subtes berikut kolom <Code>inputMode</Code>{" "}
          default-nya <Code>TEXT</Code>, kolom <Code>option*</Code> diabaikan, dan{" "}
          <Code>correctAnswer</Code> berisi jawaban yang diharapkan:
        </p>
        <table className="brut-table text-sm mb-3">
          <thead>
            <tr>
              <th>Subtes</th>
              <th>Format Jawaban</th>
              <th>Contoh <Code>correctAnswer</Code></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><Code>BAKAT_2_NUMERIK</Code> — Penalaran Numerik</td>
              <td>Ketik angka yang hilang.</td>
              <td><Code>42</Code></td>
            </tr>
            <tr>
              <td><Code>BAKAT_4_URUTAN</Code> — Penalaran Urutan</td>
              <td>2 isian (<Code>parts=2</Code>): bagian 1 &amp; 2.</td>
              <td><Code>5;9</Code></td>
            </tr>
            <tr>
              <td><Code>BAKAT_6_3DIMENSI</Code> — Tiga Dimensi</td>
              <td>3 isian (<Code>parts=3</Code>): sisi I, II, III.</td>
              <td><Code>A;B;C</Code></td>
            </tr>
            <tr>
              <td><Code>BAKAT_5_SPASIAL</Code> — Pengenalan Spasial</td>
              <td>
                Tiap soal = 1 gambar stem berisi <strong>5 bentuk</strong> (nomor 1–5).
                Siswa memilih <Code>B</Code> (sama/serupa) atau <Code>S</Code> (beda)
                untuk tiap bentuk. Template pakai kolom{" "}
                <Code>kunci_1</Code>..<Code>kunci_5</Code> (isi <Code>B</Code> atau{" "}
                <Code>S</Code> per kolom). Skor: 1 poin per kunci benar (maks 5/soal).
              </td>
              <td><Code>kunci_1..5</Code> = <Code>S B B B S</Code></td>
            </tr>
            <tr>
              <td><Code>BAKAT_7_SISTEMATISASI</Code> — Sistematisasi</td>
              <td>
                Tiap soal = 1 gambar stem berisi <strong>N simbol/posisi</strong> (max
                12) + N kolom isian. Siswa mengetik 1 jawaban per posisi. Set{" "}
                <Code>parts</Code> = N (variabel per soal), lalu isi kolom{" "}
                <Code>kunci_1</Code>..<Code>kunci_N</Code>. Kolom kunci sisanya boleh
                dibiarkan kosong. Total <Code>parts</Code> seluruh soal sebaiknya ≈ 150.
              </td>
              <td><Code>kunci_1..N</Code> = <Code>B A D C …</Code></td>
            </tr>
            <tr>
              <td><Code>BAKAT_9_FIGURAL</Code> — Figural Angka</td>
              <td>Ketik angka jawaban.</td>
              <td><Code>23</Code></td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs font-bold opacity-80">
          Pencocokan jawaban siswa abaikan huruf besar/kecil dan spasi tambahan{" "}
          (mis. siswa ketik <Code>b</Code> tetap dianggap benar untuk kunci <Code>B</Code>).
        </p>
      </Section>

      <Section title="7. Keamanan Tes (Anti-Curang & Pemulihan Koneksi)" color="#fca5a5">
        <p className="text-sm font-semibold mb-2">
          Aplikasi otomatis memantau perilaku siswa selama mengerjakan tes. Tidak ada data
          siswa yang dihapus otomatis — yang terjadi hanya{" "}
          <strong>pencatatan (log)</strong> dan <strong>flag</strong> agar admin bisa
          memutuskan sendiri apakah hasilnya valid.
        </p>
        <div className="brut-card mb-3" style={{ background: "#fef3c7" }}>
          <h4 className="text-lg font-black uppercase mb-1">A. Apa yang Dipantau?</h4>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>
              <strong>Pindah tab / buka aplikasi lain</strong> (<Code>TAB_SWITCH</Code>) —
              dideteksi lewat Visibility API.
            </li>
            <li>
              <strong>Window kehilangan fokus</strong> (<Code>BLUR</Code>) — mis. klik di luar
              browser.
            </li>
            <li>
              <strong>Keluar dari mode full-screen</strong> (<Code>EXIT_FULLSCREEN</Code>).
            </li>
            <li>
              <strong>Copy / paste / cut</strong> (<Code>COPY</Code>, <Code>PASTE</Code>,{" "}
              <Code>CUT</Code>) — tindakan diblokir <em>dan</em> dicatat.
            </li>
            <li>
              <strong>Klik kanan</strong> (<Code>CONTEXT_MENU</Code>) — diblokir &amp; dicatat.
            </li>
            <li>
              <strong>Shortcut mencurigakan</strong> (<Code>SHORTCUT</Code>): F12, Ctrl+Shift+I,
              Ctrl+C/V/X/A/S/P/U, dll.
            </li>
          </ul>
          <p className="text-xs font-semibold mt-2 opacity-80">
            Event yang sama dalam 800 ms dihitung satu kali (anti spam). Maksimum 200 entri log
            per siswa.
          </p>
        </div>
        <div className="brut-card mb-3" style={{ background: "#fef3c7" }}>
          <h4 className="text-lg font-black uppercase mb-1">B. Ambang Batas &amp; Aksi Otomatis</h4>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>
              Setelah <strong>5 pelanggaran</strong>, siswa otomatis ditandai{" "}
              <Code>flaggedCheating = true</Code> dan tesnya{" "}
              <strong>diselesaikan paksa</strong> dengan notifikasi.
            </li>
            <li>
              Saat siswa <strong>Mulai</strong> subtes, browser diminta masuk mode full-screen.
              Kalau siswa keluar, akan muncul banner peringatan + tombol{" "}
              <Code>KEMBALI FULL-SCREEN</Code>.
            </li>
            <li>
              Selama intro / pengisian biodata, anti-curang <strong>tidak aktif</strong> agar
              siswa bisa baca instruksi tanpa kena warning.
            </li>
          </ul>
        </div>
        <div className="brut-card mb-3" style={{ background: "#fef3c7" }}>
          <h4 className="text-lg font-black uppercase mb-1">C. Cara Admin Memeriksa</h4>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>
              Buka tab <Code>Token</Code> — kolom <strong>Pelanggaran</strong> di tabel{" "}
              <em>Daftar Token</em> &amp; <em>Status Pengerjaan</em>:{" "}
              <span style={{ background: "#a3e635", padding: "0 6px", border: "2px solid #000" }}>
                0
              </span>{" "}
              hijau,{" "}
              <span style={{ background: "#fb923c", padding: "0 6px", border: "2px solid #000" }}>
                1–4
              </span>{" "}
              oranye,{" "}
              <span
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  padding: "0 6px",
                  border: "2px solid #000",
                }}
              >
                ⚠ 5+
              </span>{" "}
              merah (terdeteksi curang).
            </li>
            <li>
              Buka tab <Code>Hasil</Code> — kolom <strong>Pelanggaran</strong> juga muncul, dan
              ada filter <Code>Hanya tampilkan yang dicurigai</Code>. Klik angka untuk melihat{" "}
              <strong>detail log</strong> (waktu, subtes, jenis pelanggaran).
            </li>
            <li>
              Keputusan akhir ada di tangan admin: bisa terima hasil apa adanya, minta siswa
              tes ulang, atau hapus data peserta (tombol <Code>HAPUS</Code>).
            </li>
          </ul>
        </div>
        <div className="brut-card" style={{ background: "#fef3c7" }}>
          <h4 className="text-lg font-black uppercase mb-1">D. Pemulihan Koneksi Putus</h4>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>
              Setiap jawaban langsung disimpan ke <strong>localStorage</strong> browser siswa
              dan dikirim ke server.
            </li>
            <li>
              Kalau internet putus, jawaban masuk antrian dan otomatis di-retry dengan jeda
              4s → 8s → 16s → 30s sampai berhasil. Indikator di pojok layar siswa:
              {" "}<Code>TERSIMPAN</Code>, <Code>ANTRI</Code>, <Code>OFFLINE</Code>,{" "}
              <Code>GAGAL SYNC</Code>.
            </li>
            <li>
              Saat tombol <Code>SELESAIKAN TES</Code> gagal (mis. timeout), muncul tombol{" "}
              <Code>COBA SUBMIT ULANG</Code>. Siswa boleh menutup browser; selama token belum
              expire, login ulang dengan kode yang sama akan melanjutkan tes dari titik
              terakhir.
            </li>
          </ul>
        </div>
      </Section>

      <Section title="8. Contoh Pengisian Singkat" color="#a3e635">
        <p className="text-sm font-semibold mb-2">
          Subtes <Code>BAKAT_8_KOSAKATA</Code> (CHOICE), soal nomor 1:
        </p>
        <pre className="text-xs bg-black text-white p-3 overflow-x-auto border-4 border-black">
{`questionNo: 1
prompt:     "Sinonim dari kata 'cermat'?"
imageUrl:   (kosong)
parts:      1
inputMode:  CHOICE
optionA:    "ceroboh"
optionB:    "teliti"
optionC:    "cepat"
optionD:    "lambat"
correctAnswer: "B"
scoringTag: (kosong)`}
        </pre>
        <p className="text-sm font-semibold mt-3 mb-2">
          Subtes <Code>BAKAT_2_NUMERIK</Code> (TEXT — isian), soal nomor 1:
        </p>
        <pre className="text-xs bg-black text-white p-3 overflow-x-auto border-4 border-black">
{`questionNo: 1
prompt:     "Lanjutkan deret: 2, 4, 8, 16, …"
parts:      1
inputMode:  TEXT
correctAnswer: "32"
scoringTag: (kosong)`}
        </pre>
        <p className="text-sm font-semibold mt-3 mb-2">
          Subtes <Code>BAKAT_6_3DIMENSI</Code> (TEXT, 3 sisi I/II/III):
        </p>
        <pre className="text-xs bg-black text-white p-3 overflow-x-auto border-4 border-black">
{`questionNo: 1
prompt:     "Tentukan jawaban untuk sisi I, II, III"
imageUrl:   "https://.../balok.png"
parts:      3
inputMode:  TEXT
correctAnswer: "A;B;C"
scoringTag: (kosong)`}
        </pre>
        <p className="text-sm font-semibold mt-3 mb-2">
          Subtes <Code>MINAT_BIDANG</Code>, soal nomor 1: pilih kata yang lebih disukai.
        </p>
        <pre className="text-xs bg-black text-white p-3 overflow-x-auto border-4 border-black">
{`questionNo: 1
prompt:     "Pilih satu kata yang paling Anda sukai."
parts:      1
inputMode:  CHOICE
optionA:    "Memimpin diskusi kelas"
optionB:    "Menanam bunga"
correctAnswer: (kosong)
scoringTag: "A,G"  ⟵ A = bidang A (kepemimpinan), G = bidang G (agro)`}
        </pre>
      </Section>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <section className="brut-card" style={{ background: color }}>
      <h3 className="text-2xl font-black uppercase mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-black text-white px-1 font-mono text-xs">{children}</code>;
}
