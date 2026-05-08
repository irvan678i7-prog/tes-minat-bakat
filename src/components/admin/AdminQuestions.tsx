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

export default function AdminQuestions() {
  const [subs, setSubs] = useState<Subtest[]>([]);
  const [pending, startTransition] = useTransition();
  const [imageBusy, setImageBusy] = useState(false);
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
          <p className="text-sm font-bold mb-3">
            Gunakan template untuk struktur kolom yang benar. Format diganti per subtes (replace).
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
            Upload gambar; URL akan disalin ke clipboard untuk dipakai di kolom <code>imageUrl</code>.
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
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>{s.testKind}</td>
                <td className="font-mono font-bold">{s.code}</td>
                <td>{s.name}</td>
                <td>
                  <span className={`brut-tag ${s.questionCount === 0 ? "" : ""}`} style={{ background: s.questionCount === 0 ? "#ff4d8d" : "#a3e635" }}>
                    {s.questionCount}
                  </span>
                </td>
                <td>
                  <DurationEditor seconds={s.durationSec} onSave={(v) => updateDuration(s.id, v * 60)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
