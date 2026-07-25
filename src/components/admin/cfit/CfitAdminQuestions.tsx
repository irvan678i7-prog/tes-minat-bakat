"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import CfitBulkImageUploader from "./CfitBulkImageUploader";

// Bank Soal IQ (CFIT) — tampilan mengikuti Bank Soal minat-bakat:
// tabel subtes dengan TEMPLATE (XLSX) / UPLOAD / INSTRUKSI / WAKTU / PREVIEW
// (+ edit & hapus per soal, termasuk soal contoh). Soal & tiap pilihan
// jawaban CFIT berupa GAMBAR.

type Subtest = {
  id: string;
  code: string;
  form: "FORM_3A" | "FORM_3B";
  name: string;
  description: string;
  instructions: string;
  durationSec: number;
  questionCount: number;
  exampleCount: number;
};

type OptionItem = { key: string; label: string; imageUrl: string };

type Question = {
  id: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  options: unknown;
  correct: unknown;
  isExample: boolean;
};

function normalizeOptions(raw: unknown): OptionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: OptionItem[] = [];
  for (const o of raw) {
    if (typeof o === "string") {
      if (o.trim()) out.push({ key: o.trim(), label: "", imageUrl: "" });
    } else if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      const key = String(obj.key ?? "").trim();
      if (key) {
        out.push({
          key,
          label: obj.label ? String(obj.label) : "",
          imageUrl: obj.imageUrl ? String(obj.imageUrl) : "",
        });
      }
    }
  }
  return out;
}

function correctList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).toLowerCase());
  if (raw === null || raw === undefined || String(raw).trim() === "") return [];
  return [String(raw).toLowerCase()];
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} mnt` : `${m} mnt ${s} dtk`;
}

export default function CfitAdminQuestions() {
  const [subs, setSubs] = useState<Subtest[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageBusy, setImageBusy] = useState(false);
  const [previewSub, setPreviewSub] = useState<Subtest | null>(null);
  const [editInstrSub, setEditInstrSub] = useState<Subtest | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch("/api/admin/cfit/subtests", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSubs(d.subtests || []);
        setLoading(false);
      });
  useEffect(() => {
    void load();
  }, []);

  const patchSubtest = (code: string, body: Record<string, unknown>) =>
    fetch("/api/admin/cfit/subtests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, ...body }),
    })
      .then((r) => r.json())
      .then(() => load());

  const updateDuration = async (code: string, durationSec: number) => {
    await patchSubtest(code, { durationSec });
    toast.success("Waktu diperbarui");
  };

  const saveInstructions = async (code: string, instructions: string) => {
    await patchSubtest(code, { instructions });
    toast.success("Instruksi disimpan");
    setEditInstrSub(null);
  };

  // Reuse endpoint upload gambar minat-bakat (upload ke Supabase Storage,
  // URL otomatis tersalin ke clipboard).
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

  if (loading) return <div className="brut-card font-black uppercase brut-blink">Memuat...</div>;

  return (
    <div className="space-y-6">
      <div className="brut-card" style={{ background: "#a3e635" }}>
        <h3 className="text-xl font-black uppercase mb-2">⚡ Upload Gambar Massal (Cara Cepat)</h3>
        <p className="text-sm font-bold mb-2">
          Urutan kerja: <span className="bg-black text-white px-1">1</span> UPLOAD XLSX subtes
          (nomor soal & kunci — kolom gambar boleh kosong) →{" "}
          <span className="bg-black text-white px-1">2</span> beri nama file gambar sesuai pola →{" "}
          <span className="bg-black text-white px-1">3</span> pilih SEMUA gambar sekaligus di sini.
          Gambar otomatis terpasang ke soal & pilihan berdasarkan nama file — tanpa tempel URL satu
          per satu.
        </p>
        <ul className="text-xs font-bold mb-3 space-y-1">
          <li>
            <code>1.png</code> → gambar soal nomor 1
          </li>
          <li>
            <code>1a.png</code> … <code>1f.png</code> → gambar pilihan a–f soal nomor 1 (boleh juga{" "}
            <code>1-a.png</code> / <code>1_a.png</code>)
          </li>
          <li>
            <code>c1.png</code> → gambar soal CONTOH nomor 1; <code>c1a.png</code> → pilihan a
            contoh 1 (boleh <code>contoh1.png</code>)
          </li>
        </ul>
        <CfitBulkImageUploader
          subtests={subs.map((s) => ({ code: s.code, form: s.form, name: s.name }))}
          onDone={() => void load()}
        />
      </div>

      <div className="brut-card" style={{ background: "#22d3ee" }}>
        <h3 className="text-xl font-black uppercase mb-2">Upload Gambar Satuan</h3>
        <p className="text-sm font-bold mb-3">
          Untuk koreksi 1–2 gambar: upload di sini, URL otomatis tersalin ke clipboard. Tempel ke
          kolom <code>imageUrl</code> (gambar soal) atau <code>option*Image</code> (gambar pilihan)
          di template XLSX subtes, atau langsung di editor soal (PREVIEW → EDIT).
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
          <span className="bg-black text-white px-1">PREVIEW</span> sendiri — sama seperti bank
          soal minat-bakat. Template memuat sheet <code>CONTOH SOAL</code> dan <code>SOAL</code>{" "}
          yang dipisah; soal contoh tampil ke peserta sebelum timer mulai dan tidak dinilai.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="brut-table">
          <thead>
            <tr>
              <th>Bentuk</th>
              <th>Kode</th>
              <th>Nama</th>
              <th>Soal</th>
              <th>Contoh</th>
              <th>Waktu</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td className="font-black">{s.form === "FORM_3A" ? "3A" : "3B"}</td>
                <td className="font-mono font-bold">{s.code}</td>
                <td>{s.name}</td>
                <td>
                  <span className="brut-tag" style={{ background: s.questionCount === 0 ? "#ff4d8d" : "#a3e635" }}>
                    {s.questionCount}
                  </span>
                </td>
                <td>
                  <span className="brut-tag" style={{ background: s.exampleCount === 0 ? "#fef9c3" : "#a3e635" }}>
                    {s.exampleCount}
                  </span>
                </td>
                <td>
                  <DurationEditor seconds={s.durationSec} onSave={(v) => void updateDuration(s.code, v)} />
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/admin/cfit/subtests/${encodeURIComponent(s.code)}/template`}
                      className="brut-btn brut-btn-black text-xs"
                      title="Unduh template XLSX khusus subtes ini"
                    >
                      TEMPLATE
                    </a>
                    <SubtestUploader
                      code={s.code}
                      onDone={() => {
                        toast.success("Soal subtes diperbarui");
                        void load();
                      }}
                    />
                    <button
                      className="brut-btn brut-btn-white text-xs"
                      onClick={() => setEditInstrSub(s)}
                      title="Edit instruksi yang tampil ke peserta sebelum timer"
                    >
                      INSTRUKSI
                    </button>
                    <button
                      className="brut-btn brut-btn-pink text-xs"
                      disabled={s.questionCount === 0 && s.exampleCount === 0}
                      onClick={() => setPreviewSub(s)}
                      title={s.questionCount === 0 && s.exampleCount === 0 ? "Belum ada soal" : "Preview & edit soal"}
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

      {previewSub && <PreviewModal subtest={previewSub} onClose={() => setPreviewSub(null)} onChanged={() => void load()} />}
      {editInstrSub && (
        <InstructionsModal
          subtest={editInstrSub}
          onClose={() => setEditInstrSub(null)}
          onSave={(text) => void saveInstructions(editInstrSub.code, text)}
        />
      )}
    </div>
  );
}

function SubtestUploader({ code, onDone }: { code: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onChange = async () => {
    const f = inputRef.current?.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/admin/cfit/subtests/${encodeURIComponent(code)}/upload`, {
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

function DurationEditor({ seconds, onSave }: { seconds: number; onSave: (sec: number) => void }) {
  const [v, setV] = useState(seconds);
  const [editing, setEditing] = useState(false);
  return editing ? (
    <span className="flex gap-2 items-center">
      <input
        type="number"
        className="brut-input w-24"
        value={v}
        min={30}
        max={3600}
        onChange={(e) => setV(parseInt(e.target.value || "60", 10) || 60)}
        title="Durasi dalam detik"
      />
      <span className="text-xs font-bold">dtk</span>
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
    <button className="brut-tag brut-tap" onClick={() => setEditing(true)} title="Klik untuk ubah (dalam detik)">
      {fmtDur(seconds)} ✎
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
            <p className="text-xs font-black uppercase">CFIT • {subtest.code}</p>
            <h3 className="text-2xl font-black uppercase">Instruksi: {subtest.name}</h3>
          </div>
          <button className="brut-btn brut-btn-black" onClick={onClose}>
            TUTUP
          </button>
        </div>
        <p className="text-sm font-bold mb-2">
          Tampil ke peserta sebelum timer mulai. Jelaskan cara kerja subtes dan contoh tipe soal
          (mis. “Pilih 1 gambar yang melanjutkan deret di sebelah kiri”).
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={4000}
          className="brut-input w-full font-semibold"
          placeholder="Contoh: Perhatikan deret gambar di sebelah kiri. Pilih SATU gambar dari pilihan a–f yang paling tepat melanjutkan deret tersebut."
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

function PreviewModal({
  subtest,
  onClose,
  onChanged,
}: {
  subtest: Subtest;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = () => {
    fetch(`/api/admin/cfit/questions?subtest=${encodeURIComponent(subtest.code)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setQuestions(d.subtest?.questions || []))
      .catch(() => setQuestions([]));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtest.code]);

  const handleDelete = async (q: Question) => {
    if (!window.confirm(`Hapus soal ${q.isExample ? "contoh " : ""}#${q.questionNo}?\nAksi tidak bisa dibatalkan.`)) return;
    const res = await fetch(`/api/admin/cfit/questions?id=${encodeURIComponent(q.id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Gagal menghapus soal");
      return;
    }
    toast.success("Soal dihapus");
    if (editingId === q.id) setEditingId(null);
    reload();
    onChanged();
  };

  const loading = questions === null;
  const examples = (questions || []).filter((q) => q.isExample);
  const real = (questions || []).filter((q) => !q.isExample);

  const renderItem = (q: Question) =>
    editingId === q.id ? (
      <QuestionEditor
        key={q.id}
        q={q}
        subtestCode={subtest.code}
        onCancel={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          reload();
          onChanged();
        }}
      />
    ) : (
      <QuestionPreview key={q.id} q={q} onEdit={() => setEditingId(q.id)} onDelete={() => void handleDelete(q)} />
    );

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
            <p className="text-xs font-black uppercase">CFIT • {subtest.code}</p>
            <h3 className="text-2xl font-black uppercase">{subtest.name}</h3>
          </div>
          <button className="brut-btn brut-btn-black" onClick={onClose}>
            TUTUP
          </button>
        </div>

        {loading && <p className="font-bold">Memuat soal...</p>}
        {!loading && questions && questions.length === 0 && (
          <p className="font-bold text-sm">Belum ada soal pada subtes ini. Unduh TEMPLATE lalu UPLOAD.</p>
        )}
        {!loading && questions && questions.length > 0 && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {examples.length > 0 && (
              <div>
                <h4 className="text-lg font-black uppercase mb-2">Contoh Soal ({examples.length})</h4>
                <div className="space-y-3">{examples.map(renderItem)}</div>
              </div>
            )}
            {real.length > 0 && (
              <div>
                <h4 className="text-lg font-black uppercase mb-2">Soal ({real.length})</h4>
                <div className="space-y-3">{real.map(renderItem)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionPreview({
  q,
  onEdit,
  onDelete,
}: {
  q: Question;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const opts = normalizeOptions(q.options);
  const correctSet = new Set(correctList(q.correct));
  return (
    <div className="brut-card" style={{ background: q.isExample ? "#e0f2fe" : "#f5f5f5" }}>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span
          className="brut-tag"
          style={{ background: q.isExample ? "#000" : "#facc15", color: q.isExample ? "#fff" : "#000" }}
        >
          {q.isExample ? "CONTOH" : "NO"} {q.questionNo}
        </span>
        {correctSet.size > 1 && (
          <span className="brut-tag" style={{ background: "#ff4d8d" }}>
            {correctSet.size} KUNCI
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onEdit} className="brut-btn text-xs" title="Edit soal & jawaban">
            EDIT
          </button>
          <button type="button" onClick={onDelete} className="brut-btn brut-btn-pink text-xs" title="Hapus soal">
            HAPUS
          </button>
        </div>
      </div>
      {q.prompt ? <p className="font-bold whitespace-pre-wrap mb-2">{q.prompt}</p> : null}
      {q.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={q.imageUrl} alt={`Soal ${q.questionNo}`} className="border-2 border-black max-h-60 mb-2" />
      ) : (
        <span className="brut-tag text-xs mb-2 inline-block" style={{ background: "#ff4d8d" }}>
          ⚠ BELUM ADA GAMBAR SOAL
        </span>
      )}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {opts.map((o) => {
          const isCorrect = correctSet.has(o.key.toLowerCase());
          return (
            <li
              key={o.key}
              className="border-2 border-black p-2 flex gap-2 items-start"
              style={{ background: isCorrect ? "#a3e635" : "#fff" }}
            >
              <span className="font-black uppercase">{o.key}.</span>
              <div className="flex-1">
                {o.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.imageUrl} alt={`Opsi ${o.key}`} className="border-2 border-black max-h-24 mb-1 bg-white" />
                ) : (
                  <p className="text-xs font-semibold">{o.label || "(tanpa gambar)"}</p>
                )}
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

const OPTION_KEY_ORDER = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

function QuestionEditor({
  q,
  subtestCode,
  onSaved,
  onCancel,
}: {
  q: Question;
  subtestCode: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(q.prompt || "");
  const [imageUrl, setImageUrl] = useState(q.imageUrl || "");
  const [questionNo, setQuestionNo] = useState(q.questionNo);
  const [isExample, setIsExample] = useState(!!q.isExample);
  const initialOpts = normalizeOptions(q.options);
  const [options, setOptions] = useState<OptionItem[]>(
    initialOpts.length > 0
      ? initialOpts
      : OPTION_KEY_ORDER.slice(0, 6).map((k) => ({ key: k, label: "", imageUrl: "" })),
  );
  const [correct, setCorrect] = useState(correctList(q.correct).join(";"));
  const [saving, setSaving] = useState(false);

  const setOpt = (idx: number, patch: Partial<OptionItem>) => {
    setOptions((cur) => cur.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const addOption = () => {
    setOptions((cur) => {
      if (cur.length >= OPTION_KEY_ORDER.length) return cur;
      const used = new Set(cur.map((o) => o.key));
      const nextKey = OPTION_KEY_ORDER.find((k) => !used.has(k)) ?? String(cur.length + 1);
      return [...cur, { key: nextKey, label: "", imageUrl: "" }];
    });
  };

  const removeOption = (idx: number) => {
    setOptions((cur) => cur.slice(0, idx).concat(cur.slice(idx + 1)));
  };

  const onSave = async () => {
    if (options.length < 2) {
      toast.error("Minimal 2 opsi.");
      return;
    }
    const keys = options.map((o) => o.key.trim().toLowerCase());
    if (keys.some((k) => !k)) {
      toast.error("Setiap opsi harus punya huruf.");
      return;
    }
    if (new Set(keys).size !== keys.length) {
      toast.error("Ada huruf opsi yang duplikat.");
      return;
    }
    const correctArr = correct
      .toLowerCase()
      .split(/[,;|/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (correctArr.length === 0) {
      toast.error("Isi kunci jawaban (mis. c — atau b;d untuk 2 kunci).");
      return;
    }
    const invalid = correctArr.filter((c) => !keys.includes(c));
    if (invalid.length > 0) {
      toast.error(`Kunci '${invalid.join(", ")}' tidak ada di daftar opsi.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/cfit/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: q.id,
          subtestCode,
          questionNo,
          prompt,
          imageUrl: imageUrl.trim() || null,
          options: options.map((o) => ({
            key: o.key.trim().toLowerCase(),
            label: o.label,
            imageUrl: o.imageUrl.trim() || null,
          })),
          correct: correctArr.length === 1 ? correctArr[0] : correctArr,
          isExample,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal menyimpan soal");
        return;
      }
      toast.success("Soal disimpan");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="brut-card space-y-3" style={{ background: "#fff7ed" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
          EDIT {q.isExample ? "CONTOH" : "NO"} {q.questionNo}
        </span>
        <label className="flex items-center gap-2 text-xs font-black uppercase ml-auto">
          <input type="checkbox" checked={isExample} onChange={(e) => setIsExample(e.target.checked)} />
          Soal contoh (tidak dinilai)
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <label className="text-xs font-black uppercase">
          Nomor
          <input
            type="number"
            min={1}
            className="brut-input w-full mt-1"
            value={questionNo}
            onChange={(e) => setQuestionNo(parseInt(e.target.value || "1", 10) || 1)}
          />
        </label>
        <label className="text-xs font-black uppercase md:col-span-3">
          Prompt (teks opsional — soal CFIT biasanya murni gambar)
          <input
            type="text"
            className="brut-input w-full mt-1"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="(kosongkan jika soal murni gambar)"
          />
        </label>
      </div>

      <label className="text-xs font-black uppercase block">
        URL gambar soal (stem / deret gambar)
        <input
          type="text"
          className="brut-input w-full mt-1"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://... (upload lewat kartu 'Upload Gambar Satuan')"
        />
      </label>
      {imageUrl.trim() ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl.trim()} alt="Preview soal" className="border-2 border-black max-h-48 bg-white" />
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-black uppercase">Pilihan jawaban (tiap pilihan = gambar)</p>
          <button type="button" className="brut-btn brut-btn-white text-xs" onClick={addOption}>
            + OPSI
          </button>
        </div>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="border-2 border-black p-2 bg-white space-y-1">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  className="brut-input w-14 text-center font-black uppercase"
                  value={o.key}
                  maxLength={2}
                  onChange={(e) => setOpt(i, { key: e.target.value })}
                  title="Huruf opsi"
                />
                <input
                  type="text"
                  className="brut-input flex-1"
                  value={o.imageUrl}
                  onChange={(e) => setOpt(i, { imageUrl: e.target.value })}
                  placeholder="URL gambar pilihan ini (https://...)"
                />
                <button
                  type="button"
                  className="brut-btn brut-btn-pink text-xs"
                  onClick={() => removeOption(i)}
                  title="Hapus opsi ini"
                >
                  ✕
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  className="brut-input flex-1"
                  value={o.label}
                  onChange={(e) => setOpt(i, { label: e.target.value })}
                  placeholder="Label teks opsional"
                />
                {o.imageUrl.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.imageUrl.trim()} alt={`Opsi ${o.key}`} className="border-2 border-black max-h-16 bg-white" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <label className="text-xs font-black uppercase block">
        Kunci jawaban (huruf; pisahkan dengan ; untuk 2 kunci — mis. b;d)
        <input
          type="text"
          className="brut-input w-full mt-1 lowercase"
          value={correct}
          onChange={(e) => setCorrect(e.target.value)}
          placeholder="c"
        />
      </label>

      <div className="flex gap-2 justify-end">
        <button type="button" className="brut-btn brut-btn-white" onClick={onCancel} disabled={saving}>
          BATAL
        </button>
        <button type="button" className="brut-btn brut-btn-black" onClick={onSave} disabled={saving}>
          {saving ? "MENYIMPAN..." : "SIMPAN SOAL"}
        </button>
      </div>
    </div>
  );
}
