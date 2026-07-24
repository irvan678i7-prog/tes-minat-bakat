"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CfitAdminTokens from "@/components/admin/cfit/CfitAdminTokens";
import CfitAdminQuestions from "@/components/admin/cfit/CfitAdminQuestions";
import CfitAdminResults from "@/components/admin/cfit/CfitAdminResults";

type Tab = "tokens" | "questions" | "results";
const TABS = ["tokens", "questions", "results"] as const;

export default function CfitAdminPage() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "tokens";
    const fromHash = window.location.hash.replace("#", "") as Tab;
    return TABS.includes(fromHash) ? fromHash : "tokens";
  });
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "") as Tab;
      if (TABS.includes(h)) setTab(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-4xl font-black uppercase">
          Tes IQ <span className="bg-cyan-300 px-2 border-4 border-black">CFIT</span>
        </h1>
        <Link href="/admin" className="brut-btn brut-btn-white text-sm">
          ← MINAT-BAKAT
        </Link>
      </div>
      <div className="flex flex-wrap gap-0 mb-6">
        {([
          ["tokens", "Token"],
          ["questions", "Bank Soal"],
          ["results", "Hasil"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              window.location.hash = k;
            }}
            className={`brut-tab ${tab === k ? "active" : ""}`}
          >
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
