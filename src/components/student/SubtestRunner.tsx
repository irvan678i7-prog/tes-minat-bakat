"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

const STORAGE_KEY = (subtestCode: string) => `tmb-runner-${subtestCode}`;

function fmtTime(s: number): string {
  if (s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export default function SubtestRunner({
  subtest,
  questions,
  existingAnswers,
}: {
  subtest: { code: string; name: string; description: string; durationSec: number };
  questions: Question[];
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

  const [idx, setIdx] = useState(() => {
    const firstUnanswered = questions.findIndex((q) => !existingAnswers[q.id]);
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });

  // Timer: persist startedAt in localStorage so reload doesn't reset.
  const [tick, setTick] = useState<{ startedAt: number; now: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, [subtest.code]);

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

  if (!q) return null;
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
