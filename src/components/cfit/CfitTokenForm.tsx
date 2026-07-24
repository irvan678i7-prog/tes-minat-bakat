"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";

// Form token khusus CFIT — memakai endpoint /api/cfit/* dan cookie sesi
// sendiri, terpisah dari tes minat-bakat.
export default function CfitTokenForm() {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const redeem = async (forceNew: boolean) => {
    const trimmed = code.trim().toUpperCase();
    const res = await fetch("/api/cfit/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forceNew ? { code: trimmed, forceNew: true } : { code: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || `Gagal validasi token (HTTP ${res.status})`);
      return;
    }
    if (data.finishedAt) {
      // Sesi lama di browser ini sudah selesai — tawarkan mulai sebagai
      // peserta baru (peserta bergantian di perangkat yang sama).
      const ulang = window.confirm(
        "Sesi tes dengan token ini di perangkat ini sudah selesai.\nMulai sebagai peserta BARU?",
      );
      if (ulang) await redeem(true);
      return;
    }
    toast.success("Token valid! Lanjut ke data diri.");
    router.push(data.profileFilled ? "/cfit/test" : "/cfit/profile");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return void toast.error("Token tidak boleh kosong");
    startTransition(async () => {
      await redeem(false);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-black uppercase">Masukkan token tes IQ:</label>
      <input
        className="brut-input w-full font-mono tracking-widest text-lg"
        placeholder="XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        disabled={pending}
        autoComplete="off"
      />
      <button type="submit" className="brut-btn brut-btn-black w-full" disabled={pending}>
        {pending ? "MEMERIKSA..." : "MULAI TES IQ"}
      </button>
    </form>
  );
}
