"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

type SubtestSummary = {
  code: string;
  form: "FORM_3A" | "FORM_3B";
  name: string;
  durationSec: number;
  orderIndex: number;
  questionCount: number;
};

type QuestionRow = {
  id: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  options: string[];
  correct: string | string[];
  isExample: boolean;
};

const EMPTY_FORM = {
  questionNo: "",
  prompt: "",
  imageUrl: "",
  options: "a, b, c, d, e, f",
  correct: "",
  isExample: false,
};

export default function CfitAdminQuestions() {
  const [subtests, setSubtests] = useState<SubtestSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/admin/cfit/questions", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal memuat subtes");
      return;
    }
    setSubtests(data.subtests);
    setLoading(false);
  }, []);

  const loadQuestions = useCallback(async (code: string) => {
    const res = await fetch(`/api/admin/cfit/questions?subtest=${encodeURIComponent(code)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal memuat soal");
      return;
    }
    setQuestions(data.subtest.questions);
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openSubtest = async (code: string) => {
    setSelected(code);
    setForm({ ...EMPTY_FORM });
    await loadQuestions(code);
  };

  const save = async () => {
    if (!selected) return;
    const questionNo = Number(form.questionNo);
    if (!Number.isInteger(questionNo) || questionNo < 1) return void toast.error("Nomor soal tidak valid");
    const options = form.options.split(",").map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) return void toast.error("Minimal 2 opsi (pisahkan dengan koma)");
    const correctArr = form.correct.split(",").map((s) => s.trim()).filter(Boolean);
    if (correctArr.length < 1) return void toast.error("Kunci jawaban wajib diisi");

    setSaving(true);
    const res = await fetch("/api/admin/cfit/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subtestCode: selected,
        questionNo,
        prompt: form.prompt.trim(),
        imageUrl: form.imageUrl.trim() || null,
        options,
        correct: correctArr.length === 1 ? correctArr[0] : correctArr,
        isExample: form.isExample,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal menyimpan soal");
    } else {
      toast.success(`Soal no. ${questionNo} tersimpan`);
      setForm({ ...EMPTY_FORM, options: form.options });
      await Promise.all([loadQuestions(selected), loadSummary()]);
    }
    setSaving(false);
  };

  const edit = (q: QuestionRow) => {
    setForm({
      questionNo: String(q.questionNo),
      prompt: q.prompt,
      imageUrl: q.imageUrl ?? "",
      options: (q.options ?? []).join(", "),
      correct: Array.isArray(q.correct) ? q.correct.join(", ") : String(q.correct),
      isExample: q.isExample,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (q: QuestionRow) => {
    if (!selected) return;
    if (!window.confirm(`Hapus soal no. ${q.questionNo}${q.isExample ? " (contoh)" : ""}?`)) return;
    const res = await fetch(`/api/admin/cfit/questions?id=${encodeURIComponent(q.id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Gagal menghapus soal");
      return;
    }
    toast.success("Soal dihapus");
    await Promise.all([loadQuestions(selected), loadSummary()]);
  };

  if (loading) return <div className="brut-card font-black uppercase brut-blink">Memuat...</div>;

  if (!selected) {
    return (
      <div className="space-y-4">
        <div className="brut-card" style={{ background: "#fef9c3" }}>
          <p className="font-bold text-sm">
            Bank soal CFIT terpisah dari bank soal minat-bakat. Soal CFIT berupa gambar —
            unggah gambar ke penyimpanan (mis. Supabase Storage) lalu tempel URL-nya di kolom
            <span className="font-black"> URL Gambar</span>. Materi soal disediakan oleh pemilik lisensi CFIT.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {subtests.map((s) => (
            <button key={s.code} className="brut-card brut-tap text-left" style={{ background: "#fff" }} onClick={() => void openSubtest(s.code)}>
              <div className="flex items-center justify-between mb-1">
                <span className="brut-tag text-xs">{s.form === "FORM_3A" ? "BENTUK A" : "BENTUK B"}</span>
                <span className="brut-tag text-xs" style={{ background: s.questionCount > 0 ? "#a3e635" : "#ff4d8d" }}>
                  {s.questionCount} SOAL
                </span>
              </div>
              <h3 className="text-lg font-black uppercase">{s.name}</h3>
              <p className="text-xs font-bold uppercase mt-1">{s.code} · {Math.round(s.durationSec / 60 * 10) / 10} menit</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const meta = subtests.find((s) => s.code === selected);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-black uppercase">{meta?.name ?? selected} <span className="brut-tag text-xs align-middle">{selected}</span></h2>
        <button className="brut-btn brut-btn-white text-sm" onClick={() => setSelected(null)}>← SEMUA SUBTES</button>
      </div>

      <div className="brut-card space-y-3" style={{ background: "#22d3ee" }}>
        <h3 className="font-black uppercase">Tambah / Edit Soal (per nomor)</h3>
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-black uppercase mb-1">Nomor Soal</label>
            <input className="brut-input w-full" inputMode="numeric" value={form.questionNo} onChange={(e) => setForm({ ...form, questionNo: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-black uppercase mb-1">URL Gambar Soal</label>
            <input className="brut-input w-full" placeholder="https://..." value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-black uppercase mb-1">Teks Soal (opsional)</label>
          <input className="brut-input w-full" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-black uppercase mb-1">Opsi (pisahkan koma)</label>
            <input className="brut-input w-full" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-black uppercase mb-1">Kunci (pisahkan koma jika &gt; 1)</label>
            <input className="brut-input w-full" placeholder="cth: c  — atau: b, e" value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button type="button" className={`brut-checkbox ${form.isExample ? "selected" : ""}`} onClick={() => setForm({ ...form, isExample: !form.isExample })}>
            Soal contoh (tidak dinilai)
          </button>
          <button className="brut-btn brut-btn-black" onClick={save} disabled={saving}>
            {saving ? "MENYIMPAN..." : "SIMPAN SOAL"}
          </button>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="brut-card font-bold">Belum ada soal untuk subtes ini.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="brut-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Gambar</th>
                <th>Opsi</th>
                <th>Kunci</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id}>
                  <td className="font-black">{q.isExample ? `C${q.questionNo}` : q.questionNo}</td>
                  <td>
                    {q.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.imageUrl} alt={`Soal ${q.questionNo}`} className="h-14 border-2 border-black object-contain bg-white" />
                    ) : (
                      <span className="opacity-60">{q.prompt ? q.prompt.slice(0, 40) : "-"}</span>
                    )}
                  </td>
                  <td className="font-mono">{(q.options ?? []).join(" / ")}</td>
                  <td className="font-mono font-black">{Array.isArray(q.correct) ? q.correct.join(", ") : String(q.correct)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="brut-btn brut-btn-cyan text-xs px-2 py-1" style={{ boxShadow: "3px 3px 0 0 #000" }} onClick={() => edit(q)}>EDIT</button>
                      <button className="brut-btn brut-btn-pink text-xs px-2 py-1" style={{ boxShadow: "3px 3px 0 0 #000" }} onClick={() => void remove(q)}>HAPUS</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
