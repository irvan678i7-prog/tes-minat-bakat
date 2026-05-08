"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Login gagal");
        return;
      }
      toast.success(`Halo, ${data.name}!`);
      router.push("/admin");
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md brut-card" style={{ background: "#facc15" }}>
        <div className="mb-6">
          <Link href="/" className="text-sm font-bold uppercase underline">← Kembali</Link>
          <h1 className="text-3xl font-black uppercase mt-2">Login Admin</h1>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-black uppercase">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={pending}
            className="brut-input w-full"
            placeholder="admin@example.com"
          />
          <label className="block text-sm font-black uppercase">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={pending}
            className="brut-input w-full"
          />
          <button type="submit" className="brut-btn brut-btn-black w-full" disabled={pending}>
            {pending ? "MASUK..." : "MASUK"}
          </button>
        </form>
      </div>
    </div>
  );
}
