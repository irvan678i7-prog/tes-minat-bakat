export default function ProfileLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-black uppercase">DATA DIRI PESERTA</h1>
          <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
            MEMUAT…
          </span>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
        <div className="brut-card brut-skel" style={{ background: "#fff" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-4">
              <div className="brut-skel-bar" style={{ width: "30%", height: 14 }} />
              <div className="brut-skel-bar mt-2" style={{ width: "100%", height: 42 }} />
            </div>
          ))}
        </div>
      </main>
      <style>{`
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
