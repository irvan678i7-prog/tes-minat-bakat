"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

// Bank Soal IQ (CFIT) — tampilan mengikuti Bank Soal minat-bakat:
// tabel subtes dengan TEMPLATE (XLSX) / UPLOAD / GAMBAR (unggah massal) /
// INSTRUKSI / WAKTU / PREVIEW (+ edit & hapus per soal, termasuk soal contoh).
// Soal & tiap pilihan jawaban CFIT berupa GAMBAR.

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
  const [bulkSub, setBulkSub] = useState<Subtest | null>(null);
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
        <h3 className="text-xl font-black uppercase mb-2">Cara Cepat: Unggah Banyak Gambar</h3>
        <p className="text-sm font-bold mb-2">
          Tekan tombol <span className="bg-black text-white px-1">GAMBAR</span> pada baris subtes,
          lalu pilih/tarik SEMUA gambar subtes itu sekaligus. Sistem membaca nomor soal dari NAMA
          FILE, jadi tidak perlu menempel URL satu per satu.
        </p>
        <ul className="text-sm font-semibold list-disc pl-5 space-y-0.5">
          <li>
            <code>01.png</code> → gambar soal nomor 1 (kalau pilihan a–f sudah tercetak di dalam
            gambar, cukup file ini saja)
          </li>
          <li>
            <code>01b.png</code> → gambar pilihan <b>b</b> soal 1 (boleh <code>01_b.png</code>)
          </li>
          <li>
            <code>c01.png</code> → gambar CONTOH nomor 1 (boleh <code>contoh01.png</code>)
          </li>
        </ul>
      </div>

      <div className="brut-card" style={{ background: "#22d3ee" }}>
        <h3 className="text-xl font-black uppercase mb-2">Upload 1 Gambar (Salin URL)</h3>
        <p className="text-sm font-bold mb-3">
          Untuk kebutuhan satuan: upload satu gambar, URL otomatis tersalin ke clipboard. Tempel ke
          kolom <code>imageUrl</code> (gambar soal) atau <code>option*Image</code> (gambar pilihan)
          di template XLSX subtes.
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
          <span className="bg-black text-white px-1">GAMBAR</span>,{" "}
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
                      className="brut-btn brut-btn-lime text-xs"
                      onClick={() => setBulkSub(s)}
                      title="Unggah banyak gambar sekaligus untuk subtes ini"
                    >
                      GAMBAR
                    </button>
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
      {bulkSub && (
        <BulkImagesModal
          subtest={bulkSub}
          onClose={() => setBulkSub(null)}
          onDone={() => {
            setBulkSub(null);
            void load();
          }}
        />
      )}
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

// Pembacaan nama file — HARUS sama dengan parseImageFileName di
// /api/admin/cfit/subtests/[code]/bulk-images agar pratinjau akurat.
type ParsedName = { isExample: boolean; questionNo: number; optionKey: string | null };

function parseImageFileName(fileName: string): ParsedName | null {
  const base = fileName.replace(/\.[^.]+$/, "").trim().toLowerCase();
  if (!base) return null;
  const isExample = /contoh/.test(base) || /(^|[_\-. ])c\s*0*\d/.test(base);
  const m = base.match(/(\d{1,3})\s*[_\-. ]?\s*([a-h])?$/);
  if (!m) return null;
  const questionNo = parseInt(m[1], 10);
  if (!Number.isFinite(questionNo) || questionNo < 1) return null;
  return { isExample, questionNo, optionKey: m[2] ? m[2].toLowerCase() : null };
}

function BulkImagesModal({
  subtest,
  onClose,
  onDone,
}: {
  subtest: Subtest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [keys, setKeys] = useState("");
  const [replaceAll, setReplaceAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    const rows = new Map<
      string,
      { isExample: boolean; questionNo: number; stem: boolean; options: string[] }
    >();
    const bad: string[] = [];
    for (const f of files) {
      const p = parseImageFileName(f.name);
      if (!p) {
        bad.push(f.name);
        continue;
      }
      const gk = `${p.isExample ? "c" : "s"}:${p.questionNo}`;
      const cur = rows.get(gk) ?? {
        isExample: p.isExample,
        questionNo: p.questionNo,
        stem: false,
        options: [] as string[],
      };
      if (p.optionKey) cur.options = [...cur.options, p.optionKey].sort();
      else cur.stem = true;
      rows.set(gk, cur);
    }
    const list = [...rows.values()].sort(
      (a, b) => Number(a.isExample) - Number(b.isExample) || a.questionNo - b.questionNo,
    );
    return { list, bad };
  }, [files]);

  const submit = async () => {
    if (files.length === 0) {
      toast.error("Pilih dulu gambar-gambarnya.");
      return;
    }
    if (parsed.bad.length > 0) {
      toast.error(`Nama file tanpa nomor soal: ${parsed.bad.join(", ")}`);
      return;
    }
    if (
      replaceAll &&
      !window.confirm(
        `GANTI SEMUA soal pada ${subtest.name}?\nSoal lama subtes ini (beserta jawaban peserta pada soal tersebut) akan dihapus.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      fd.append("keys", keys);
      fd.append("replaceAll", replaceAll ? "1" : "0");
      const res = await fetch(
        `/api/admin/cfit/subtests/${encodeURIComponent(subtest.code)}/bulk-images`,
        { method: "POST", body: fd },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal mengunggah", { duration: 8000 });
        return;
      }
      toast.success(
        `${data.uploaded} gambar terunggah · ${data.created} soal baru · ${data.updated} soal diperbarui`,
        { duration: 6000 },
      );
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start md:items-center justify-center p-2 md:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="brut-card w-full max-w-3xl my-4 space-y-3"
        style={{ background: "#fff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase">CFIT • {subtest.code}</p>
            <h3 className="text-2xl font-black uppercase">Unggah Banyak Gambar</h3>
          </div>
          <button className="brut-btn brut-btn-black" onClick={onClose} disabled={busy}>
            TUTUP
          </button>
        </div>

        <div className="brut-card text-sm font-semibold space-y-1" style={{ background: "#fef9c3" }}>
          <p className="font-black uppercase">Aturan nama file</p>
          <p>
            <code>01.png</code> = gambar soal 1 · <code>01b.png</code> = pilihan b soal 1 ·{" "}
            <code>c01.png</code> = contoh 1 · <code>c01a.png</code> = pilihan a contoh 1. Prefiks
            bebas, yang dibaca adalah angka (dan huruf opsi) di AKHIR nama file, mis.{" "}
            <code>3A_SERIES_07_d.png</code>.
          </p>
        </div>

        <label className="text-xs font-black uppercase block">
          Pilih / tarik banyak gambar sekaligus
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="brut-input w-full mt-1"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            disabled={busy}
          />
        </label>

        {files.length > 0 ? (
          <div className="brut-card space-y-2" style={{ background: "#f5f5f5" }}>
            <p className="text-xs font-black uppercase">
              {files.length} file · {parsed.list.length} soal terbaca
            </p>
            {parsed.bad.length > 0 ? (
              <p className="text-sm font-bold" style={{ color: "#be123c" }}>
                ⚠ Tidak terbaca (tidak ada nomor soal): {parsed.bad.join(", ")}
              </p>
            ) : null}
            <div className="max-h-48 overflow-y-auto">
              <table className="brut-table text-xs">
                <thead>
                  <tr>
                    <th>Jenis</th>
                    <th>No</th>
                    <th>Gambar soal</th>
                    <th>Gambar pilihan</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.list.map((r) => (
                    <tr key={`${r.isExample ? "c" : "s"}${r.questionNo}`}>
                      <td className="font-black">{r.isExample ? "CONTOH" : "SOAL"}</td>
                      <td className="font-black">{r.questionNo}</td>
                      <td>{r.stem ? "✓" : "—"}</td>
                      <td className="font-mono">{r.options.length > 0 ? r.options.join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <label className="text-xs font-black uppercase block">
          Kunci jawaban (tempel sekali untuk semua soal)
          <textarea
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
            rows={4}
            className="brut-input w-full mt-1 font-mono text-sm"
            placeholder={"1=c, 2=a, 3=e, 4=b\n5=b+d   (dua kunci)\nc1=a    (kunci contoh 1)"}
            disabled={busy}
          />
        </label>
        <p className="text-xs font-semibold">
          Soal ASLI wajib punya kunci. Kalau soalnya sudah ada di bank soal dan kuncinya tidak
          diubah, kolom ini boleh dikosongkan — kunci lama dipakai.
        </p>

        <label className="flex items-center gap-2 text-sm font-black uppercase">
          <input
            type="checkbox"
            checked={replaceAll}
            onChange={(e) => setReplaceAll(e.target.checked)}
            disabled={busy}
          />
          Ganti semua soal lama subtes ini
        </label>
        <p className="text-xs font-semibold">
          Tanpa dicentang: gambar hanya menimpa soal dengan nomor yang sama, soal lain tetap utuh.
        </p>

        <div className="flex justify-end gap-2">
          <button className="brut-btn brut-btn-white" onClick={onClose} disabled={busy}>
            BATAL
          </button>
          <button className="brut-btn brut-btn-black" onClick={submit} disabled={busy}>
            {busy ? "MENGUNGGAH..." : `UNGGAH ${files.length || ""} GAMBAR`}
          </button>
        </div>
      </div>
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
          Tampil ke peserta di bagian atas halaman contoh soal. Jelaskan cara kerja subtes dan
          contoh tipe soal (mis. “Pilih 1 gambar yang melanjutkan deret di sebelah kiri”).
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
          placeholder="https://... (upload lewat kartu 'Upload Gambar Soal')"
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
