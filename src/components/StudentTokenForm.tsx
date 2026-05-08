"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";

export default function StudentTokenForm({ testKind }: { testKind: "MINAT" | "BAKAT" }) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return toast.error("Token tidak boleh kosong");
    startTransition(async () => {
      const res = await fetch("/api/student/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal validasi token");
        return;
      }
      if (data.testKind !== testKind) {
        toast.error(`Token ini untuk ${data.testKind}, bukan ${testKind}.`);
        return;
      }
      if (data.finishedAt) {
        toast.error("Token ini sudah pernah dipakai dan tes selesai.");
        return;
      }
      toast.success("Token valid! Lanjut ke data diri.");
      router.push(data.profileFilled ? "/test" : "/test/profile");
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-black uppercase">Masukkan token:</label>
      <input
        className="brut-input w-full font-mono tracking-widest text-lg"
        placeholder="XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        disabled={pending}
        autoComplete="off"
      />
      <button type="submit" className={`brut-btn w-full ${testKind === "MINAT" ? "brut-btn-pink" : ""}`} disabled={pending}>
        {pending ? "MEMERIKSA..." : `MULAI TES ${testKind}`}
      </button>
    </form>
  );
}
