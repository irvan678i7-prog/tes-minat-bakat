"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type SubtestInfo = {
  code: string;
  form: "FORM_3A" | "FORM_3B";
  name: string;
  description: string | null;
  durationSec: number;
  orderIndex: number;
  totalQuestions: number;
  answered: number;
  started: boolean;
  locked: boolean;
  finishReason: string | null;
  remainingSec: number;
};

const FORM_LABEL: Record<string, string> = {
  FORM_3A: "Bentuk A",
  FORM_3B: "Bentuk B",
  FORM_3AB: "Bentuk A + B",
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CfitDashboardPage() {
  const router = useRouter();
  const [form, setForm] = useState("");
  const [subtests, setSubtests] = useState<SubtestInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/cfit/test/start", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/cfit");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal memuat status tes");
      return;
    }
    if (!data.profileFilled) {
      router.replace("/cfit/profile");
      return;
    }
    if (data.finishedAt) {
      router.replace("/cfit/done");
      return;
    }
    setForm(data.form);
    setSubtests(data.subtests);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const allLocked = subtests.length > 0 && subtests.every((s) => s.locked);
  // Urutan dipaksa: hanya subtes pertama yang belum terkunci yang boleh
  // dikerjakan (server juga memvalidasi hal yang sama).
  const activeIdx = subtests.findIndex((s) => !s.locked);

  const finishAll = async () => {
    if (
      !allLocked &&
      !window.confirm(
        "Masih ada subtes yang belum dikerjakan / belum dikunci.\nSemua subtes akan DIKUNCI dan tidak bisa dikerjakan lagi.\n\nYakin selesaikan tes sekarang?",
      )
    ) {
      return;
    }
    setFinishing(true);
    const res = await fetch("/api/cfit/test/finish", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal menyelesaikan tes");
      setFinishing(false);
      return;
    }
    router.replace("/cfit/done");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="brut-card font-black uppercase brut-blink">Memuat...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-cyan-300">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase">Tes IQ — CFIT Skala 3</h1>
            <p className="text-xs font-bold uppercase tracking-wider mt-0.5">{FORM_LABEL[form] ?? form}</p>
          </div>
          <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
            {subtests.filter((s) => s.locked).length}/{subtests.length} SUBTES
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full space-y-5">
        <div className="brut-card" style={{ background: "#fef9c3" }}>
          <p className="font-bold">
            Kerjakan subtes secara BERURUTAN — subtes berikutnya baru terbuka setelah subtes sebelumnya
            dikunci. Begitu subtes dimulai, timer berjalan dan tidak bisa dihentikan. Subtes yang waktunya
            habis akan terkunci otomatis.
          </p>
        </div>

        {subtests.map((s, i) => (
          <div key={s.code} className="brut-card flex flex-col md:flex-row md:items-center gap-4" style={{ background: "#fff" }}>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>{i + 1}</span>
                <h2 className="text-xl font-black uppercase">{s.name}</h2>
                <span className="brut-tag">{FORM_LABEL[s.form]}</span>
              </div>
              {s.description ? <p className="font-semibold text-sm mt-1">{s.description}</p> : null}
              <p className="font-bold text-sm mt-2">
                {s.answered}/{s.totalQuestions} terjawab · durasi {fmt(s.durationSec)}
                {s.locked
                  ? ` · TERKUNCI${s.finishReason === "TIME_UP" ? " (WAKTU HABIS)" : ""}`
                  : s.started
                    ? ` · SISA ±${fmt(s.remainingSec)}`
                    : ""}
              </p>
            </div>
            <div className="shrink-0">
              {s.locked ? (
                <button className="brut-btn brut-btn-white" disabled>
                  TERKUNCI
                </button>
              ) : i === activeIdx ? (
                <button
                  className={`brut-btn ${s.started ? "brut-btn-pink" : "brut-btn-lime"}`}
                  onClick={() => router.push(`/cfit/test/${encodeURIComponent(s.code)}`)}
                >
                  {s.started ? "LANJUTKAN" : "MULAI"}
                </button>
              ) : (
                <button className="brut-btn brut-btn-white" disabled title="Selesaikan subtes sebelumnya dulu">
                  MENUNGGU GILIRAN
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="pt-2">
          <button className="brut-btn brut-btn-black w-full" onClick={finishAll} disabled={finishing}>
            {finishing ? "MEMPROSES..." : allLocked ? "SELESAIKAN TES" : "SELESAIKAN TES SEKARANG"}
          </button>
        </div>
      </main>
    </div>
  );
}
