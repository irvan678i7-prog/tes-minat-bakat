"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";

// Upload massal gambar CFIT: pilih subtes + pilih SEMUA file gambar sekaligus.
// Gambar otomatis terpasang ke soal/pilihan berdasarkan nama file (1.png,
// 1a.png, c1.png, c1a.png). Dikirim per batch kecil supaya tidak melewati
// batas ukuran body request serverless (~4.5 MB di Vercel).

type SubtestLite = { code: string; form: "FORM_3A" | "FORM_3B"; name: string };
type Skipped = { file: string; reason?: string };

const MAX_BATCH_BYTES = 3 * 1024 * 1024;
const MAX_BATCH_FILES = 8;

export default function CfitBulkImageUploader({
  subtests,
  onDone,
}: {
  subtests: SubtestLite[];
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [summary, setSummary] = useState<{ ok: number; skipped: Skipped[] } | null>(null);

  const run = async () => {
    const files = Array.from(inputRef.current?.files || []);
    if (!code) {
      toast.error("Pilih subtes tujuan dulu");
      return;
    }
    if (files.length === 0) {
      toast.error("Pilih file gambar (boleh banyak sekaligus)");
      return;
    }
    setBusy(true);
    setSummary(null);
    let ok = 0;
    const skipped: Skipped[] = [];
    try {
      // Bagi jadi batch kecil (ukuran & jumlah) supaya aman dari batas request.
      const batches: File[][] = [];
      let cur: File[] = [];
      let curSize = 0;
      for (const f of files) {
        if (cur.length > 0 && (curSize + f.size > MAX_BATCH_BYTES || cur.length >= MAX_BATCH_FILES)) {
          batches.push(cur);
          cur = [];
          curSize = 0;
        }
        cur.push(f);
        curSize += f.size;
      }
      if (cur.length > 0) batches.push(cur);

      let sent = 0;
      for (const batch of batches) {
        setProgress(`MENGUPLOAD ${sent + batch.length}/${files.length}...`);
        const fd = new FormData();
        for (const f of batch) fd.append("files", f, f.name);
        const res = await fetch(
          `/api/admin/cfit/subtests/${encodeURIComponent(code)}/bulk-images`,
          { method: "POST", body: fd },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          skipped.push(...batch.map((f) => ({ file: f.name, reason: data.error || "Gagal upload" })));
        } else {
          ok += data.assigned ?? 0;
          if (Array.isArray(data.skipped)) skipped.push(...data.skipped);
        }
        sent += batch.length;
      }
      setSummary({ ok, skipped });
      if (ok > 0) {
        toast.success(`${ok} gambar terpasang otomatis`);
        onDone();
      } else if (skipped.length > 0) {
        toast.error("Tidak ada gambar yang terpasang — cek daftar yang dilewati.");
      }
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          className="brut-input sm:w-72"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          title="Subtes tujuan"
          disabled={busy}
        >
          <option value="">— PILIH SUBTES —</option>
          {subtests.map((s) => (
            <option key={s.code} value={s.code}>
              {s.form === "FORM_3A" ? "3A" : "3B"} • {s.name}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="brut-input flex-1"
          disabled={busy}
        />
        <button onClick={() => void run()} disabled={busy} className="brut-btn brut-btn-pink">
          {busy ? progress || "MENGUPLOAD..." : "UPLOAD MASSAL"}
        </button>
      </div>
      {summary && (
        <div className="border-2 border-black bg-white p-2 text-xs font-bold space-y-1">
          <p>✅ {summary.ok} gambar terpasang otomatis.</p>
          {summary.skipped.length > 0 && (
            <div>
              <p>⚠ {summary.skipped.length} file dilewati:</p>
              <ul className="list-disc pl-4">
                {summary.skipped.slice(0, 20).map((s, i) => (
                  <li key={i}>
                    <span className="font-mono">{s.file}</span>
                    {s.reason ? ` — ${s.reason}` : ""}
                  </li>
                ))}
                {summary.skipped.length > 20 && <li>… dan {summary.skipped.length - 20} lainnya</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
