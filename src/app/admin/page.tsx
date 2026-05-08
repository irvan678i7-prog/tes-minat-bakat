"use client";

import { useEffect, useState } from "react";
import AdminTokens from "@/components/admin/AdminTokens";
import AdminQuestions from "@/components/admin/AdminQuestions";
import AdminSubmissions from "@/components/admin/AdminSubmissions";

type Tab = "tokens" | "questions" | "submissions";

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "tokens";
    const fromHash = window.location.hash.replace("#", "") as Tab;
    return (["tokens", "questions", "submissions"] as const).includes(fromHash)
      ? fromHash
      : "tokens";
  });
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "") as Tab;
      if ((["tokens", "questions", "submissions"] as const).includes(h)) setTab(h);
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
    </div>
  );
}
