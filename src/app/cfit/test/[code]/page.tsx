"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAntiCheat } from "@/components/student/useAntiCheat";
import CfitConfirm from "@/components/cfit/CfitConfirm";

type Option = { key: string; label: string; imageUrl: string | null };

type Question = {
  id: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  options: Option[];
  isExample: boolean;
  expectedAnswers: number;
};

type SubtestMeta = {
  code: string;
  name: string;
  description: string | null;
  instructions: string | null;
  durationSec: number;
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function violationLabel(t: string | null): string {
  switch (t) {
    case "tab_hidden":
      return "pindah tab / ganti aplikasi";
    case "fullscreen_exit":
      return "keluar dari mode fullscreen";
    case "screenshot":
      return "mencoba mengambil screenshot";
    default:
      return "aktivitas mencurigakan";
  }
}

export default function CfitSubtestRunnerPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const subtestCode = decodeURIComponent(params.code ?? "");

  const [subtest, setSubtest] = useState<SubtestMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  // Banner peringatan yang bisa ditutup — muncul lagi setiap ada pelanggaran baru.
  const [ackedAt, setAckedAt] = useState(0);

  // Kunci subtes lalu kembali ke halaman daftar subtes. Di sana jeda otomatis
  // (2 menit; 3 menit saat ganti bentuk) berjalan dan subtes berikutnya akan
  // dibuka SENDIRI setelah jeda selesai.
  const finishSubtest = useCallback(
    async (auto: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      await fetch("/api/cfit/test/subtest-finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtestCode }),
      }).catch(() => null);
      if (auto) toast.error("Waktu habis! Subtes dikunci.");
      else toast.success("Subtes selesai.");
      router.replace("/cfit/test");
    },
    [router, subtestCode],
  );

  // Muat subtes + soal (timer server-side mulai berjalan di sini).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/cfit/test/subtest-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtestCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/cfit");
        return;
      }
      if (res.status === 423) {
        toast.error("Subtes ini sudah terkunci.");
        router.replace("/cfit/test");
        return;
      }
      if (res.status === 425) {
        // Masih dalam jeda antar subtes — kembalikan ke layar jeda.
        toast(data.error || "Masih dalam jeda antar subtes.", { icon: "⏳" });
        router.replace("/cfit/test");
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "Gagal memuat subtes");
        router.replace("/cfit/test");
        return;
      }
      setSubtest(data.subtest);
      setQuestions(data.questions);
      const saved: Record<string, string[]> = {};
      for (const a of data.savedAnswers ?? []) {
        saved[a.questionId] = Array.isArray(a.selected) ? a.selected.map(String) : [String(a.selected)];
      }
      setAnswers(saved);
      // Mulai dari soal pertama yang belum terjawab.
      const qs: Question[] = data.questions;
      const firstUnanswered = qs.findIndex((q) => !saved[q.id]);
      setIdx(firstUnanswered >= 0 ? firstUnanswered : 0);
      deadlineRef.current = Date.now() + data.remainingSec * 1000;
      setRemaining(data.remainingSec);
    })();
    return () => {
      cancelled = true;
    };
  }, [subtestCode, router]);

  // PRELOAD semua gambar soal & opsi begitu data diterima. Tanpa ini, gambar
  // baru diunduh saat soalnya dibuka sehingga tiap pindah soal terasa lambat
  // (padahal timer terus berjalan). Browser meng-cache hasil preload, jadi
  // saat soal dibuka gambarnya langsung tampil.
  useEffect(() => {
    if (questions.length === 0) return;
    const urls: string[] = [];
    for (const item of questions) {
      if (item.imageUrl) urls.push(item.imageUrl);
      for (const o of item.options) if (o.imageUrl) urls.push(o.imageUrl);
    }
    for (const u of urls) {
      const im = new window.Image();
      im.decoding = "async";
      im.src = u;
    }
  }, [questions]);

  // Countdown — deadline dihitung dari remainingSec milik SERVER. Waktu habis
  // → subtes otomatis dikunci tanpa perlu klik apa pun.
  const loaded = remaining !== null;
  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(() => {
      if (!deadlineRef.current) return;
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        void finishSubtest(true);
      }
    }, 250);
    return () => clearInterval(t);
  }, [loaded, finishSubtest]);

  // Anti-curang — aturan SAMA dengan tes minat-bakat: pindah tab, keluar
  // fullscreen, dan screenshot dihitung pelanggaran; auto-flag setelah 5x.
  const { state: anti, requestFullscreen, fullscreenActive } = useAntiCheat({
    active: loaded && !!subtest,
    subtestCode,
    endpoint: "/api/cfit/test/violation",
  });

  const saveAnswer = useCallback(
    async (q: Question, sel: string[]) => {
      const selected = q.expectedAnswers > 1 ? sel : sel[0];
      const res = await fetch("/api/cfit/test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, selected }),
      });
      if (res.status === 423) {
        toast.error("Waktu sudah habis — jawaban terakhir tidak tersimpan.");
        void finishSubtest(true);
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Gagal menyimpan jawaban");
      }
    },
    [finishSubtest],
  );

  const choose = (q: Question, optKey: string) => {
    const cur = answers[q.id] ?? [];
    let next: string[];
    if (q.expectedAnswers > 1) {
      // Multi-jawaban: toggle; maksimal expectedAnswers pilihan (yang paling
      // lama diganti otomatis).
      next = cur.includes(optKey) ? cur.filter((o) => o !== optKey) : [...cur, optKey].slice(-q.expectedAnswers);
    } else {
      next = [optKey];
    }
    // Functional update — mencegah jawaban soal lain hilang saat siswa
    // mengklik sangat cepat berpindah-pindah soal (stale state race).
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    if (next.length > 0) void saveAnswer(q, next);
  };

  if (!loaded || !subtest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="brut-card font-black uppercase brut-blink">Memuat subtes...</div>
      </div>
    );
  }

  const q = questions[idx];
  const timeLow = (remaining ?? 0) <= 30;
  const hasOptionImages = q ? q.options.some((o) => o.imageUrl) : false;
  const showViolationBanner = anti.count > 0 && anti.lastAt > ackedAt;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-cyan-300 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-black uppercase leading-none">{subtest.name}</h1>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider mt-0.5">
              Soal {idx + 1} / {questions.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {anti.count > 0 ? (
              <span
                className="brut-tag"
                style={{ background: anti.flagged ? "#ff4d8d" : "#fef08a" }}
                title="Jumlah pelanggaran terdeteksi"
              >
                ⚠️ {anti.count}/{anti.threshold}
              </span>
            ) : null}
            <div
              className={`brut-sm px-3 py-1 font-mono text-xl md:text-2xl font-black ${timeLow ? "brut-blink" : ""}`}
              style={{ background: timeLow ? "#ff4d8d" : "#fff" }}
            >
              {fmt(remaining ?? 0)}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 md:px-6 py-6 w-full space-y-4">
        {showViolationBanner ? (
          <div className="brut-card space-y-2" style={{ background: "#ff4d8d" }}>
            <p className="font-black uppercase">⚠️ Pelanggaran terdeteksi: {violationLabel(anti.lastType)}</p>
            <p className="text-sm font-semibold">
              Total {anti.count} dari batas {anti.threshold} pelanggaran.{" "}
              {anti.flagged
                ? "Kamu sudah DITANDAI oleh sistem dan hasilmu akan diperiksa admin."
                : `Jika mencapai ${anti.threshold} pelanggaran, kamu otomatis ditandai menyontek.`}
            </p>
            <button type="button" className="brut-btn brut-btn-white" onClick={() => setAckedAt(Date.now())}>
              OK, SAYA MENGERTI
            </button>
          </div>
        ) : null}

        {!fullscreenActive ? (
          <div
            className="brut-card flex flex-col md:flex-row md:items-center justify-between gap-3"
            style={{ background: "#fef9c3" }}
          >
            <p className="text-xs font-bold uppercase">
              Kerjakan dalam mode fullscreen. Pindah tab, keluar fullscreen, atau screenshot dihitung pelanggaran.
            </p>
            <button type="button" className="brut-btn brut-btn-black shrink-0" onClick={requestFullscreen}>
              AKTIFKAN FULLSCREEN
            </button>
          </div>
        ) : null}

        {subtest.instructions && idx === 0 ? (
          <div className="brut-card text-sm font-semibold whitespace-pre-wrap" style={{ background: "#fef9c3" }}>
            {subtest.instructions}
          </div>
        ) : null}

        {q ? (
          <div className="brut-card space-y-4" style={{ background: "#fff" }}>
            <div className="flex items-center gap-2">
              <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
                {q.isExample ? `CONTOH ${q.questionNo}` : `NO. ${q.questionNo}`}
              </span>
              {q.expectedAnswers > 1 ? (
                <span className="brut-tag" style={{ background: "#ff4d8d" }}>PILIH {q.expectedAnswers} JAWABAN</span>
              ) : null}
            </div>

            {q.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={q.imageUrl}
                alt={`Soal ${q.questionNo}`}
                className="w-full max-h-[420px] object-contain border-4 border-black bg-white"
                loading="eager"
                decoding="async"
                draggable={false}
              />
            ) : null}

            {q.prompt ? <p className="font-semibold">{q.prompt}</p> : null}

            <div className={hasOptionImages ? "grid grid-cols-2 md:grid-cols-3 gap-3" : "grid grid-cols-3 md:grid-cols-6 gap-3"}>
              {q.options.map((opt) => {
                const selected = (answers[q.id] ?? []).includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`brut-checkbox flex-col items-center justify-center gap-1 text-lg font-black uppercase ${selected ? "selected-cyan selected" : ""}`}
                    onClick={() => choose(q, opt.key)}
                  >
                    {opt.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={opt.imageUrl}
                        alt={`Pilihan ${opt.key}`}
                        className="w-full max-h-28 object-contain bg-white"
                        loading="eager"
                        decoding="async"
                        draggable={false}
                      />
                    ) : null}
                    <span>{opt.key}</span>
                    {opt.label ? <span className="text-xs font-bold normal-case">{opt.label}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="brut-card font-bold" style={{ background: "#fff" }}>
            Belum ada soal untuk subtes ini. Hubungi admin.
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button className="brut-btn brut-btn-white" onClick={() => setIdx((v) => Math.max(0, v - 1))} disabled={idx === 0}>
            ← SEBELUMNYA
          </button>
          {idx < questions.length - 1 ? (
            <button className="brut-btn brut-btn-cyan" onClick={() => setIdx((v) => Math.min(questions.length - 1, v + 1))}>
              BERIKUTNYA →
            </button>
          ) : (
            <button className="brut-btn brut-btn-black" onClick={() => setConfirmFinish(true)}>
              SELESAI SUBTES
            </button>
          )}
        </div>

        <div className="brut-card" style={{ background: "#fff" }}>
          <p className="text-xs font-black uppercase mb-2">Navigasi soal</p>
          <div className="flex flex-wrap gap-2">
            {questions.map((item, i) => {
              const answered = (answers[item.id] ?? []).length > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  className="brut-sm w-10 h-10 font-black text-sm"
                  style={{
                    background: i === idx ? "#000" : answered ? "#a3e635" : "#fff",
                    color: i === idx ? "#fff" : "#000",
                  }}
                >
                  {item.isExample ? `C${item.questionNo}` : item.questionNo}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <CfitConfirm
        open={confirmFinish}
        title="Selesaikan subtes ini?"
        danger
        confirmLabel="YA, KUNCI SUBTES"
        onConfirm={() => {
          setConfirmFinish(false);
          void finishSubtest(false);
        }}
        onCancel={() => setConfirmFinish(false)}
      >
        Subtes akan DIKUNCI dan tidak bisa dibuka lagi. Setelah ini ada jeda otomatis sebelum subtes
        berikutnya terbuka. Pastikan semua jawaban sudah terisi.
      </CfitConfirm>
    </div>
  );
}
