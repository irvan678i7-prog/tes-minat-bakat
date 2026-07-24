"use client";

import { useState } from "react";
import CfitAdminTokens from "./CfitAdminTokens";
import CfitAdminQuestions from "./CfitAdminQuestions";
import CfitAdminResults from "./CfitAdminResults";

type SubTab = "tokens" | "questions" | "results";

// Panel admin Tes IQ (CFIT) yang di-embed sebagai tab di dashboard admin
// utama (/admin) — satu halaman, tidak pindah route.
export default function CfitAdminPanel() {
  const [tab, setTab] = useState<SubTab>("tokens");
  return (
    <div>
      <div className="brut-card mb-6" style={{ background: "#22d3ee" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-2xl font-black uppercase">Tes IQ — CFIT Skala 3</h2>
          <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>TERPISAH DARI MINAT-BAKAT</span>
        </div>
        <p className="text-sm font-semibold mt-1">
          Token, bank soal (gambar), dan hasil tes IQ dikelola di sini. Peserta mengakses
          lewat kartu “Tes IQ” di beranda atau halaman /cfit.
        </p>
      </div>
      <div className="flex flex-wrap gap-0 mb-6">
        {([
          ["tokens", "Token IQ"],
          ["questions", "Bank Soal IQ"],
          ["results", "Hasil IQ"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`brut-tab ${tab === k ? "active" : ""}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "tokens" && <CfitAdminTokens />}
      {tab === "questions" && <CfitAdminQuestions />}
      {tab === "results" && <CfitAdminResults />}
    </div>
  );
}
