"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAntiCheat } from "@/components/student/useAntiCheat";

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

// "example" = tahap contoh soal (TANPA TIMER), "test" = soal asli (timer jalan).
type Phase = "example" | "test";

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
  const [phase, setPhase] = useState<Phase | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  // Alert sebelum soal asli dibuka: tunggu arahan tester.
  const [briefing, setBriefing] = useState(false);
  const [starting, setStarting] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  // Banner peringatan yang bisa ditutup — muncul lagi setiap ada pelanggaran baru.
  const [ackedAt, setAckedAt] = useState(0);

  // Subtes HANYA berakhir karena waktu habis (tidak ada penyelesaian manual),
  // supaya seluruh peserta satu kelas selesai bersamaan. Setelah terkunci,
  // peserta kembali ke layar jeda dan subtes berikutnya terbuka otomatis.
  const finishSubtest = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    await fetch("/api/cfit/test/subtest-finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtestCode }),
    }).catch(() => null);
    toast.error("Waktu habis! Subtes dikunci.");
    router.replace("/cfit/test");
  }, [router, subtestCode]);

  // Muat satu tahap subtes. Tahap "example" tidak menyalakan timer sama sekali.
  const loadPhase = useCallback(
    async (want: Phase) => {
      const res = await fetch("/api/cfit/test/subtest-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtestCode, phase: want }),
      });
      const data = await res.json().catch(() => ({}));
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

      const saved: Record<string, string[]> = {};
      for (const a of data.savedAnswers ?? []) {
        saved[a.questionId] = Array.isArray(a.selected) ? a.selected.map(String) : [String(a.selected)];
      }
      const qs: Question[] = data.questions ?? [];

      setSubtest(data.subtest);
      setQuestions(qs);
      setAnswers(saved);
      setPhase(data.phase === "example" ? "example" : "test");
      // Mulai dari soal pertama yang belum terjawab.
      const firstUnanswered = qs.findIndex((q) => !saved[q.id]);
      setIdx(firstUnanswered >= 0 ? firstUnanswered : 0);

      if (data.phase === "test") {
        deadlineRef.current = Date.now() + data.remainingSec * 1000;
        setRemaining(data.remainingSec);
      } else {
        deadlineRef.current = null;
        setRemaining(null);
      }
    },
    [router, subtestCode],
  );

  // Masuk subtes selalu dari tahap CONTOH. Kalau timer subtes sudah berjalan
  // (peserta refresh di tengah subtes), server otomatis mengembalikan tahap tes.
  useEffect(() => {
    void loadPhase("example");
  }, [loadPhase]);

  const startTest = () => {
    setStarting(true);
    setBriefing(false);
    void loadPhase("test").finally(() => setStarting(false));
  };

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

  // Countdown — hanya pada tahap soal asli. Deadline dihitung dari
  // remainingSec milik SERVER. Waktu habis → subtes dikunci otomatis.
  const timerActive = phase === "test" && remaining !== null;
  useEffect(() => {
    if (!timerActive) return;
    const t = setInterval(() => {
      if (!deadlineRef.current) return;
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        void finishSubtest();
      }
    }, 250);
    return () => clearInterval(t);
  }, [timerActive, finishSubtest]);

  const loaded = phase !== null && !!subtest;

  // Anti-curang — aturan SAMA dengan tes minat-bakat: pindah tab, keluar
  // fullscreen, dan screenshot dihitung pelanggaran; auto-flag setelah 5x.
  const { state: anti, requestFullscreen, fullscreenActive } = useAntiCheat({
    active: loaded,
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
        void finishSubtest();
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

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="brut-card font-black uppercase brut-blink">Memuat subtes...</div>
      </div>
    );
  }

  const isExamplePhase = phase === "example";
  const q = questions[idx];
  const timeLow = (remaining ?? 0) <= 30;
  const hasOptionImages = q ? q.options.some((o) => o.imageUrl) : false;
  const showViolationBanner = anti.count > 0 && anti.lastAt > ackedAt;
  const isLast = idx >= questions.length - 1;

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="border-b-4 border-black sticky top-0 z-10"
        style={{ background: isExamplePhase ? "#a3e635" : "#67e8f9" }}
      >
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-black uppercase leading-none">{subtest.name}</h1>
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider mt-0.5">
              {isExamplePhase ? "Contoh soal" : "Soal"} {questions.length > 0 ? idx + 1 : 0} / {questions.length}
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
            {isExamplePhase ? (
              <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
                LATIHAN · TANPA WAKTU
              </span>
            ) : (
              <div
                className={`brut-sm px-3 py-1 font-mono text-xl md:text-2xl font-black ${timeLow ? "brut-blink" : ""}`}
                style={{ background: timeLow ? "#ff4d8d" : "#fff" }}
              >
                {fmt(remaining ?? 0)}
              </div>
            )}
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

        {isExamplePhase ? (
          <div className="brut-card space-y-1" style={{ background: "#a3e635" }}>
            <p className="font-black uppercase">Tahap contoh soal — tidak dinilai, tidak ada batas waktu.</p>
            <p className="text-sm font-semibold">
              Kerjakan contoh sambil mendengarkan penjelasan tester. Waktu subtes baru mulai berjalan setelah
              tahap ini selesai.
            </p>
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
            {isExamplePhase
              ? "Subtes ini tidak memiliki contoh soal. Lanjutkan setelah mendapat arahan tester."
              : "Belum ada soal untuk subtes ini. Hubungi admin."}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button className="brut-btn brut-btn-white" onClick={() => setIdx((v) => Math.max(0, v - 1))} disabled={idx === 0}>
            ← SEBELUMNYA
          </button>
          {!isLast ? (
            <button className="brut-btn brut-btn-cyan" onClick={() => setIdx((v) => Math.min(questions.length - 1, v + 1))}>
              BERIKUTNYA →
            </button>
          ) : isExamplePhase ? (
            <button className="brut-btn brut-btn-lime" onClick={() => setBriefing(true)} disabled={starting}>
              SELESAI CONTOH →
            </button>
          ) : (
            <button className="brut-btn brut-btn-white" disabled title="Subtes berakhir otomatis saat waktu habis">
              SUBTES BERAKHIR SAAT WAKTU HABIS
            </button>
          )}
        </div>

        {!isExamplePhase ? (
          <div className="brut-card text-sm font-semibold" style={{ background: "#fef9c3" }}>
            Tidak ada tombol selesai. Subtes berakhir OTOMATIS saat waktu habis, supaya seluruh peserta satu
            kelas selesai bersamaan. Periksa kembali jawabanmu selagi waktu tersisa.
          </div>
        ) : null}

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

      {briefing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(0,0,0,0.75)" }}
          role="dialog"
          aria-modal="true"
        >
          <div className="brut-card w-full max-w-lg space-y-4" style={{ background: "#fef08a" }}>
            <h2 className="text-2xl font-black uppercase leading-tight">
              ⚠️ Jangan mulai sebelum ada arahan tester!
            </h2>
            <p className="font-bold">
              Contoh soal sudah selesai. TUNGGU ARAHAN TESTER sebelum menekan tombol di bawah.
            </p>
            <p className="text-sm font-semibold">
              Begitu ditekan, waktu subtes langsung berjalan dan tidak bisa dihentikan. Subtes berakhir
              otomatis saat waktu habis.
            </p>
            <div className="flex flex-col md:flex-row gap-3">
              <button
                type="button"
                className="brut-btn brut-btn-white flex-1"
                onClick={() => setBriefing(false)}
                disabled={starting}
              >
                KEMBALI KE CONTOH
              </button>
              <button
                type="button"
                className="brut-btn brut-btn-black flex-1"
                onClick={startTest}
                disabled={starting}
              >
                {starting ? "MEMBUKA..." : "MULAI SUBTES SEKARANG"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
