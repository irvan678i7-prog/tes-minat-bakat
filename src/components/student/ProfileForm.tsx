"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";

type Initial = {
  fullName: string; gender: string; birthPlace: string; birthDate: string;
  age?: number; grade: string; school: string; major: string;
  phone: string; email: string;
};

export default function ProfileForm({ initial }: { initial: Initial }) {
  const [d, setD] = useState<Initial>(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setD((s) => ({ ...s, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.fullName.trim() || !d.gender || !d.school.trim()) {
      return toast.error("Nama, jenis kelamin, & sekolah wajib diisi");
    }
    startTransition(async () => {
      const body = { ...d, age: d.age ? Number(d.age) : undefined, email: d.email || undefined };
      const res = await fetch("/api/student/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal simpan data");
        return;
      }
      toast.success("Data tersimpan");
      router.push("/test");
    });
  };

  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-4 brut-card" style={{ background: "#fff" }}>
      <div className="md:col-span-2">
        <label className="text-xs font-black uppercase block mb-1">Nama Lengkap *</label>
        <input className="brut-input w-full" value={d.fullName} onChange={(e) => set("fullName", e.target.value)} required />
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">Jenis Kelamin *</label>
        <select className="brut-input w-full" value={d.gender} onChange={(e) => set("gender", e.target.value)} required>
          <option value="">— Pilih —</option>
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">Usia</label>
        <input
          type="number"
          className="brut-input w-full"
          value={d.age ?? ""}
          onChange={(e) => set("age", e.target.value ? parseInt(e.target.value) : undefined)}
          min={5}
          max={99}
        />
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">Tempat Lahir</label>
        <input className="brut-input w-full" value={d.birthPlace} onChange={(e) => set("birthPlace", e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">Tanggal Lahir</label>
        <input type="date" className="brut-input w-full" value={d.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">Sekolah *</label>
        <input className="brut-input w-full" value={d.school} onChange={(e) => set("school", e.target.value)} required />
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">Kelas</label>
        <input className="brut-input w-full" value={d.grade} onChange={(e) => set("grade", e.target.value)} placeholder="X / XI / XII" />
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">Jurusan</label>
        <input className="brut-input w-full" value={d.major} onChange={(e) => set("major", e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-black uppercase block mb-1">No. HP</label>
        <input className="brut-input w-full" value={d.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <label className="text-xs font-black uppercase block mb-1">Email</label>
        <input type="email" className="brut-input w-full" value={d.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <button className="brut-btn brut-btn-black" disabled={pending} type="submit">
          {pending ? "MENYIMPAN..." : "SIMPAN & LANJUT"}
        </button>
      </div>
    </form>
  );
}
