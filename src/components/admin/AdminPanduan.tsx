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
              <td><Code>optionA, optionB, …</Code></td>
              <td>Ya</td>
              <td>Teks pilihan jawaban.</td>
            </tr>
            <tr>
              <td><Code>optionAImage, optionBImage, …</Code></td>
              <td>Opsional</td>
              <td>URL gambar untuk soal visual / pilihan jawaban gambar.</td>
            </tr>
            <tr>
              <td><Code>correctAnswer</Code></td>
              <td>Bakat: ya<br />Minat: kosong</td>
              <td>
                Untuk Bakat: huruf kunci (<Code>A</Code>). Multi-bagian: pisah pakai{" "}
                <Code>;</Code> (<Code>A;B;C</Code>). Untuk Minat: <strong>biarkan kosong</strong>.
              </td>
            </tr>
            <tr>
              <td><Code>scoringTag</Code></td>
              <td>Opsional</td>
              <td>
                Khusus subtes <Code>MINAT_BIDANG</Code>. Pasangan kategori, contoh{" "}
                <Code>A,F</Code> = pilihan A masuk bidang A, pilihan B masuk bidang F.
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
            Subtes <Code>MINAT_BIDANG</Code> berisi 28 soal pasangan kata. Setiap soal
            menyajikan 2 pilihan, masing-masing terhubung ke salah satu dari 8 bidang minat (A–H).
          </p>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>
              Kolom <Code>scoringTag</Code> diisi misalnya <Code>A,F</Code> →{" "}
              <Code>option A → bidang A</Code>, <Code>option B → bidang F</Code>.
            </li>
            <li>
              Skor tiap bidang = jumlah pilihan yang masuk bidang itu, dikonversi ke{" "}
              <strong>persentase</strong>.
            </li>
            <li>
              <strong>3 bidang teratas</strong> menjadi rekomendasi minat utama siswa.
            </li>
          </ul>
        </div>
        <div className="brut-card mb-3" style={{ background: "#fef3c7" }}>
          <h4 className="text-lg font-black uppercase mb-1">B. Subtes Program A–H</h4>
          <p className="text-sm font-semibold mb-2">
            Setiap program (A–H) memiliki 28 soal. Skor program = jumlah jawaban yang siswa
            pilih (semua dianggap valid, tidak ada salah).
          </p>
          <ul className="list-disc pl-5 text-sm font-semibold space-y-1">
            <li>Skor program juga diubah ke persentase.</li>
            <li>
              Program tertinggi diasosiasikan ke <strong>jurusan SMK</strong> sesuai pemetaan
              di buku (mis. Program A → TKI/Telekomunikasi, Program B → Seni Rupa/Kriya, dst).
            </li>
            <li>
              Hasil akhir Tes Minat: peringkat 8 bidang + peringkat 8 program + jurusan yang
              direkomendasikan.
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

      <Section title="6. Contoh Pengisian Singkat" color="#a3e635">
        <p className="text-sm font-semibold mb-2">
          Subtes <Code>BAKAT_2_NUMERIK</Code>, soal nomor 1: lanjutkan deret 2, 4, 8, 16, …
        </p>
        <pre className="text-xs bg-black text-white p-3 overflow-x-auto border-4 border-black">
{`questionNo: 1
prompt:     "Lanjutkan deret: 2, 4, 8, 16, …"
imageUrl:   (kosong)
parts:      1
optionA:    "24"
optionB:    "30"
optionC:    "32"
optionD:    "64"
correctAnswer: "C"
scoringTag: (kosong)`}
        </pre>
        <p className="text-sm font-semibold mt-3 mb-2">
          Subtes <Code>MINAT_BIDANG</Code>, soal nomor 1: pilih kata yang lebih disukai.
        </p>
        <pre className="text-xs bg-black text-white p-3 overflow-x-auto border-4 border-black">
{`questionNo: 1
prompt:     "Pilih satu kata yang paling Anda sukai."
parts:      1
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
