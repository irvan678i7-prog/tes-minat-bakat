"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import CfitConfirm from "@/components/cfit/CfitConfirm";

// Form token khusus CFIT — memakai endpoint /api/cfit/* dan cookie sesi
// sendiri, terpisah dari tes minat-bakat.
// CATATAN: 1 token bisa dipakai BANYAK peserta (token kelas). Perangkat yang
// sama setelah sesi selesai → tawarkan mulai sebagai peserta baru (forceNew).
export default function CfitTokenForm() {
  const [code, setCode] = useState("");
  const [askNew, setAskNew] = useState(false);
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
      setAskNew(true);
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

      <CfitConfirm
        open={askNew}
        title="Sesi di perangkat ini sudah selesai"
        confirmLabel="MULAI PESERTA BARU"
        cancelLabel="BATAL"
        pending={pending}
        onConfirm={() => {
          setAskNew(false);
          startTransition(async () => {
            await redeem(true);
          });
        }}
        onCancel={() => setAskNew(false)}
      >
        Tes dengan token ini di perangkat ini sudah diselesaikan. Mulai sebagai peserta BARU dengan token
        yang sama? (Peserta bergantian di perangkat yang sama.)
      </CfitConfirm>
    </form>
  );
}
