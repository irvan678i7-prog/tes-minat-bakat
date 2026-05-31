"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type SaveStatus = "saved" | "saving" | "error";

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
  remainingSecInitial,
  lockedInitial,
}: {
  subtest: { code: string; name: string; description: string; durationSec: number };
  questions: Question[];
  existingAnswers: Record<string, unknown>;
  remainingSecInitial: number;
  lockedInitial: boolean;
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

  const [locked, setLocked] = useState(lockedInitial);
  const [remaining, setRemaining] = useState(lockedInitial ? 0 : remainingSecInitial);
  const [saveState, setSaveState] = useState<Record<string, SaveStatus>>({});

  const deadlineRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  // Map of questionId -> latest value that still needs confirming with server.
  const pendingRef = useRef<Map<string, string | string[]>>(new Map());

  // ── Reliable answer saving ────────────────────────────────────────────────
  const save = useCallback(
    async (qid: string, sel: string | string[]) => {
      pendingRef.current.set(qid, sel);
      setSaveState((s) => ({ ...s, [qid]: "saving" }));
      try {
        const res = await fetch("/api/student/test/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: qid, selected: sel }),
        });
        if (res.ok) {
          // Only clear if this is still the latest value we tried to save.
          if (pendingRef.current.get(qid) === sel) pendingRef.current.delete(qid);
          setSaveState((s) => ({ ...s, [qid]: "saved" }));
        } else if (res.status === 409) {
          // Subtest is locked server-side (time up). Stop accepting answers.
          pendingRef.current.delete(qid);
          setLocked(true);
        } else {
          setSaveState((s) => ({ ...s, [qid]: "error" }));
        }
      } catch {
        setSaveState((s) => ({ ...s, [qid]: "error" }));
      }
    },
    [],
  );

  const flushPending = useCallback(async () => {
    const entries = Array.from(pendingRef.current.entries());
    await Promise.all(entries.map(([qid, sel]) => save(qid, sel)));
  }, [save]);

  // Periodically retry any answers that failed to save.
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingRef.current.size > 0) void flushPending();
    }, 5000);
    return () => clearInterval(id);
  }, [flushPending]);

  // Best-effort flush when the tab is hidden/closed.
  useEffect(() => {
    const handler = () => {
      if (pendingRef.current.size > 0) void flushPending();
    };
    window.addEventListener("visibilitychange", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("visibilitychange", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, [flushPending]);

  // ── Subtest completion / navigation ───────────────────────────────────────
  const completeAndLeave = useCallback(
    async (auto: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      await flushPending();
      try {
        await fetch("/api/student/test/subtest/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subtestCode: subtest.code }),
        });
      } catch {
        // ignore; subtest also auto-locks server-side when time elapses.
      }
      toast(auto ? "Waktu habis untuk subtes ini." : "Subtes selesai. Kembali ke daftar.");
      router.push("/test");
    },
    [flushPending, router, subtest.code],
  );

  // Leave without finishing — the timer keeps running on the server.
  const leaveWithoutFinishing = useCallback(async () => {
    await flushPending();
    router.push("/test");
  }, [flushPending, router]);

  // ── Server-authoritative timer ────────────────────────────────────────────
  // Start (or resume) the timer via the API on mount. Doing this client-side
  // (not during server render) keeps link prefetch from starting the clock.
  useEffect(() => {
    if (lockedInitial) {
      setLocked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/student/test/subtest/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subtestCode: subtest.code }),
        });
        if (!res.ok) throw new Error("start failed");
        const d = (await res.json()) as { remainingSec: number; completed: boolean };
        if (cancelled) return;
        if (d.completed) {
          setLocked(true);
          setRemaining(0);
          return;
        }
        deadlineRef.current = Date.now() + d.remainingSec * 1000;
        setRemaining(d.remainingSec);
      } catch {
        if (cancelled) return;
        // Fall back to the value rendered by the server page.
        deadlineRef.current = Date.now() + remainingSecInitial * 1000;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick down once per second based on the locally-anchored deadline.
  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => {
      if (deadlineRef.current == null) return;
      const rem = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(rem);
    }, 1000);
    return () => clearInterval(id);
  }, [locked]);

  // Auto-complete when the timer reaches zero.
  useEffect(() => {
    if (!locked && deadlineRef.current != null && remaining <= 0) {
      void completeAndLeave(true);
    }
  }, [remaining, locked, completeAndLeave]);

  // ── Question rendering ────────────────────────────────────────────────────
  const q = questions[idx];
  const opts: OptionItem[] = useMemo(() => {
    const raw = q?.options as unknown;
    if (Array.isArray(raw)) return raw as OptionItem[];
    return [];
  }, [q]);

  const handleSelectSingle = (key: string) => {
    if (!q || locked) return;
    void save(q.id, key);
    if (q.parts <= 1) setTimeout(() => goNext(), 80);
  };

  const handleSelectPart = (partIdx: number, key: string) => {
    if (!q || locked) return;
    const cur = (answers[q.id] as string[]) || Array(q.parts).fill("");
    const next = cur.slice();
    while (next.length < q.parts) next.push("");
    next[partIdx] = key;
    void save(q.id, next);
  };

  const goNext = () => setIdx((i) => Math.min(i + 1, questions.length - 1));
  const goPrev = () => setIdx((i) => Math.max(i - 1, 0));

  const handleFinishSubtest = () => {
    if (!confirm("Selesaikan subtes ini? Subtes akan terkunci dan tidak bisa diubah lagi.")) return;
    void completeAndLeave(false);
  };

  if (!q) return null;

  const answeredCount = questions.filter((x) => {
    const a = answers[x.id];
    return a != null && (Array.isArray(a) ? a.every((v) => v) : true);
  }).length;

  const unsavedCount = Object.values(saveState).filter((s) => s === "error").length;
  const isLast = idx >= questions.length - 1;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-black uppercase opacity-70">SUBTES</div>
            <div className="text-xl font-black uppercase">{subtest.name}</div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="brut-tag font-mono text-lg" style={{ background: "#fff" }}>
              SOAL {idx + 1}/{questions.length}
            </span>
            <span
              className="brut-tag font-mono text-lg"
              style={{
                background: locked ? "#a3e635" : remaining < 60 ? "#ff4d8d" : "#000",
                color: locked ? "#000" : "#fff",
              }}
            >
              {locked ? "SELESAI" : fmtTime(remaining)}
            </span>
            <button
              type="button"
              onClick={locked ? () => router.push("/test") : leaveWithoutFinishing}
              className="brut-btn brut-btn-white text-sm"
              title={locked ? "Kembali ke daftar" : "Kembali ke daftar (waktu subtes tetap berjalan)"}
            >
              KELUAR
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 pb-2 -mt-1 text-xs font-bold">
          {locked ? (
            <span className="brut-tag" style={{ background: "#a3e635" }}>
              MODE TINJAU — subtes terkunci, jawaban tidak dapat diubah
            </span>
          ) : unsavedCount > 0 ? (
            <span className="brut-tag" style={{ background: "#ff4d8d", color: "#fff" }}>
              ⚠ {unsavedCount} jawaban belum tersimpan — mencoba lagi…
            </span>
          ) : (
            <span className="opacity-60">✓ Jawaban tersimpan otomatis</span>
          )}
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
                    disabled={locked}
                    onClick={() => handleSelectSingle(o.key)}
                    className={`brut-checkbox text-left ${sel ? "selected" : ""} ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
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
                            disabled={locked}
                            onClick={() => handleSelectPart(partIdx, o.key)}
                            className={`brut-checkbox ${sel ? "selected selected-cyan" : ""} ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
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
          {!isLast ? (
            <button onClick={goNext} className="brut-btn brut-btn-black">
              SELANJUTNYA →
            </button>
          ) : locked ? (
            <button onClick={() => router.push("/test")} className="brut-btn brut-btn-black">
              KEMBALI KE DAFTAR
            </button>
          ) : (
            <button onClick={handleFinishSubtest} className="brut-btn brut-btn-pink">
              SELESAIKAN SUBTES
            </button>
          )}
        </div>

        {!locked && (
          <div className="mt-4 text-center">
            <button onClick={handleFinishSubtest} className="brut-btn brut-btn-pink">
              SELESAIKAN SUBTES SEKARANG
            </button>
            <p className="text-xs font-bold mt-2 opacity-70">
              Tekan jika sudah selesai mengerjakan subtes ini. Subtes akan terkunci.
            </p>
          </div>
        )}

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
