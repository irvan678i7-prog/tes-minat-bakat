"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { cfitSubtestLabel } from "@/lib/cfit/subtest-label";

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

type ActiveBreak = {
  code: string;
  name: string;
  breakSec: number;
  remainingSec: number;
  formChanged: boolean;
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
  // Jeda otomatis antar subtes (sisa waktunya berasal dari SERVER).
  const [breakInfo, setBreakInfo] = useState<(ActiveBreak & { deadline: number }) | null>(null);
  const [breakLeft, setBreakLeft] = useState(0);
  const navigatedRef = useRef(false);
  const finishedRef = useRef(false);

  // Buka subtes berikutnya secara otomatis. Dijaga agar hanya sekali per
  // kunjungan halaman supaya tidak terjadi navigasi berulang.
  const openSubtest = useCallback(
    (code: string) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      router.replace(`/cfit/test/${encodeURIComponent(code)}`);
    },
    [router],
  );

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

    const ab = (data.activeBreak ?? null) as ActiveBreak | null;
    if (ab) {
      if (ab.remainingSec > 0) {
        setBreakInfo({ ...ab, deadline: Date.now() + ab.remainingSec * 1000 });
        setBreakLeft(ab.remainingSec);
      } else {
        // Jeda sudah lewat → langsung lanjut ke subtes berikutnya.
        setBreakInfo(null);
        setLoading(false);
        openSubtest(ab.code);
        return;
      }
    } else {
      setBreakInfo(null);
    }
    setLoading(false);
  }, [router, openSubtest]);

  useEffect(() => {
    void load();
  }, [load]);

  // Hitung mundur jeda → subtes berikutnya dibuka OTOMATIS saat jeda habis.
  useEffect(() => {
    if (!breakInfo) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((breakInfo.deadline - Date.now()) / 1000));
      setBreakLeft(left);
      if (left <= 0) {
        clearInterval(t);
        openSubtest(breakInfo.code);
      }
    }, 250);
    return () => clearInterval(t);
  }, [breakInfo, openSubtest]);

  const allLocked = subtests.length > 0 && subtests.every((s) => s.locked);
  // Urutan dipaksa: hanya subtes pertama yang belum terkunci yang boleh
  // dikerjakan (server juga memvalidasi hal yang sama).
  const activeIdx = subtests.findIndex((s) => !s.locked);

  const doFinish = useCallback(async () => {
    setFinishing(true);
    const res = await fetch("/api/cfit/test/finish", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal menyelesaikan tes");
      setFinishing(false);
      finishedRef.current = false;
      return;
    }
    router.replace("/cfit/done");
  }, [router]);

  // TIDAK ADA penyelesaian manual. Tes diselesaikan OTOMATIS begitu semua
  // subtes terkunci (habis waktunya), sehingga satu kelas selesai bersamaan.
  useEffect(() => {
    if (loading || !allLocked || finishedRef.current) return;
    finishedRef.current = true;
    void doFinish();
  }, [loading, allLocked, doFinish]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="brut-card font-black uppercase brut-blink">Memuat...</div>
      </div>
    );
  }

  // LAYAR JEDA — subtes berikutnya terbuka sendiri saat hitungan habis.
  if (breakInfo && breakLeft > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-xl space-y-5">
          <div className="brut-card space-y-4 text-center" style={{ background: "#a3e635" }}>
            <p className="text-xs font-black uppercase tracking-widest">
              {breakInfo.formChanged
                ? "Jeda pergantian bentuk tes — 3 menit"
                : "Jeda antar tes — 2 menit"}
            </p>
            <h1 className="text-3xl font-black uppercase leading-none">Istirahat Sebentar</h1>
            <div className="brut-sm mx-auto inline-block px-6 py-3 font-mono text-5xl font-black" style={{ background: "#fff" }}>
              {fmt(breakLeft)}
            </div>
            <p className="font-bold">
              Berikutnya: <span className="uppercase">{cfitSubtestLabel(breakInfo.code, breakInfo.name)}</span>
            </p>
            <p className="text-sm font-semibold">
              Tes berikutnya akan DIBUKA OTOMATIS saat hitungan mencapai 0:00. Jangan menutup halaman ini dan
              tunggu instruksi tester.
            </p>
          </div>
          <div className="brut-card text-sm font-semibold" style={{ background: "#fef9c3" }}>
            Gunakan jeda ini untuk mengistirahatkan mata. Waktu tes berikutnya baru berjalan setelah
            tesnya terbuka.
          </div>
        </div>
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
            {subtests.filter((s) => s.locked).length}/{subtests.length} TES
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full space-y-5">
        <div className="brut-card" style={{ background: "#fef9c3" }}>
          <p className="font-black uppercase mb-1">Jangan mulai sebelum ada pengarahan dari tester.</p>
          <p className="font-bold">
            Kerjakan setiap tes secara BERURUTAN. Setiap tes dimulai dari CONTOH SOAL yang tidak ada batas
            waktunya, lalu soal asli dikerjakan dengan waktu berjalan. TIDAK ADA tombol selesai — tes
            berakhir otomatis saat waktu habis, lalu ada JEDA 2 MENIT dan tes berikutnya terbuka sendiri.
            Saat Bentuk A selesai, jedanya 3 MENIT sebelum lanjut ke Bentuk B. Seluruh tes juga ditutup
            otomatis setelah tes terakhir habis waktunya.
          </p>
        </div>

        {finishing ? (
          <div className="brut-card font-black uppercase brut-blink" style={{ background: "#a3e635" }}>
            Semua tes selesai — memproses hasil...
          </div>
        ) : null}

        {subtests.map((s, i) => (
          <div key={s.code} className="brut-card flex flex-col md:flex-row md:items-center gap-4" style={{ background: "#fff" }}>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>{i + 1}</span>
                <h2 className="text-xl font-black uppercase">{cfitSubtestLabel(s.code, s.name)}</h2>
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
                <button className="brut-btn brut-btn-white" disabled title="Selesaikan tes sebelumnya dulu">
                  MENUNGGU GILIRAN
                </button>
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
