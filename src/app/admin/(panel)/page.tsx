"use client";

import { useEffect, useState } from "react";
import AdminTokens from "@/components/admin/AdminTokens";
import AdminQuestions from "@/components/admin/AdminQuestions";
import AdminSubmissions from "@/components/admin/AdminSubmissions";
import AdminPanduan from "@/components/admin/AdminPanduan";

type Tab = "tokens" | "questions" | "submissions" | "panduan";
const TABS = ["tokens", "questions", "submissions", "panduan"] as const;

export default function AdminDashboard() {
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
      <h1 className="text-4xl font-black uppercase mb-6">Dashboard</h1>
      <div className="flex flex-wrap gap-0 mb-6">
        {([
          ["tokens", "Token"],
          ["questions", "Bank Soal"],
          ["submissions", "Hasil"],
          ["panduan", "Panduan"],
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
      {tab === "tokens" && <AdminTokens />}
      {tab === "questions" && <AdminQuestions />}
      {tab === "submissions" && <AdminSubmissions />}
      {tab === "panduan" && <AdminPanduan />}
    </div>
  );
}
