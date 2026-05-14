// Next.js streams ini ke browser saat <Link href="/test"> di-klik, jadi siswa
// langsung lihat shell page (header + grid skeleton) tanpa harus menunggu
// query Prisma + computeSubtestLock selesai di server. Mengurangi "rasa lambat"
// secara signifikan untuk sekolah dengan koneksi pas-pasan.
export default function TestHomeLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
              TES MINAT &amp; BAKAT
            </h1>
            <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
              MEMUAT…
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        <h2 className="text-3xl md:text-4xl font-black uppercase mb-5">
          DAFTAR SUBTES
        </h2>
        <div className="grid md:grid-cols-2 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="brut-card brut-skel"
              style={{
                background: ["#22d3ee", "#facc15", "#a3e635", "#ff4d8d"][i % 4],
                minHeight: 140,
              }}
            >
              <div className="brut-skel-bar" style={{ width: "60%" }} />
              <div className="brut-skel-bar mt-3" style={{ width: "90%" }} />
              <div className="brut-skel-bar mt-2" style={{ width: "75%" }} />
              <div className="brut-skel-bar mt-4" style={{ width: "40%", height: 28 }} />
            </div>
          ))}
        </div>
      </main>
      <style>{`
        .brut-skel { position: relative; overflow: hidden; }
        .brut-skel-bar {
          display: block;
          height: 14px;
          background: rgba(0,0,0,0.18);
          border: 2px solid #000;
          animation: brut-skel-pulse 1.1s ease-in-out infinite;
        }
        @keyframes brut-skel-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.95; }
        }
      `}</style>
    </div>
  );
}
