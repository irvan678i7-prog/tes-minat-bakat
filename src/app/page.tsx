import Link from "next/link";
import StudentTokenForm from "@/components/StudentTokenForm";
import CfitTokenForm from "@/components/cfit/CfitTokenForm";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase leading-none">
              EKIU
            </h1>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider mt-0.5">
              Estimasi Kemampuan Intelektual Umum
            </p>
          </div>
          <Link href="/admin/login" className="brut-btn brut-btn-black text-sm">
            ADMIN
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 w-full">
        <section className="mb-10">
          <h2 className="text-4xl md:text-5xl font-black uppercase leading-tight">
            Masukkan <span className="bg-pink-400 px-2 border-4 border-black">TOKEN</span>
          </h2>
          <p className="mt-3 text-lg font-semibold max-w-2xl">
            Masukkan token yang diberikan oleh admin / guru pembimbing pada kartu
            yang sesuai: Tes Minat / Bakat, atau Tes IQ (CFIT).
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-8 max-w-4xl">
          <div className="brut-card" style={{ background: "#facc15" }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black uppercase">Tes Minat / Bakat</h3>
              <span className="brut-tag text-xs" style={{ background: "#000", color: "#fff" }}>
                OTOMATIS
              </span>
            </div>
            <StudentTokenForm />
            <p className="text-xs font-semibold mt-2">
              Jenis tes (Minat atau Bakat) otomatis terdeteksi dari token.
            </p>
          </div>

          <div className="brut-card" style={{ background: "#22d3ee" }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black uppercase">Tes IQ</h3>
              <span className="brut-tag text-xs" style={{ background: "#000", color: "#fff" }}>
                CFIT SKALA 3
              </span>
            </div>
            <CfitTokenForm />
            <p className="text-xs font-semibold mt-2">
              Bentuk tes (3A / 3B / gabungan) otomatis terdeteksi dari token.
            </p>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-8 mt-10">
          <div className="brut-card" style={{ background: "#22d3ee" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-2xl font-black uppercase">Tes Minat</h3>
              <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>A–H</span>
            </div>
            <p className="font-semibold mb-2">
              Mengukur ketertarikan terhadap bidang tertentu lewat 28 soal pasangan kata,
              dilanjutkan pemetaan ke 8 program keahlian.
            </p>
            <ul className="font-semibold list-disc list-inside text-sm">
              <li>Tidak ada jawaban benar / salah</li>
              <li>Hasil: rekomendasi jurusan keahlian</li>
            </ul>
          </div>

          <div className="brut-card" style={{ background: "#a3e635" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-2xl font-black uppercase">Tes Bakat</h3>
              <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>9 SUBTES</span>
            </div>
            <p className="font-semibold mb-2">
              Mengukur kemampuan kognitif: penalaran visual, numerik, verbal, urutan, spasial,
              tiga dimensi, sistematisasi, kosa kata, &amp; figural angka.
            </p>
            <ul className="font-semibold list-disc list-inside text-sm">
              <li>Tiap subtes punya batas waktu</li>
              <li>Hasil: profil bakat + EKIU prediksi + rekomendasi</li>
            </ul>
          </div>

          <div className="brut-card" style={{ background: "#ff4d8d" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-2xl font-black uppercase">Tes IQ</h3>
              <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>4 SUBTES</span>
            </div>
            <p className="font-semibold mb-2">
              Mengukur kecerdasan umum secara culture-fair lewat soal gambar non-verbal
              CFIT Skala 3: Series, Classification, Matrices, &amp; Conditions (bentuk A &amp; B).
            </p>
            <ul className="font-semibold list-disc list-inside text-sm">
              <li>Semua soal berupa gambar, tiap subtes berbatas waktu</li>
              <li>Hasil: skor IQ + klasifikasi (dilihat admin/guru)</li>
            </ul>
          </div>
        </section>

        <section className="mt-10 brut-card" style={{ background: "#fff" }}>
          <h3 className="text-2xl font-black uppercase mb-3">Bagaimana cara mengikuti tes?</h3>
          <ol className="list-decimal list-inside font-semibold space-y-2">
            <li>Minta token kepada admin / guru.</li>
            <li>Masukkan token di atas (kartu Minat/Bakat atau kartu Tes IQ).</li>
            <li>Isi data diri.</li>
            <li>Kerjakan soal sesuai waktu yang disediakan tiap subtes.</li>
            <li>Selesai. Hasil akan dilihat &amp; diunduh oleh admin/guru.</li>
          </ol>
        </section>
      </main>

      <footer className="border-t-4 border-black bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 text-sm font-bold uppercase tracking-wider">
          © {new Date().getFullYear()} EKIU — Estimasi Kemampuan Intelektual Umum
        </div>
      </footer>
    </div>
  );
}
