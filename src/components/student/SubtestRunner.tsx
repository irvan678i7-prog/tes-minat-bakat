"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import { useAntiCheat } from "./useAntiCheat";
import { useAnswerSync } from "./useAnswerSync";

type OptionItem = { key: string; label: string; imageUrl?: string };
type Question = {
  id: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  imageUrl2?: string | null;
  parts: number;
  options: unknown;
  inputMode?: "CHOICE" | "TEXT";
  partLabels?: string[];
};

type ExampleQuestion = Question & { correct: unknown };

const STORAGE_KEY = (subtestCode: string) => `tmb-runner-${subtestCode}`;
const STARTED_KEY = (subtestCode: string) => `tmb-runner-started-${subtestCode}`;

function fmtTime(s: number): string {
  if (s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function correctSetFor(q: ExampleQuestion): Set<string> {
  if (Array.isArray(q.correct)) {
    return new Set(q.correct.map((x) => String(x).toUpperCase()));
  }
  if (q.correct != null && String(q.correct).trim() !== "") {
    return new Set([String(q.correct).toUpperCase()]);
  }
  return new Set();
}

function correctTextFor(q: ExampleQuestion): string[] {
  if (Array.isArray(q.correct)) return q.correct.map((x) => String(x));
  if (q.correct != null && String(q.correct).trim() !== "") return [String(q.correct)];
  return [];
}

function partLabel(q: { parts: number; partLabels?: string[] }, partIdx: number): string {
  return q.partLabels?.[partIdx] ?? String(partIdx + 1);
}

function violationLabel(t: string | null): string {
  switch (t) {
    case "tab_hidden":
      return "Pindah tab / ganti aplikasi";
    case "blur":
      return "Klik di luar halaman tes";
    case "fullscreen_exit":
      return "Keluar dari mode full-screen";
    case "copy":
      return "Menyalin teks (copy)";
    case "paste":
      return "Menempel teks (paste)";
    case "cut":
      return "Memotong teks (cut)";
    case "context_menu":
      return "Klik kanan";
    case "shortcut":
      return "Pintasan keyboard terlarang";
    default:
      return "Aktivitas mencurigakan";
  }
}

function SyncBadge({
  status,
  pendingCount,
}: {
  status: "idle" | "syncing" | "queued" | "offline" | "error";
  pendingCount: number;
}) {
  if (status === "idle" && pendingCount === 0) {
    return (
      <span
        className="brut-tag font-mono text-xs"
        style={{ background: "#a3e635" }}
        title="Semua jawaban tersimpan di server."
      >
        ✓ TERSIMPAN
      </span>
    );
  }
  let bg = "#fff";
  let fg = "#000";
  let label = "MENYIMPAN…";
  if (status === "syncing") {
    bg = "#facc15";
    label = pendingCount > 0 ? `MENYIMPAN… ${pendingCount}` : "MENYIMPAN…";
  } else if (status === "queued") {
    bg = "#fb923c";
    label = `ANTRI ${pendingCount}`;
  } else if (status === "offline") {
    bg = "#ff4d8d";
    fg = "#fff";
    label = "OFFLINE — JAWABAN AMAN";
  } else if (status === "error") {
    bg = "#ff4d8d";
    fg = "#fff";
    label = "GAGAL SYNC";
  }
  return (
    <span
      className="brut-tag font-mono text-xs"
      style={{ background: bg, color: fg }}
      title="Status pengiriman jawaban ke server."
    >
      {label}
    </span>
  );
}

export default function SubtestRunner({
  subtest,
  questions,
  examples,
  existingAnswers,
}: {
  subtest: { code: string; name: string; description: string; instructions?: string; durationSec: number };
  questions: Question[];
  examples: ExampleQuestion[];
  existingAnswers: Record<string, unknown>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(() => {
    const init: Record<string, string | string[]> = {};
    for (const q of questions) {
      const v = existingAnswers[q.id];
      if (Array.isArray(v)) init[q.id] = v.map(String);
      else if (v != null) init[q.id] = String(v);
    }
    return init;
  });

  // Show intro screen (instructions + example questions) until student clicks
  // "Mulai". Pre-hydration we render the intro; once the client has read
  // localStorage we know whether to skip straight back to the timer view.
  const startedFromStorage = useSyncExternalStore(
    () => () => {},
    () => {
      const wasStarted =
        window.localStorage.getItem(STARTED_KEY(subtest.code)) === "1";
      const hasAnswers = Object.keys(existingAnswers).length > 0;
      return wasStarted || hasAnswers ? "1" : "0";
    },
    () => "0",
  );
  const hydrated = typeof window !== "undefined";
  const [startedManual, setStartedManual] = useState(false);
  const started = startedManual || startedFromStorage === "1";

  const [idx, setIdx] = useState(() => {
    const firstUnanswered = questions.findIndex((q) => !existingAnswers[q.id]);
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });

  // Timer: starts only after student clicks "Mulai".
  const [tick, setTick] = useState<{ startedAt: number; now: number } | null>(null);

  useEffect(() => {
    if (!started || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY(subtest.code));
    let s: number;
    if (saved) {
      s = parseInt(saved);
    } else {
      s = Date.now();
      window.localStorage.setItem(STORAGE_KEY(subtest.code), String(s));
    }
    const update = () => setTick({ startedAt: s, now: Date.now() });
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [started, subtest.code]);

  const elapsed = tick ? Math.floor((tick.now - tick.startedAt) / 1000) : 0;
  const remaining = subtest.durationSec - elapsed;
  const timeUp = tick != null && remaining <= 0;

  const q = questions[idx];
  const opts: OptionItem[] = useMemo(() => {
    const raw = q?.options as unknown;
    if (Array.isArray(raw)) return raw as OptionItem[];
    return [];
  }, [q]);
  // 3D: gambar per Sisi disimpan di options.partImages (array of url).
  const partImages: string[] = useMemo(() => {
    const raw = q?.options as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const obj = raw as { partImages?: unknown };
      if (Array.isArray(obj.partImages)) {
        return obj.partImages.map((v) => (v ? String(v) : ""));
      }
    }
    return [];
  }, [q]);
  // SISTEMATIS: 1 soal = 12 isian TEXT (parts=12). Tampilkan dalam grid.
  const isSistematisGrid = subtest.code === "BAKAT_7_SISTEMATISASI";

  const sync = useAnswerSync();

  // Anti-cheat: only active once the student has clicked "Mulai" so the
  // intro/example page doesn't trigger violations (e.g. switching tabs to
  // confirm what time it is is fine before starting).
  const ac = useAntiCheat({ active: started, subtestCode: subtest.code });

  // Banner toggle: dismissable warning shown after every violation.
  const [ackedAt, setAckedAt] = useState(0);
  useEffect(() => {
    if (ac.state.lastAt > ackedAt) setAckedAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ac.state.lastAt]);

  // Persist answers locally + push to server via the resilient queue.
  const save = (qid: string, sel: string | string[]) => {
    setAnswers((s) => ({ ...s, [qid]: sel }));
    sync.queueAnswer(qid, sel);
  };

  // Auto-finish the whole test once the student crosses the cheat threshold.
  const [forceFinishing, setForceFinishing] = useState(false);
  useEffect(() => {
    if (!ac.state.flagged || forceFinishing) return;
    setForceFinishing(true);
    toast.error("Anda terdeteksi keluar/curang berkali-kali. Tes diselesaikan otomatis.");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY(subtest.code));
      window.localStorage.removeItem(STARTED_KEY(subtest.code));
    }
    (async () => {
      try {
        // Flush any pending answers first.
        await sync.flush();
      } catch {
        // ignore; finish still runs.
      }
      try {
        await fetch("/api/student/test/finish", { method: "POST" });
      } catch {
        // best-effort
      }
      sync.clearAll();
      router.push("/test/done?forced=1");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ac.state.flagged]);

  const handleSelectSingle = (key: string) => {
    if (!q) return;
    save(q.id, key);
    if (q.parts <= 1) setTimeout(() => goNext(), 80);
  };

  const handleSelectPart = (partIdx: number, key: string) => {
    if (!q) return;
    const cur = (answers[q.id] as string[]) || Array(q.parts).fill("");
    const next = cur.slice();
    while (next.length < q.parts) next.push("");
    next[partIdx] = key;
    save(q.id, next);
  };

  // Local buffer for in-progress text typing per question; commits to server
  // on blur or after a 500ms debounce.
  const [typingBuf, setTypingBuf] = useState<Record<string, string | string[]>>({});

  const handleTypeSingle = (val: string) => {
    if (!q) return;
    setTypingBuf((b) => ({ ...b, [q.id]: val }));
    setAnswers((s) => ({ ...s, [q.id]: val }));
  };

  const handleTypePart = (partIdx: number, val: string) => {
    if (!q) return;
    const cur =
      (typingBuf[q.id] as string[]) ||
      ((answers[q.id] as string[]) || []).slice();
    while (cur.length < q.parts) cur.push("");
    cur[partIdx] = val;
    setTypingBuf((b) => ({ ...b, [q.id]: cur.slice() }));
    setAnswers((s) => ({ ...s, [q.id]: cur.slice() }));
  };

  const commitText = () => {
    if (!q) return;
    const v = typingBuf[q.id];
    if (v == null) return;
    save(q.id, v);
    setTypingBuf((b) => {
      const { [q.id]: _ignored, ...rest } = b;
      void _ignored;
      return rest;
    });
  };

  // Auto-commit text answers 600ms after last keystroke for the current question
  useEffect(() => {
    if (!q) return;
    if (typingBuf[q.id] == null) return;
    const id = setTimeout(() => commitText(), 600);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingBuf, q?.id]);

  const goNext = () => setIdx((i) => Math.min(i + 1, questions.length - 1));
  const goPrev = () => setIdx((i) => Math.max(i - 1, 0));
  const finishSub = async () => {
    // Make sure typing buffer + queued answers are flushed before leaving.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY(subtest.code));
      window.localStorage.removeItem(STARTED_KEY(subtest.code));
    }
    try {
      await sync.flush();
    } catch {
      // ignore — retries will continue in background on next page
    }
    toast.success("Subtes selesai. Kembali ke daftar.");
    router.push("/test");
  };

  useEffect(() => {
    if (timeUp) {
      toast("Waktu habis untuk subtes ini.");
      finishSub();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const handleStart = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STARTED_KEY(subtest.code), "1");
    }
    setStartedManual(true);
    // Enter fullscreen immediately while we still have the user gesture.
    ac.requestFullscreen();
  };

  if (!q) return null;

  // ── Intro screen: instructions + example questions, before timer ─────
  if (hydrated && !started) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b-4 border-black bg-yellow-300 sticky top-0 z-20">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-black uppercase opacity-70">SUBTES</div>
              <div className="text-xl font-black uppercase">{subtest.name}</div>
            </div>
            <span className="brut-tag" style={{ background: "#fff" }}>
              SEBELUM MULAI
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full space-y-6">
          <div className="brut-card" style={{ background: "#facc15" }}>
            <h2 className="text-2xl font-black uppercase mb-2">Petunjuk Pengerjaan</h2>
            <p className="text-sm font-bold uppercase opacity-80 mb-3">{subtest.description}</p>
            {subtest.instructions && subtest.instructions.trim() ? (
              <p className="font-semibold whitespace-pre-wrap">{subtest.instructions}</p>
            ) : (
              <p className="font-semibold opacity-80">
                Belum ada instruksi khusus. Pastikan Anda membaca soal dengan teliti dan menjawab sesuai
                pilihan yang paling tepat. Setiap subtes memiliki batas waktu—gunakan dengan bijak.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-sm">
              <div className="border-2 border-black p-2 bg-white">
                <div className="text-xs font-black uppercase opacity-70">Jumlah Soal</div>
                <div className="text-xl font-black">{questions.length}</div>
              </div>
              <div className="border-2 border-black p-2 bg-white">
                <div className="text-xs font-black uppercase opacity-70">Durasi</div>
                <div className="text-xl font-black">{Math.round(subtest.durationSec / 60)} menit</div>
              </div>
              <div className="border-2 border-black p-2 bg-white">
                <div className="text-xs font-black uppercase opacity-70">Contoh Soal</div>
                <div className="text-xl font-black">{examples.length}</div>
              </div>
            </div>
          </div>

          {examples.length > 0 && (
            <div className="brut-card" style={{ background: "#22d3ee" }}>
              <h2 className="text-2xl font-black uppercase mb-2">Contoh Soal</h2>
              <p className="text-sm font-bold mb-4">
                Pelajari contoh berikut. Soal contoh tidak dihitung sebagai nilai. Klik
                tombol <span className="bg-black text-white px-1">MULAI</span> di bawah saat siap.
              </p>
              <div className="space-y-4">
                {examples.map((ex) => (
                  <ExamplePreview key={ex.id} q={ex} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-center justify-between">
            <button
              onClick={() => router.push("/test")}
              className="brut-btn brut-btn-white"
              type="button"
            >
              ← KEMBALI
            </button>
            <button
              onClick={handleStart}
              className="brut-btn brut-btn-pink text-lg"
              type="button"
            >
              MULAI ▶
            </button>
          </div>
        </main>
      </div>
    );
  }

  const answeredCount = questions.filter((x) => answers[x.id] != null && (Array.isArray(answers[x.id]) ? (answers[x.id] as string[]).every((v) => v) : true)).length;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-black uppercase opacity-70">SUBTES</div>
            <div className="text-xl font-black uppercase">{subtest.name}</div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SyncBadge status={sync.status} pendingCount={sync.pendingCount} />
            {ac.state.count > 0 && (
              <span
                className="brut-tag font-mono text-xs"
                title="Jumlah deteksi keluar tes / full-screen / copy / paste."
                style={{ background: "#ff4d8d", color: "#fff" }}
              >
                CURANG {ac.state.count}/{ac.state.threshold}
              </span>
            )}
            <span className="brut-tag font-mono text-lg" style={{ background: "#fff" }}>
              SOAL {idx + 1}/{questions.length}
            </span>
            <span
              className="brut-tag font-mono text-lg"
              style={{ background: remaining < 60 ? "#ff4d8d" : "#000", color: "#fff" }}
            >
              {fmtTime(remaining)}
            </span>
          </div>
        </div>
        {ac.state.lastAt > 0 && ac.state.lastAt > ackedAt && (
          <div
            className="border-t-4 border-black"
            style={{ background: "#ff4d8d", color: "#fff" }}
          >
            <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-black uppercase text-sm">
                ⚠ Terdeteksi pelanggaran: {violationLabel(ac.state.lastType)}.
                Pelanggaran {ac.state.count}/{ac.state.threshold}.
                {ac.state.count >= ac.state.threshold
                  ? " Tes akan diselesaikan otomatis."
                  : " Jangan keluar dari halaman tes."}
              </div>
              <div className="flex gap-2">
                {!ac.fullscreenActive && (
                  <button
                    type="button"
                    onClick={ac.requestFullscreen}
                    className="brut-btn brut-btn-white"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                  >
                    KEMBALI FULL-SCREEN
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAckedAt(ac.state.lastAt)}
                  className="brut-btn"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <div className="brut-card mb-6" style={{ background: "#fff" }}>
          <div className="text-sm font-bold uppercase mb-2">{subtest.description}</div>
          <div className="text-xl font-bold whitespace-pre-wrap">{q.prompt}</div>
          {(q.imageUrl || q.imageUrl2) && (
            <div className="my-4 flex flex-wrap items-start gap-3">
              {q.imageUrl && (
                <div className="border-4 border-black p-1 bg-white">
                  <Image
                    src={q.imageUrl}
                    alt={`Soal ${q.questionNo}`}
                    width={600}
                    height={400}
                    className="max-w-full h-auto"
                    unoptimized
                  />
                </div>
              )}
              {q.imageUrl2 && (
                <div className="border-4 border-black p-1 bg-white">
                  <Image
                    src={q.imageUrl2}
                    alt={`Soal ${q.questionNo} (gambar 2)`}
                    width={600}
                    height={400}
                    className="max-w-full h-auto"
                    unoptimized
                  />
                </div>
              )}
            </div>
          )}

          {q.inputMode === "TEXT" ? (
            q.parts <= 1 ? (
              <div className="mt-4">
                <label className="text-sm font-black uppercase block mb-2">Jawaban Anda</label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={
                    (typingBuf[q.id] as string) ??
                    ((answers[q.id] as string) || "")
                  }
                  onChange={(e) => handleTypeSingle(e.target.value)}
                  onBlur={commitText}
                  placeholder="Ketik jawaban di sini"
                  className="w-full border-4 border-black px-4 py-3 text-xl font-bold bg-white"
                />
              </div>
            ) : isSistematisGrid ? (
              <div className="mt-4">
                <div className="text-sm font-black uppercase mb-2">
                  Isi 12 Jawaban (sesuai posisi 1-12 pada gambar)
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {Array.from({ length: q.parts }).map((_, partIdx) => {
                    const buf = typingBuf[q.id] as string[] | undefined;
                    const arr = (answers[q.id] as string[]) || [];
                    const value = (buf?.[partIdx] ?? arr[partIdx] ?? "");
                    return (
                      <div
                        key={partIdx}
                        className="border-4 border-black bg-white p-2"
                      >
                        <div className="text-xs font-black uppercase mb-1 text-center">
                          {partLabel(q, partIdx)}
                        </div>
                        <input
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          value={value}
                          onChange={(e) => handleTypePart(partIdx, e.target.value)}
                          onBlur={commitText}
                          placeholder="—"
                          className="w-full border-2 border-black px-2 py-1 text-center text-lg font-bold bg-yellow-100"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : partImages.length > 0 ? (
              <div className="space-y-3 mt-4">
                {Array.from({ length: q.parts }).map((_, partIdx) => {
                  const buf = typingBuf[q.id] as string[] | undefined;
                  const arr = (answers[q.id] as string[]) || [];
                  const value = (buf?.[partIdx] ?? arr[partIdx] ?? "");
                  const img = partImages[partIdx] || "";
                  return (
                    <div
                      key={partIdx}
                      className="brut-card"
                      style={{ background: "#facc15" }}
                    >
                      <label className="text-sm font-black uppercase mb-2 block">
                        Sisi {partLabel(q, partIdx)}
                      </label>
                      {img && (
                        <div className="mb-2 border-2 border-black p-1 bg-white inline-block">
                          <Image
                            src={img}
                            alt={`Pilihan Sisi ${partLabel(q, partIdx)}`}
                            width={600}
                            height={140}
                            className="max-w-full h-auto"
                            unoptimized
                          />
                        </div>
                      )}
                      <input
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        value={value}
                        onChange={(e) => handleTypePart(partIdx, e.target.value)}
                        onBlur={commitText}
                        placeholder={`Huruf jawaban Sisi ${partLabel(q, partIdx)} (A-E)`}
                        className="w-full border-4 border-black px-3 py-2 text-lg font-bold bg-white uppercase"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {Array.from({ length: q.parts }).map((_, partIdx) => {
                  const buf = typingBuf[q.id] as string[] | undefined;
                  const arr = (answers[q.id] as string[]) || [];
                  const value = (buf?.[partIdx] ?? arr[partIdx] ?? "");
                  return (
                    <div
                      key={partIdx}
                      className="brut-card"
                      style={{ background: "#facc15" }}
                    >
                      <label className="text-sm font-black uppercase mb-2 block">
                        Bagian {partLabel(q, partIdx)}
                      </label>
                      <input
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        value={value}
                        onChange={(e) => handleTypePart(partIdx, e.target.value)}
                        onBlur={commitText}
                        placeholder={`Jawaban bagian ${partLabel(q, partIdx)}`}
                        className="w-full border-4 border-black px-3 py-2 text-lg font-bold bg-white"
                      />
                    </div>
                  );
                })}
              </div>
            )
          ) : q.parts <= 1 ? (
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              {opts.map((o) => {
                const sel = answers[q.id] === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => handleSelectSingle(o.key)}
                    className={`brut-checkbox text-left ${sel ? "selected" : ""}`}
                  >
                    <span className="brut-tag" style={{ background: sel ? "#000" : "#facc15", color: sel ? "#fff" : "#000" }}>{o.key}</span>
                    <span className="font-semibold">{o.label}</span>
                    {o.imageUrl && (
                      <Image src={o.imageUrl} alt={o.label} width={80} height={80} className="ml-2" unoptimized />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 mt-4">
              {Array.from({ length: q.parts }).map((_, partIdx) => {
                const cur = (answers[q.id] as string[]) || [];
                const value = cur[partIdx] || "";
                return (
                  <div key={partIdx} className="brut-card" style={{ background: "#facc15" }}>
                    <div className="text-sm font-black uppercase mb-2">Bagian {partLabel(q, partIdx)}</div>
                    <div className="flex flex-wrap gap-2">
                      {opts.map((o) => {
                        const sel = value === o.key;
                        return (
                          <button
                            key={o.key}
                            type="button"
                            onClick={() => handleSelectPart(partIdx, o.key)}
                            className={`brut-checkbox ${sel ? "selected selected-cyan" : ""}`}
                          >
                            <span className="brut-tag" style={{ background: sel ? "#000" : "#fff", color: sel ? "#fff" : "#000" }}>{o.key}</span>
                            <span className="font-semibold">{o.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <button onClick={goPrev} disabled={idx === 0} className="brut-btn brut-btn-white">
            ← SEBELUMNYA
          </button>
          <span className="text-sm font-bold">Terjawab: {answeredCount}/{questions.length}</span>
          {idx < questions.length - 1 ? (
            <button onClick={goNext} className="brut-btn brut-btn-black">
              SELANJUTNYA →
            </button>
          ) : (
            <button onClick={finishSub} className="brut-btn brut-btn-pink">
              SIMPAN &amp; KEMBALI
            </button>
          )}
        </div>

        <div className="mt-8 brut-card" style={{ background: "#fff" }}>
          <div className="text-xs font-black uppercase mb-2">Loncat ke Soal</div>
          <div className="flex flex-wrap gap-2">
            {questions.map((qq, qi) => {
              const ans = answers[qq.id];
              const isAnswered = ans != null && (Array.isArray(ans) ? ans.every((v) => v) : !!ans);
              const active = qi === idx;
              return (
                <button
                  key={qq.id}
                  onClick={() => setIdx(qi)}
                  className="brut-tag brut-tap"
                  style={{
                    background: active ? "#000" : isAnswered ? "#a3e635" : "#fff",
                    color: active ? "#fff" : "#000",
                    minWidth: 36,
                    textAlign: "center",
                  }}
                >
                  {qi + 1}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function ExamplePreview({ q }: { q: ExampleQuestion }) {
  const opts = (Array.isArray(q.options) ? (q.options as OptionItem[]) : []).filter(
    (o) => o && typeof o === "object",
  );
  const partImages: string[] = (() => {
    const raw = q.options as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const obj = raw as { partImages?: unknown };
      if (Array.isArray(obj.partImages)) {
        return obj.partImages.map((v) => (v ? String(v) : ""));
      }
    }
    return [];
  })();
  const correctSet = correctSetFor(q);
  const correctTexts = correctTextFor(q);
  const isText = q.inputMode === "TEXT";

  return (
    <div className="border-2 border-black p-3 bg-white">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
          CONTOH {q.questionNo}
        </span>
        {isText ? (
          <span className="brut-tag" style={{ background: "#a3e635" }}>
            JAWABAN ISIAN
          </span>
        ) : null}
        {q.parts > 1 && (
          <span className="brut-tag" style={{ background: "#facc15" }}>
            {q.parts} bagian
          </span>
        )}
      </div>
      <p className="font-bold whitespace-pre-wrap mb-2">{q.prompt || "—"}</p>
      {q.imageUrl && (
        <div className="my-2 inline-block border-2 border-black p-1 bg-white">
          <Image
            src={q.imageUrl}
            alt={`Contoh ${q.questionNo}`}
            width={400}
            height={260}
            className="max-w-full h-auto"
            unoptimized
          />
        </div>
      )}
      {partImages.length > 0 && (
        <div className="my-2 space-y-2">
          {partImages.map((img, i) =>
            img ? (
              <div key={i} className="border-2 border-black p-2 bg-white">
                <div className="text-xs font-black uppercase mb-1">
                  Sisi {q.partLabels?.[i] ?? String(i + 1)}
                </div>
                <Image
                  src={img}
                  alt={`Pilihan Sisi ${i + 1}`}
                  width={500}
                  height={120}
                  className="max-w-full h-auto"
                  unoptimized
                />
              </div>
            ) : null,
          )}
        </div>
      )}
      {isText && (
        <div className="mt-2 border-2 border-black p-2" style={{ background: "#fff7ed" }}>
          <div className="text-xs font-black uppercase mb-1">Kunci Jawaban (Contoh)</div>
          {q.parts > 1 ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: q.parts }).map((_, i) => (
                <span
                  key={i}
                  className="brut-tag"
                  style={{ background: "#a3e635" }}
                >
                  Bagian {partLabel(q, i)} = {correctTexts[i] || "—"}
                </span>
              ))}
            </div>
          ) : (
            <span className="brut-tag" style={{ background: "#a3e635" }}>
              {correctTexts[0] || "—"}
            </span>
          )}
        </div>
      )}
      {!isText && opts.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {opts.map((o) => {
            const isCorrect = correctSet.has(String(o.key).toUpperCase());
            return (
              <li
                key={o.key}
                className="border-2 border-black p-2 flex gap-2 items-start"
                style={{ background: isCorrect ? "#a3e635" : "#fff" }}
              >
                <span className="font-black">{o.key}.</span>
                <div className="flex-1">
                  {o.imageUrl && (
                    <Image
                      src={o.imageUrl}
                      alt={`Opsi ${o.key}`}
                      width={120}
                      height={120}
                      className="border-2 border-black mb-1 max-h-32 w-auto"
                      unoptimized
                    />
                  )}
                  <p className="text-sm font-semibold whitespace-pre-wrap">
                    {o.label || (o.imageUrl ? "(gambar)" : "—")}
                  </p>
                  {isCorrect && (
                    <span className="brut-tag mt-1 inline-block" style={{ background: "#000", color: "#fff" }}>
                      KUNCI
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
