"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

type Subtest = {
  id: string;
  code: string;
  testKind: "MINAT" | "BAKAT";
  name: string;
  description: string;
  instructions?: string;
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
  isExample?: boolean;
  inputMode?: "CHOICE" | "TEXT" | string;
};

export default function AdminQuestions() {
  const [subs, setSubs] = useState<Subtest[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [previewSub, setPreviewSub] = useState<Subtest | null>(null);
  const [editInstrSub, setEditInstrSub] = useState<Subtest | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch("/api/admin/subtests")
      .then((r) => r.json())
      .then((d) => setSubs(d.subtests || []));
  useEffect(() => {
    load();
  }, []);

  const updateField = (id: string, body: Record<string, unknown>) =>
    fetch("/api/admin/subtests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    })
      .then((r) => r.json())
      .then(() => load());

  const updateDuration = async (id: string, durationSec: number) => {
    await updateField(id, { durationSec });
    toast.success("Waktu diperbarui");
  };

  const saveInstructions = async (id: string, instructions: string) => {
    await updateField(id, { instructions });
    toast.success("Instruksi disimpan");
    setEditInstrSub(null);
  };

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
      <div className="brut-card" style={{ background: "#22d3ee" }}>
        <h3 className="text-xl font-black uppercase mb-2">Upload Gambar Soal</h3>
        <p className="text-sm font-bold mb-3">
          Upload gambar; URL otomatis tersalin ke clipboard. Tempel ke kolom{" "}
          <code>imageUrl</code> atau <code>option*Image</code> di template XLSX subtes.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input ref={imgRef} type="file" accept="image/*" className="brut-input flex-1" />
          <button onClick={uploadImage} disabled={imageBusy} className="brut-btn brut-btn-black">
            {imageBusy ? "MENGUPLOAD..." : "UPLOAD GAMBAR"}
          </button>
        </div>
      </div>

      <div className="brut-card" style={{ background: "#fef3c7" }}>
        <h3 className="text-xl font-black uppercase mb-1">Bank Soal per Subtes</h3>
        <p className="text-sm font-bold">
          Setiap subtes punya <span className="bg-black text-white px-1">TEMPLATE</span>,{" "}
          <span className="bg-black text-white px-1">UPLOAD</span>,{" "}
          <span className="bg-black text-white px-1">INSTRUKSI</span>, dan{" "}
          <span className="bg-black text-white px-1">PREVIEW</span> sendiri. Template setiap subtes
          memuat sheet <code>CONTOH SOAL</code> dan <code>SOAL</code> yang dipisah—soal contoh
          ditampilkan ke siswa sebelum timer mulai.
        </p>
      </div>

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
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/admin/subtests/${s.id}/template`}
                      className="brut-btn brut-btn-black text-xs"
                      title="Unduh template XLSX khusus subtes ini"
                    >
                      TEMPLATE
                    </a>
                    <SubtestUploader
                      subtestId={s.id}
                      onDone={() => {
                        toast.success("Soal subtes diperbarui");
                        load();
                      }}
                    />
                    <button
                      className="brut-btn brut-btn-white text-xs"
                      onClick={() => setEditInstrSub(s)}
                      title="Edit instruksi yang tampil ke siswa sebelum timer"
                    >
                      INSTRUKSI
                    </button>
                    <button
                      className="brut-btn brut-btn-pink text-xs"
                      disabled={s.questionCount === 0}
                      onClick={() => setPreviewSub(s)}
                      title={s.questionCount === 0 ? "Belum ada soal" : "Preview soal"}
                    >
                      PREVIEW
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewSub && <PreviewModal subtest={previewSub} onClose={() => setPreviewSub(null)} />}
      {editInstrSub && (
        <InstructionsModal
          subtest={editInstrSub}
          onClose={() => setEditInstrSub(null)}
          onSave={(text) => saveInstructions(editInstrSub.id, text)}
        />
      )}
    </div>
  );
}

function SubtestUploader({ subtestId, onDone }: { subtestId: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onChange = async () => {
    const f = inputRef.current?.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/admin/subtests/${subtestId}/upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal upload");
        return;
      }
      const soal = data.soal?.created ?? 0;
      const contoh = data.contoh?.created ?? 0;
      toast.success(`Sukses: ${soal} soal + ${contoh} contoh`);
      onDone();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <label className={`brut-btn text-xs cursor-pointer ${busy ? "opacity-60" : ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onChange}
        disabled={busy}
      />
      {busy ? "MEMUAT..." : "UPLOAD"}
    </label>
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

function InstructionsModal({
  subtest,
  onClose,
  onSave,
}: {
  subtest: Subtest;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(subtest.instructions || "");
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start md:items-center justify-center p-2 md:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="brut-card bg-white w-full max-w-2xl my-4"
        style={{ background: "#fff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <p className="text-xs font-black uppercase">{subtest.testKind} • {subtest.code}</p>
            <h3 className="text-2xl font-black uppercase">Instruksi: {subtest.name}</h3>
          </div>
          <button className="brut-btn brut-btn-black" onClick={onClose}>
            TUTUP
          </button>
        </div>
        <p className="text-sm font-bold mb-2">
          Tampil ke siswa sebelum timer mulai. Pakai untuk menjelaskan cara kerja subtes,
          contoh tipe soal, dan strategi pengerjaan.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={4000}
          className="brut-input w-full font-semibold"
          placeholder="Contoh: Pada subtes ini Anda akan diminta untuk… Pilih jawaban yang paling tepat. Setiap soal hanya boleh dijawab satu kali."
        />
        <div className="flex justify-between items-center mt-3">
          <span className="text-xs font-bold opacity-70">{text.length}/4000</span>
          <button className="brut-btn brut-btn-pink" onClick={() => onSave(text)}>
            SIMPAN INSTRUKSI
          </button>
        </div>
      </div>
    </div>
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
  const examples = (questions || []).filter((q) => q.isExample);
  const real = (questions || []).filter((q) => !q.isExample);

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
            {examples.length > 0 && (
              <div>
                <h4 className="text-lg font-black uppercase mb-2">Contoh Soal ({examples.length})</h4>
                <div className="space-y-3">
                  {examples.map((q) => (
                    <QuestionPreview key={q.id} q={q} />
                  ))}
                </div>
              </div>
            )}
            {real.length > 0 && (
              <div>
                <h4 className="text-lg font-black uppercase mb-2">Soal ({real.length})</h4>
                <div className="space-y-3">
                  {real.map((q) => (
                    <QuestionPreview key={q.id} q={q} />
                  ))}
                </div>
              </div>
            )}
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
  const isText = q.inputMode === "TEXT";
  const correctTexts: string[] = Array.isArray(q.correct)
    ? q.correct.map((x) => String(x))
    : q.correct != null && String(q.correct).trim() !== ""
      ? [String(q.correct)]
      : [];
  return (
    <div className="brut-card" style={{ background: q.isExample ? "#e0f2fe" : "#f5f5f5" }}>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="brut-tag" style={{ background: q.isExample ? "#000" : "#facc15", color: q.isExample ? "#fff" : "#000" }}>
          {q.isExample ? "CONTOH" : "NO"} {q.questionNo}
        </span>
        {isText && (
          <span className="brut-tag" style={{ background: "#a3e635" }}>
            ISIAN
          </span>
        )}
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
      {isText ? (
        <div className="border-2 border-black p-2" style={{ background: "#fff7ed" }}>
          <div className="text-xs font-black uppercase mb-1">Kunci Jawaban</div>
          {q.parts > 1 ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: q.parts }).map((_, i) => (
                <span
                  key={i}
                  className="brut-tag"
                  style={{ background: "#a3e635" }}
                >
                  Bagian {i + 1} = {correctTexts[i] || "—"}
                </span>
              ))}
            </div>
          ) : (
            <span className="brut-tag" style={{ background: "#a3e635" }}>
              {correctTexts[0] || "—"}
            </span>
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
