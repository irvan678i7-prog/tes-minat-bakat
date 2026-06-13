import Link from "next/link";

export default function DonePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 relative overflow-hidden">
      <div className="brut-confetti" />
      <div className="w-full max-w-2xl relative z-10">
        <div className="brut-card text-center" style={{ background: "#a3e635" }}>
          <div className="brut-trophy mx-auto mb-4">
            <span aria-hidden>🏆</span>
          </div>
          <span className="brut-tag inline-block mb-3" style={{ background: "#000", color: "#fff" }}>
            BERHASIL
          </span>
          <h1 className="text-5xl md:text-6xl font-black uppercase leading-tight">
            TES SELESAI!
          </h1>
          <p className="mt-5 text-lg font-semibold leading-relaxed">
            Mantap! Kamu sudah menyelesaikan semua subtes. Hasil tes sedang
            <span className="brut-tag mx-1" style={{ background: "#facc15" }}>DIOLAH</span>
            secara otomatis.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 mt-6">
            <div className="brut-card" style={{ background: "#22d3ee", padding: 12 }}>
              <div className="text-3xl">✅</div>
              <div className="font-black uppercase text-sm mt-1">Tersimpan</div>
            </div>
            <div className="brut-card" style={{ background: "#facc15", padding: 12 }}>
              <div className="text-3xl">⚙️</div>
              <div className="font-black uppercase text-sm mt-1">Diproses</div>
            </div>
            <div className="brut-card" style={{ background: "#ff4d8d", padding: 12 }}>
              <div className="text-3xl">📄</div>
              <div className="font-black uppercase text-sm mt-1">Laporan PDF</div>
            </div>
          </div>
          <p className="mt-6 font-semibold">
            Laporan akan diunduh oleh admin / guru pembimbing dalam bentuk PDF lengkap.
          </p>
          <div className="mt-6">
            <Link href="/" className="brut-btn brut-btn-black inline-block">
              KEMBALI KE BERANDA
            </Link>
          </div>
        </div>
      </div>
      <style>{`
        .brut-trophy {
          width: 96px;
          height: 96px;
          border: 4px solid #000;
          background: #facc15;
          box-shadow: 8px 8px 0 0 #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 56px;
          line-height: 1;
          animation: brut-bounce 1.6s ease-in-out infinite;
        }
        @keyframes brut-bounce {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-8px) rotate(3deg); }
        }
        .brut-confetti {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            radial-gradient(circle at 10% 20%, #ff4d8d 0 6px, transparent 7px),
            radial-gradient(circle at 80% 30%, #22d3ee 0 6px, transparent 7px),
            radial-gradient(circle at 30% 70%, #facc15 0 6px, transparent 7px),
            radial-gradient(circle at 90% 80%, #a3e635 0 6px, transparent 7px),
            radial-gradient(circle at 60% 15%, #000 0 6px, transparent 7px),
            radial-gradient(circle at 25% 90%, #22d3ee 0 6px, transparent 7px),
            radial-gradient(circle at 70% 60%, #ff4d8d 0 6px, transparent 7px),
            radial-gradient(circle at 5% 60%, #facc15 0 6px, transparent 7px);
          background-size: 100% 100%;
          opacity: 0.5;
          animation: brut-fade 2s ease-out;
        }
        @keyframes brut-fade {
          0% { opacity: 0; transform: scale(0.85); }
          60% { opacity: 0.7; transform: scale(1.05); }
          100% { opacity: 0.5; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
