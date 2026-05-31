import Link from "next/link";
import StudentTokenForm from "@/components/StudentTokenForm";

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
            Pilih Jenis <span className="bg-pink-400 px-2 border-4 border-black">TES</span>
          </h2>
          <p className="mt-3 text-lg font-semibold max-w-2xl">
            Masukkan token yang diberikan oleh admin / guru pembimbing. Token aktif
            <span className="brut-tag mx-1">5 menit</span> sejak dibuat.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-8">
          <div className="brut-card" style={{ background: "#22d3ee" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-3xl font-black uppercase">Tes Minat</h3>
              <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>A–H</span>
            </div>
            <p className="font-semibold mb-4">
              Mengukur ketertarikan terhadap bidang tertentu lewat 28 soal pasangan kata,
              dilanjutkan pemetaan ke 8 program keahlian (A — Komunikasi sampai H — Teknik &amp; Maritim).
            </p>
            <ul className="font-semibold mb-4 list-disc list-inside">
              <li>Tidak ada jawaban benar / salah</li>
              <li>Hasil: rekomendasi jurusan keahlian</li>
            </ul>
            <StudentTokenForm testKind="MINAT" />
          </div>

          <div className="brut-card" style={{ background: "#facc15" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-3xl font-black uppercase">Tes Bakat</h3>
              <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>9 SUBTES</span>
            </div>
            <p className="font-semibold mb-4">
              Mengukur kemampuan kognitif: penalaran visual, numerik, verbal, urutan, spasial,
              tiga dimensi, sistematisasi, kosa kata, &amp; figural angka.
            </p>
            <ul className="font-semibold mb-4 list-disc list-inside">
              <li>Tiap subtes punya batas waktu</li>
              <li>Hasil: profil bakat + IQ prediksi + rekomendasi</li>
            </ul>
            <StudentTokenForm testKind="BAKAT" />
          </div>
        </section>

        <section className="mt-12 brut-card" style={{ background: "#fff" }}>
          <h3 className="text-2xl font-black uppercase mb-3">Bagaimana cara mengikuti tes?</h3>
          <ol className="list-decimal list-inside font-semibold space-y-2">
            <li>Minta token kepada admin / guru.</li>
            <li>Pilih jenis tes (Minat atau Bakat) sesuai token.</li>
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
