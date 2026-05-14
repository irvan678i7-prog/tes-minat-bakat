// Skeleton saat siswa klik "MULAI" di kartu subtes — segera tampil sambil
// server menyelesaikan query (ensureSubtestStarted + answer.findMany jalan
// paralel di page.tsx). Tanpa file ini, browser cuma diam ~ratusan ms.
export default function SubtestLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-black uppercase opacity-70">SUBTES</div>
            <div className="text-xl font-black uppercase">MEMUAT…</div>
          </div>
          <span className="brut-tag font-mono text-lg" style={{ background: "#000", color: "#fff" }}>
            --:--
          </span>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <div className="brut-card mb-6 brut-skel" style={{ background: "#fff" }}>
          <div className="brut-skel-bar" style={{ width: "85%", height: 24 }} />
          <div className="brut-skel-bar mt-3" style={{ width: "70%" }} />
          <div className="brut-skel-bar mt-2" style={{ width: "92%" }} />
          <div className="brut-skel-bar mt-2" style={{ width: "60%" }} />
        </div>
        <div className="brut-card brut-skel" style={{ background: "#facc15", minHeight: 220 }}>
          <div className="brut-skel-bar" style={{ width: "40%", height: 18 }} />
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="brut-skel-bar" style={{ width: "100%", height: 44 }} />
            ))}
          </div>
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
