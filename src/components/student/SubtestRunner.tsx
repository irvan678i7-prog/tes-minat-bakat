"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";

type OptionItem = { key: string; label: string; imageUrl?: string };
type Question = {
  id: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  parts: number;
  options: unknown;
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

  const save = async (qid: string, sel: string | string[]) => {
    setAnswers((s) => ({ ...s, [qid]: sel }));
    try {
      await fetch("/api/student/test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: qid, selected: sel }),
      });
    } catch {
      // ignore network blip; will retry on next answer
    }
  };

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

  const goNext = () => setIdx((i) => Math.min(i + 1, questions.length - 1));
  const goPrev = () => setIdx((i) => Math.max(i - 1, 0));
  const finishSub = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY(subtest.code));
      window.localStorage.removeItem(STARTED_KEY(subtest.code));
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
          <div className="flex items-center gap-3">
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
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <div className="brut-card mb-6" style={{ background: "#fff" }}>
          <div className="text-sm font-bold uppercase mb-2">{subtest.description}</div>
          <div className="text-xl font-bold whitespace-pre-wrap">{q.prompt}</div>
          {q.imageUrl && (
            <div className="my-4 inline-block border-4 border-black p-1 bg-white">
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

          {q.parts <= 1 ? (
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
                    <div className="text-sm font-black uppercase mb-2">Bagian {partIdx + 1}</div>
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
  const correctSet = correctSetFor(q);

  return (
    <div className="border-2 border-black p-3 bg-white">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
          CONTOH {q.questionNo}
        </span>
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
      {opts.length > 0 && (
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
