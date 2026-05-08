"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";

type Subtest = {
  id: string;
  code: string;
  testKind: "MINAT" | "BAKAT";
  name: string;
  description: string;
  durationSec: number;
  questionCount: number;
};

type OptionItem = { key: string; label: string; imageUrl?: string };

type Question = {
  id: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  parts: number;
  options: OptionItem[] | unknown;
  correct: unknown;
  scoringTag: string | null;
};

export default function AdminQuestions() {
  const [subs, setSubs] = useState<Subtest[]>([]);
  const [pending, startTransition] = useTransition();
  const [imageBusy, setImageBusy] = useState(false);
  const [previewSub, setPreviewSub] = useState<Subtest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const load = () => fetch("/api/admin/subtests").then((r) => r.json()).then((d) => setSubs(d.subtests || []));
  useEffect(() => {
    load();
  }, []);

  const updateDuration = (id: string, durationSec: number) =>
    fetch("/api/admin/subtests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, durationSec }),
    })
      .then((r) => r.json())
      .then(() => {
        toast.success("Waktu diperbarui");
        load();
      });

  const upload = () =>
    startTransition(async () => {
      const f = fileRef.current?.files?.[0];
      if (!f) {
        toast.error("Pilih file XLSX");
        return;
      }
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/admin/questions/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal upload");
        return;
      }
      toast.success(`Sukses: ${data.summary.length} subtes diproses`);
      if (fileRef.current) fileRef.current.value = "";
      load();
    });

  const uploadImage = async () => {
    const f = imgRef.current?.files?.[0];
    if (!f) return toast.error("Pilih file gambar");
    setImageBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/admin/questions/image", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Gagal upload");
      navigator.clipboard?.writeText(data.url).catch(() => {});
      toast.success("URL disalin ke clipboard!");
    } finally {
      setImageBusy(false);
      if (imgRef.current) imgRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="brut-card" style={{ background: "#facc15" }}>
          <h3 className="text-xl font-black uppercase mb-2">Upload Soal (XLSX)</h3>
          <p className="text-sm font-bold mb-2">
            Template kini berisi <span className="bg-black text-white px-1">satu sheet per subtes</span>{" "}
            beserta kolom <code>optionAImage</code> dst. untuk gambar pilihan jawaban.
          </p>
          <p className="text-xs font-semibold mb-3">
            Format diganti per subtes (replace). Baris kosong diabaikan.
          </p>
          <div className="flex flex-col gap-2">
            <a href="/api/admin/questions/template" className="brut-btn brut-btn-black inline-block text-center">
              UNDUH TEMPLATE
            </a>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="brut-input w-full" />
            <button onClick={upload} disabled={pending} className="brut-btn">
              {pending ? "MEMUAT..." : "UPLOAD"}
            </button>
          </div>
        </div>

        <div className="brut-card" style={{ background: "#22d3ee" }}>
          <h3 className="text-xl font-black uppercase mb-2">Upload Gambar Soal</h3>
          <p className="text-sm font-bold mb-3">
            Upload gambar; URL otomatis tersalin ke clipboard. Pakai untuk kolom{" "}
            <code>imageUrl</code> atau <code>option*Image</code>.
          </p>
          <div className="flex flex-col gap-2">
            <input ref={imgRef} type="file" accept="image/*" className="brut-input w-full" />
            <button onClick={uploadImage} disabled={imageBusy} className="brut-btn brut-btn-black">
              {imageBusy ? "MENGUPLOAD..." : "UPLOAD GAMBAR"}
            </button>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-black uppercase mt-2">Daftar Subtes</h3>
      <div className="overflow-x-auto">
        <table className="brut-table">
          <thead>
            <tr>
              <th>Tes</th>
              <th>Kode</th>
              <th>Nama</th>
              <th>Soal</th>
              <th>Waktu (menit)</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>{s.testKind}</td>
                <td className="font-mono font-bold">{s.code}</td>
                <td>{s.name}</td>
                <td>
                  <span
                    className="brut-tag"
                    style={{ background: s.questionCount === 0 ? "#ff4d8d" : "#a3e635" }}
                  >
                    {s.questionCount}
                  </span>
                </td>
                <td>
                  <DurationEditor seconds={s.durationSec} onSave={(v) => updateDuration(s.id, v * 60)} />
                </td>
                <td>
                  <button
                    className="brut-btn brut-btn-black text-xs"
                    disabled={s.questionCount === 0}
                    onClick={() => setPreviewSub(s)}
                    title={s.questionCount === 0 ? "Belum ada soal" : "Preview soal"}
                  >
                    PREVIEW
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewSub && (
        <PreviewModal subtest={previewSub} onClose={() => setPreviewSub(null)} />
      )}
    </div>
  );
}

function DurationEditor({ seconds, onSave }: { seconds: number; onSave: (mins: number) => void }) {
  const [v, setV] = useState(Math.round(seconds / 60));
  const [editing, setEditing] = useState(false);
  return editing ? (
    <span className="flex gap-2">
      <input
        type="number"
        className="brut-input w-20"
        value={v}
        onChange={(e) => setV(parseInt(e.target.value || "1"))}
      />
      <button
        className="brut-btn brut-btn-black text-xs"
        onClick={() => {
          onSave(v);
          setEditing(false);
        }}
      >
        SIMPAN
      </button>
    </span>
  ) : (
    <button className="brut-tag brut-tap" onClick={() => setEditing(true)}>
      {Math.round(seconds / 60)} menit ✎
    </button>
  );
}

function PreviewModal({ subtest, onClose }: { subtest: Subtest; onClose: () => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/subtests/${subtest.id}/questions`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setQuestions(d.questions || []);
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [subtest.id]);

  const loading = questions === null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start md:items-center justify-center p-2 md:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="brut-card bg-white w-full max-w-4xl my-4"
        style={{ background: "#fff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <p className="text-xs font-black uppercase">{subtest.testKind} • {subtest.code}</p>
            <h3 className="text-2xl font-black uppercase">{subtest.name}</h3>
          </div>
          <button className="brut-btn brut-btn-black" onClick={onClose}>
            TUTUP
          </button>
        </div>

        {loading && <p className="font-bold">Memuat soal...</p>}
        {!loading && questions && questions.length === 0 && (
          <p className="font-bold text-sm">Belum ada soal pada subtes ini.</p>
        )}
        {!loading && questions && questions.length > 0 && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {questions.map((q) => (
              <QuestionPreview key={q.id} q={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionPreview({ q }: { q: Question }) {
  const opts = (Array.isArray(q.options) ? (q.options as OptionItem[]) : []).filter(
    (o) => o && typeof o === "object",
  );
  const correctSet = new Set<string>(
    Array.isArray(q.correct)
      ? q.correct.map((x) => String(x).toUpperCase())
      : q.correct != null
        ? [String(q.correct).toUpperCase()]
        : [],
  );
  return (
    <div className="brut-card" style={{ background: "#f5f5f5" }}>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="brut-tag" style={{ background: "#facc15" }}>
          NO {q.questionNo}
        </span>
        {q.parts > 1 && (
          <span className="brut-tag" style={{ background: "#22d3ee" }}>
            {q.parts} bagian
          </span>
        )}
        {q.scoringTag && (
          <span className="brut-tag" style={{ background: "#a3e635" }}>
            {q.scoringTag}
          </span>
        )}
      </div>
      <p className="font-bold whitespace-pre-wrap mb-2">{q.prompt || "—"}</p>
      {q.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={q.imageUrl}
          alt={`Soal ${q.questionNo}`}
          className="border-2 border-black mb-2 max-h-60"
        />
      )}
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.imageUrl}
                    alt={`Opsi ${o.key}`}
                    className="border-2 border-black max-h-32 mb-1"
                  />
                )}
                <p className="text-sm font-semibold whitespace-pre-wrap">{o.label || (o.imageUrl ? "(gambar)" : "—")}</p>
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
    </div>
  );
}
