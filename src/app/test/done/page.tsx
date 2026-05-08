import Link from "next/link";

export default function DonePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="brut-card w-full max-w-xl text-center" style={{ background: "#a3e635" }}>
        <h1 className="text-4xl font-black uppercase">Tes Selesai!</h1>
        <p className="mt-4 font-semibold">
          Terima kasih sudah mengikuti tes. Hasil tes akan diolah dan diunduh oleh admin / guru
          dalam bentuk laporan PDF.
        </p>
        <div className="mt-6">
          <Link href="/" className="brut-btn brut-btn-black">KEMBALI KE BERANDA</Link>
        </div>
      </div>
    </div>
  );
}
