import Link from "next/link";

// Halaman 404 brutalism style. Next.js otomatis render ini kalau URL tidak
// match route apa pun.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg brut-card" style={{ background: "#facc15" }}>
        <div className="text-7xl font-black mb-2">404</div>
        <h1 className="text-3xl font-black uppercase mb-2">Halaman Tidak Ditemukan</h1>
        <p className="font-semibold mb-6">
          Alamat yang kamu tuju tidak ada di sistem. Mungkin sudah dipindah atau
          dihapus.
        </p>
        <Link href="/" className="brut-btn brut-btn-black inline-block">
          KEMBALI KE BERANDA
        </Link>
      </div>
    </div>
  );
}
