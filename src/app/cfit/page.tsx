import Link from "next/link";
import CfitTokenForm from "@/components/cfit/CfitTokenForm";

export const metadata = {
  title: "Tes IQ — CFIT Skala 3",
  description: "Culture Fair Intelligence Test Skala 3 bentuk A & B",
};

const SUBTESTS = [
  { name: "Series", desc: "Melanjutkan pola deret gambar.", n: 13, menit: "3" },
  { name: "Classification", desc: "Menemukan gambar yang berbeda dari kelompoknya.", n: 14, menit: "4" },
  { name: "Matrices", desc: "Melengkapi matriks pola gambar.", n: 13, menit: "3" },
  { name: "Conditions", desc: "Menentukan posisi titik sesuai kondisi contoh.", n: 10, menit: "2,5" },
];

export default function CfitHome() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-cyan-300">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase leading-none">
              TES IQ — CFIT SKALA 3
            </h1>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider mt-0.5">
              Culture Fair Intelligence Test · Bentuk A &amp; B
            </p>
          </div>
          <Link href="/" className="brut-btn brut-btn-white text-sm">
            MINAT-BAKAT
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 w-full">
        <section className="mb-10">
          <h2 className="text-4xl md:text-5xl font-black uppercase leading-tight">
            Masukkan <span className="bg-cyan-300 px-2 border-4 border-black">TOKEN</span>
          </h2>
          <p className="mt-3 text-lg font-semibold max-w-2xl">
            Masukkan token tes IQ yang diberikan oleh admin / guru pembimbing.
            Bentuk tes (3A, 3B, atau gabungan A+B) otomatis terdeteksi dari token.
          </p>
        </section>

        <section className="max-w-md">
          <div className="brut-card" style={{ background: "#22d3ee" }}>
            <CfitTokenForm />
          </div>
        </section>

        <section className="grid md:grid-cols-4 gap-6 mt-10">
          {SUBTESTS.map((s, i) => (
            <div key={s.name} className="brut-card" style={{ background: "#fff" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>{i + 1}</span>
                <span className="brut-tag">{s.menit} MENIT</span>
              </div>
              <h3 className="text-xl font-black uppercase">{s.name}</h3>
              <p className="font-semibold text-sm mt-1">{s.desc}</p>
              <p className="font-bold text-xs mt-2 uppercase">{s.n} soal / bentuk</p>
            </div>
          ))}
        </section>

        <section className="mt-10 brut-card" style={{ background: "#fff" }}>
          <h3 className="text-2xl font-black uppercase mb-3">Penting sebelum mulai</h3>
          <ol className="list-decimal list-inside font-semibold space-y-2">
            <li>Tiap subtes punya batas waktu sendiri — begitu dimulai, timer tidak bisa dihentikan.</li>
            <li>Kerjakan subtes berurutan: Series → Classification → Matrices → Conditions.</li>
            <li>Jawaban tersimpan otomatis setiap kali kamu memilih.</li>
            <li>Jika waktu habis, subtes terkunci otomatis dan tidak bisa dibuka lagi.</li>
            <li>Hasil akan diolah dan disampaikan oleh admin / guru pembimbing.</li>
          </ol>
        </section>
      </main>

      <footer className="border-t-4 border-black bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 text-sm font-bold uppercase tracking-wider">
          © {new Date().getFullYear()} TES IQ — CFIT SKALA 3
        </div>
      </footer>
    </div>
  );
}
