"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";

export default function CfitProfilePage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<"" | "L" | "P">("");
  const [age, setAge] = useState("");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return void toast.error("Nama lengkap wajib diisi");
    const ageNum = age ? Number(age) : undefined;
    if (age && (!Number.isInteger(ageNum) || ageNum! < 5 || ageNum! > 99)) {
      return void toast.error("Usia tidak valid");
    }
    startTransition(async () => {
      const res = await fetch("/api/cfit/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          gender: gender || undefined,
          age: ageNum,
          grade: grade.trim() || undefined,
          school: school.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.error("Sesi berakhir. Masukkan token lagi.");
        router.replace("/cfit");
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "Gagal menyimpan biodata");
        return;
      }
      if (data.normWarning) toast(data.normWarning, { icon: "⚠️", duration: 6000 });
      toast.success("Biodata tersimpan!");
      router.push("/cfit/test");
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-cyan-300">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-black uppercase">Data Diri Peserta</h1>
          <p className="text-xs font-bold uppercase tracking-wider mt-0.5">Tes IQ — CFIT Skala 3</p>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
        <form onSubmit={submit} className="brut-card space-y-4" style={{ background: "#fff" }}>
          <div>
            <label className="block text-sm font-black uppercase mb-1">Nama Lengkap *</label>
            <input className="brut-input w-full" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={pending} autoComplete="off" />
          </div>

          <div>
            <label className="block text-sm font-black uppercase mb-1">Jenis Kelamin</label>
            <div className="flex gap-3">
              <button type="button" className={`brut-checkbox ${gender === "L" ? "selected" : ""}`} onClick={() => setGender("L")}>Laki-laki</button>
              <button type="button" className={`brut-checkbox ${gender === "P" ? "selected-pink selected" : ""}`} onClick={() => setGender("P")}>Perempuan</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-black uppercase mb-1">Usia (tahun)</label>
              <input className="brut-input w-full" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} disabled={pending} />
              <p className="text-xs font-semibold mt-1">Norma IQ saat ini untuk usia 17+.</p>
            </div>
            <div>
              <label className="block text-sm font-black uppercase mb-1">Kelas</label>
              <input className="brut-input w-full" placeholder="cth: XII TKJ 1" value={grade} onChange={(e) => setGrade(e.target.value)} disabled={pending} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-black uppercase mb-1">Sekolah / Instansi</label>
            <input className="brut-input w-full" value={school} onChange={(e) => setSchool(e.target.value)} disabled={pending} />
          </div>

          <button type="submit" className="brut-btn brut-btn-cyan w-full" disabled={pending}>
            {pending ? "MENYIMPAN..." : "SIMPAN & LANJUT"}
          </button>
        </form>
      </main>
    </div>
  );
}
