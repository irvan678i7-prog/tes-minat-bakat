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
  imageUrl2?: string | null;
  parts: number;
  options: OptionItem[] | unknown;
  correct: unknown;
  partLabels?: string[] | null;
  scoringTag: string | null;
  isExample?: boolean;
  inputMode?: "CHOICE" | "TEXT" | string;
};

// Subtes yang strukturnya "1 gambar = 1 soal dengan N kunci jawaban".
// Untuk subtes ini admin bisa pakai flow upload massal supaya tidak perlu
// upload gambar 1 per 1 + tempel URL ke Excel.
const BULK_UPLOAD_CODES = new Set(["BAKAT_5_SPASIAL", "BAKAT_7_SISTEMATISASI"]);

export default function AdminQuestions() {
  const [subs, setSubs] = useState<Subtest[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [previewSub, setPreviewSub] = useState<Subtest | null>(null);
  const [editInstrSub, setEditInstrSub] = useState<Subtest | null>(null);
  const [bulkSub, setBulkSub] = useState<Subtest | null>(null);
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
                    {BULK_UPLOAD_CODES.has(s.code) && (
                      <button
                        className="brut-btn text-xs"
                        style={{ background: "#86efac" }}
                        onClick={() => setBulkSub(s)}
                        title="Upload banyak gambar sekaligus + isi kunci di form (no Excel)"
                      >
                        UPLOAD MASSAL
                      </button>
                    )}
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
      {bulkSub && (
        <BulkUploadModal
          subtest={bulkSub}
          onClose={() => setBulkSub(null)}
          onDone={() => {
            toast.success("Soal subtes diperbarui");
            setBulkSub(null);
            load();
          }}
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
      {(q.imageUrl || q.imageUrl2) && (
        <div className="flex flex-wrap items-start gap-2 mb-2">
          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={q.imageUrl}
              alt={`Soal ${q.questionNo}`}
              className="border-2 border-black max-h-60"
            />
          )}
          {q.imageUrl2 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={q.imageUrl2}
              alt={`Soal ${q.questionNo} (gambar 2)`}
              className="border-2 border-black max-h-60"
            />
          )}
        </div>
      )}
      {partImages.length > 0 && (
        <div className="space-y-2 mb-2">
          {partImages.map((img, i) =>
            img ? (
              <div key={i} className="border-2 border-black p-2 bg-white">
                <div className="text-xs font-black uppercase mb-1">Sisi {i + 1}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt={`Pilihan Sisi ${i + 1}`}
                  className="border-2 border-black max-h-40"
                />
              </div>
            ) : null,
          )}
        </div>
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

// ───────────────────────────────────────────────────────────────────────────────
// Upload Massal (khusus SPASIAL & SISTEMATIS)
// ───────────────────────────────────────────────────────────────────────────────

type BulkItem = {
  // File asli (kalau baru dipilih) untuk preview + upload.
  file: File | null;
  // Preview URL (object URL kalau ada File, atau URL imageUrl existing).
  previewUrl: string;
  // OPTIONAL gambar kedua (mis. SISTEMATIS: gambar soal + gambar pertanyaan).
  file2: File | null;
  previewUrl2: string;
  parts: number;
  // Kunci jawaban per part. Untuk SPASIAL: "B" / "S". Untuk SISTEMATIS: 1 huruf
  // (A-X untuk 1-24). Disimpan sebagai string lepas supaya tidak repot
  // validasinya saat ketik.
  kunci: string[];
  // Label nomor untuk tiap sel di lembar jawaban siswa. Default "1","2",….
  // Admin bisa edit (mis. "6","7",… untuk soal #2 supaya berkesinambungan)
  // atau pakai tombol Auto-Nomor.
  partLabels: string[];
  // Optional: prompt teks tambahan (jarang dipakai untuk kedua subtes ini).
  prompt: string;
  // Jadikan contoh soal (tampil sebelum timer mulai).
  isExample: boolean;
};

const SPASIAL_CODE_FE = "BAKAT_5_SPASIAL";
const SISTEMATIS_CODE_FE = "BAKAT_7_SISTEMATISASI";

// Max parts (jumlah sel jawaban) per soal SISTEMATIS. Buku Sistematisasi
// pakai huruf A-X (24 opsi), jadi max 24 sel per soal masuk akal.
const SISTEMATIS_MAX_PARTS = 24;

function defaultPartsFor(code: string): number {
  if (code === SPASIAL_CODE_FE) return 5;
  return 12; // SISTEMATIS default — admin bisa override per kartu.
}

function newBulkItem(file: File | null, code: string): BulkItem {
  const parts = defaultPartsFor(code);
  return {
    file,
    previewUrl: file ? URL.createObjectURL(file) : "",
    file2: null,
    previewUrl2: "",
    parts,
    kunci: Array.from({ length: parts }).map(() => ""),
    partLabels: Array.from({ length: parts }, (_, i) => String(i + 1)),
    prompt: "",
    isExample: false,
  };
}

function BulkUploadModal({
  subtest,
  onClose,
  onDone,
}: {
  subtest: Subtest;
  onClose: () => void;
  onDone: () => void;
}) {
  const isSpasial = subtest.code === SPASIAL_CODE_FE;
  const isSistematis = subtest.code === SISTEMATIS_CODE_FE;
  const [items, setItems] = useState<BulkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [replaceAll, setReplaceAll] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bersihin object URLs saat unmount.
  useEffect(() => {
    return () => {
      for (const it of items) {
        if (it.file && it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        if (it.file2 && it.previewUrl2) URL.revokeObjectURL(it.previewUrl2);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) {
      toast.error("Pilih file gambar (.png/.jpg)");
      return;
    }
    setItems((prev) => [
      ...prev,
      ...arr.map((f) => newBulkItem(f, subtest.code)),
    ]);
  };

  const removeAt = (idx: number) => {
    setItems((prev) => {
      const next = prev.slice();
      const removed = next.splice(idx, 1)[0];
      if (removed?.file && removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      if (removed?.file2 && removed.previewUrl2) URL.revokeObjectURL(removed.previewUrl2);
      return next;
    });
  };

  // Set/replace gambar kedua per item. Otomatis revoke object URL lama supaya
  // memori bersih.
  const setFile2 = (idx: number, file: File | null) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        if (it.file2 && it.previewUrl2) URL.revokeObjectURL(it.previewUrl2);
        return {
          ...it,
          file2: file,
          previewUrl2: file ? URL.createObjectURL(file) : "",
        };
      }),
    );
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    setItems((prev) => {
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setItems((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next;
    });
  };

  const setItem = (idx: number, patch: Partial<BulkItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const setKunci = (idx: number, partIdx: number, value: string) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const kunci = it.kunci.slice();
        while (kunci.length < it.parts) kunci.push("");
        kunci[partIdx] = value;
        return { ...it, kunci };
      }),
    );
  };

  const setPartLabel = (idx: number, partIdx: number, value: string) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const labels = it.partLabels.slice();
        while (labels.length < it.parts) labels.push(String(labels.length + 1));
        labels[partIdx] = value;
        return { ...it, partLabels: labels };
      }),
    );
  };

  const setParts = (idx: number, parts: number) => {
    const clamped = Math.max(1, Math.min(SISTEMATIS_MAX_PARTS, Math.floor(parts) || 1));
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const kunci = it.kunci.slice(0, clamped);
        while (kunci.length < clamped) kunci.push("");
        const labels = it.partLabels.slice(0, clamped);
        while (labels.length < clamped) labels.push(String(labels.length + 1));
        return { ...it, parts: clamped, kunci, partLabels: labels };
      }),
    );
  };

  // Auto-isi label nomor sel "lembar jawaban" untuk SEMUA soal.
  // mode="continuous": Q1 → 1..N1, Q2 → (N1+1)..(N1+N2), … (default).
  // mode="per-question": tiap soal mulai dari 1 lagi.
  const autoNumber = (mode: "continuous" | "per-question", startAt: number) => {
    setItems((prev) => {
      let next = Math.max(1, Math.floor(startAt) || 1);
      return prev.map((it) => {
        const labels: string[] = [];
        if (mode === "per-question") {
          for (let i = 0; i < it.parts; i++) labels.push(String(i + 1));
        } else {
          for (let i = 0; i < it.parts; i++) {
            labels.push(String(next));
            next++;
          }
        }
        return { ...it, partLabels: labels };
      });
    });
    toast.success(
      mode === "continuous"
        ? `Auto-nomor berkesinambungan mulai dari ${startAt}`
        : "Auto-nomor per soal (1..N)",
    );
  };

  // Total cell (jumlah jawaban) yang akan dinilai = sum dari it.parts.
  const totalCells = items.reduce((acc, it) => acc + it.parts, 0);

  // Validasi: tiap item harus punya gambar + semua kunci terisi.
  const validate = (): string | null => {
    if (items.length === 0) return "Belum ada gambar yang dipilih.";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.file) return `Kartu #${i + 1}: gambar belum dipilih.`;
      if (isSpasial && it.parts !== 5) return `Kartu #${i + 1}: SPASIAL harus 5 jawaban.`;
      if (isSistematis && (it.parts < 1 || it.parts > SISTEMATIS_MAX_PARTS))
        return `Kartu #${i + 1}: SISTEMATIS parts harus 1-${SISTEMATIS_MAX_PARTS}.`;
      for (let p = 0; p < it.parts; p++) {
        const k = (it.kunci[p] ?? "").trim();
        if (!k) return `Kartu #${i + 1}: kunci posisi ${p + 1} belum diisi.`;
        if (isSpasial && !["B", "S"].includes(k.toUpperCase()))
          return `Kartu #${i + 1}: kunci posisi ${p + 1} harus B atau S.`;
        if (isSistematis && !/^[A-Xa-x]$/.test(k))
          return `Kartu #${i + 1}: kunci posisi ${p + 1} harus huruf A-X.`;
      }
    }
    return null;
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      const meta = items.map((it, i) => ({
        questionNo: i + 1,
        parts: it.parts,
        kunci: it.kunci.slice(0, it.parts).map((s) => s.trim()),
        partLabels: it.partLabels.slice(0, it.parts).map((s) => String(s).trim()),
        prompt: it.prompt || "",
        isExample: it.isExample,
      }));
      fd.append("meta", JSON.stringify(meta));
      if (replaceAll) fd.append("replaceAll", "1");
      items.forEach((it, i) => {
        if (it.file) fd.append(`image_${i}`, it.file);
        if (it.file2) fd.append(`image2_${i}`, it.file2);
      });
      const res = await fetch(`/api/admin/subtests/${subtest.id}/bulk-questions`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal simpan");
        return;
      }
      toast.success(`Sukses: ${data.created} soal disimpan`);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  // Drag-drop handler untuk seluruh modal.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    addFiles(e.dataTransfer?.files ?? null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start md:items-center justify-center p-2 md:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="brut-card bg-white w-full max-w-5xl my-4"
        style={{ background: "#fff" }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDrop}
      >
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <p className="text-xs font-black uppercase">{subtest.testKind} • {subtest.code}</p>
            <h3 className="text-2xl font-black uppercase">Upload Massal: {subtest.name}</h3>
          </div>
          <button className="brut-btn brut-btn-black" onClick={onClose} type="button">
            TUTUP
          </button>
        </div>

        <div className="brut-card mb-4" style={{ background: "#fef3c7" }}>
          <p className="text-sm font-bold">
            Pilih banyak gambar sekaligus (atau drag-drop ke area ini). Tiap gambar = 1 soal.
            {isSpasial && (
              <> Untuk SPASIAL: tiap soal punya <strong>5 jawaban B/S</strong> (default fixed).</>
            )}
            {isSistematis && (
              <>
                {" "}
                Untuk SISTEMATIS: tiap soal punya hingga <strong>24 jawaban huruf A-X</strong>
                {" "}(default 12). Atur jumlah lewat kolom <em>Parts</em>. Bisa juga upload
                {" "}<strong>2 gambar per soal</strong> (mis. gambar soal + gambar pertanyaan).
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-3 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="brut-input"
              onChange={(e) => {
                addFiles(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <span className="brut-tag" style={{ background: "#a3e635" }}>
              {items.length} soal
            </span>
            <span className="brut-tag" style={{ background: "#facc15" }}>
              {totalCells} jawaban total
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={replaceAll}
              onChange={(e) => setReplaceAll(e.target.checked)}
            />
            Ganti semua soal lama (default: ya)
          </label>
        </div>

        {items.length > 0 && (
          <AutoNumberBar onApply={(mode, startAt) => autoNumber(mode, startAt)} />
        )}

        {items.length === 0 && (
          <div
            className="border-2 border-dashed border-black p-8 text-center text-sm font-bold mb-4"
            style={{ background: "#f5f5f5" }}
          >
            Drop gambar di sini, atau klik tombol Choose File di atas. Bisa pilih banyak gambar
            sekaligus dengan Ctrl/Cmd+klik.
          </div>
        )}

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="brut-card"
              style={{ background: it.isExample ? "#e0f2fe" : "#f5f5f5" }}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex flex-col items-center gap-1">
                  <span className="brut-tag" style={{ background: "#facc15" }}>
                    SOAL {idx + 1}
                  </span>
                  <button
                    type="button"
                    className="brut-btn text-xs"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="brut-btn text-xs"
                    onClick={() => moveDown(idx)}
                    disabled={idx === items.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="brut-btn brut-btn-pink text-xs"
                    onClick={() => removeAt(idx)}
                    title="Hapus soal ini"
                  >
                    HAPUS
                  </button>
                </div>
                <div className="shrink-0 flex flex-col gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase mb-1">Gambar Soal</div>
                    {it.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.previewUrl}
                        alt={`Gambar soal ${idx + 1}`}
                        className="border-2 border-black max-h-32 max-w-[260px] object-contain bg-white"
                      />
                    ) : (
                      <div className="border-2 border-black w-40 h-24 flex items-center justify-center text-xs font-bold">
                        (belum ada)
                      </div>
                    )}
                  </div>
                  {isSistematis && (
                    <div>
                      <div className="text-[10px] font-black uppercase mb-1 flex items-center gap-2">
                        Gambar Pertanyaan
                        {it.file2 && (
                          <button
                            type="button"
                            className="brut-btn brut-btn-pink text-[10px]"
                            onClick={() => setFile2(idx, null)}
                            title="Hapus gambar pertanyaan"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {it.previewUrl2 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.previewUrl2}
                          alt={`Gambar pertanyaan ${idx + 1}`}
                          className="border-2 border-black max-h-32 max-w-[260px] object-contain bg-white"
                        />
                      ) : (
                        <label
                          className="border-2 border-dashed border-black w-40 h-24 flex flex-col items-center justify-center text-xs font-bold cursor-pointer bg-yellow-50 hover:bg-yellow-100"
                          title="Tambahkan gambar pertanyaan (opsional)"
                        >
                          + UPLOAD
                          <span className="text-[9px] font-normal">(opsional)</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              if (f) setFile2(idx, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-[260px]">
                  <div className="flex flex-wrap gap-3 items-center mb-2">
                    {isSistematis && (
                      <label className="text-xs font-black uppercase flex items-center gap-1">
                        Parts:
                        <input
                          type="number"
                          min={1}
                          max={SISTEMATIS_MAX_PARTS}
                          value={it.parts}
                          onChange={(e) =>
                            setParts(idx, parseInt(e.target.value || "12", 10))
                          }
                          className="brut-input w-16 text-sm"
                        />
                      </label>
                    )}
                    {isSpasial && (
                      <span className="text-xs font-black uppercase">Parts: 5 (fixed)</span>
                    )}
                    <label className="text-xs font-black uppercase flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={it.isExample}
                        onChange={(e) => setItem(idx, { isExample: e.target.checked })}
                      />
                      Contoh Soal
                    </label>
                  </div>
                  <div className="text-xs font-black uppercase mb-1">
                    Kunci Jawaban ({it.parts} posisi)
                  </div>
                  <div
                    className={
                      isSpasial
                        ? "grid grid-cols-5 gap-2"
                        : "grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2"
                    }
                  >
                    {Array.from({ length: it.parts }).map((_, p) => (
                      <BulkKunciInput
                        key={p}
                        idx={p}
                        value={it.kunci[p] ?? ""}
                        labelValue={it.partLabels[p] ?? String(p + 1)}
                        onLabelChange={(v) => setPartLabel(idx, p, v)}
                        isSpasial={isSpasial}
                        onChange={(v) => setKunci(idx, p, v)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t-2 border-black">
          <span className="text-xs font-bold opacity-70">
            {items.length} gambar siap disimpan.
            {replaceAll
              ? " Semua soal lama subtes ini akan diganti."
              : " Soal baru akan ditambahkan (tidak menghapus yang lama)."}
          </span>
          <button
            type="button"
            className="brut-btn brut-btn-pink"
            disabled={busy || items.length === 0}
            onClick={onSubmit}
          >
            {busy ? "MENYIMPAN..." : "SIMPAN SEMUA"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutoNumberBar({
  onApply,
}: {
  onApply: (mode: "continuous" | "per-question", startAt: number) => void;
}) {
  const [startAt, setStartAt] = useState(1);
  return (
    <div className="brut-card mb-3" style={{ background: "#d1fae5" }}>
      <div className="flex items-center flex-wrap gap-2">
        <span className="text-xs font-black uppercase">Auto-Nomor Lembar Jawaban:</span>
        <label className="text-xs font-black uppercase flex items-center gap-1">
          mulai dari
          <input
            type="number"
            min={1}
            value={startAt}
            onChange={(e) => setStartAt(parseInt(e.target.value || "1", 10) || 1)}
            className="brut-input w-20 text-sm"
          />
        </label>
        <button
          type="button"
          className="brut-btn brut-btn-black text-xs"
          onClick={() => onApply("continuous", startAt)}
          title="Lanjut nomor antar soal: Q1 → 1..N, Q2 → (N+1).., dst."
        >
          BERKESINAMBUNGAN
        </button>
        <button
          type="button"
          className="brut-btn text-xs"
          onClick={() => onApply("per-question", 1)}
          title="Setiap soal mulai dari 1 (default)"
        >
          PER SOAL (1..N)
        </button>
        <span className="text-xs font-bold opacity-70">
          Atau ketik manual di kotak nomor di tiap sel.
        </span>
      </div>
    </div>
  );
}

function BulkKunciInput({
  idx,
  value,
  labelValue,
  onLabelChange,
  isSpasial,
  onChange,
}: {
  idx: number;
  value: string;
  labelValue: string;
  onLabelChange: (v: string) => void;
  isSpasial: boolean;
  onChange: (v: string) => void;
}) {
  // Untuk SPASIAL: tombol toggle B/S supaya cepat. Untuk SISTEMATIS: input 1
  // huruf A-L. Di atas tiap sel, admin bisa edit label nomornya yang akan
  // tampil di lembar jawaban siswa (mis. "6" alih-alih "1").
  if (isSpasial) {
    return (
      <div className="border-2 border-black bg-white p-1">
        <input
          type="text"
          value={labelValue}
          onChange={(e) => onLabelChange(e.target.value)}
          className="w-full text-[10px] font-black text-center mb-1 border-b-2 border-black bg-transparent focus:outline-none focus:bg-yellow-100"
          placeholder={String(idx + 1)}
          title={`Label cell #${idx + 1} di lembar jawaban siswa`}
        />
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            className={`brut-btn text-xs ${value.toUpperCase() === "B" ? "brut-btn-black" : ""}`}
            onClick={() => onChange("B")}
          >
            B
          </button>
          <button
            type="button"
            className={`brut-btn text-xs ${value.toUpperCase() === "S" ? "brut-btn-pink" : ""}`}
            onClick={() => onChange("S")}
          >
            S
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="border-2 border-black bg-white p-1">
      <input
        type="text"
        value={labelValue}
        onChange={(e) => onLabelChange(e.target.value)}
        className="w-full text-[10px] font-black text-center mb-1 border-b-2 border-black bg-transparent focus:outline-none focus:bg-yellow-100"
        placeholder={String(idx + 1)}
        title={`Label cell #${idx + 1} di lembar jawaban siswa`}
      />
      <input
        type="text"
        maxLength={1}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^A-Xa-x]/g, "").toUpperCase())}
        className="brut-input w-full text-center font-black uppercase"
        placeholder="A-X"
      />
    </div>
  );
}
