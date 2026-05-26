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
      let res: Response;
      try {
        res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch (e) {
        toast.error(
          `Tidak bisa terhubung ke server: ${
            e instanceof Error ? e.message : "Network error"
          }`,
        );
        return;
      }
      // Selalu coba parse text dulu supaya kalau body bukan JSON (mis.
      // server crash 500 dengan HTML), kita tetap bisa tampilkan info
      // berguna ke user — bukan toast "Login gagal" yang hampa.
      const text = await res.text();
      let data: { error?: string; detail?: string; name?: string; email?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const base =
          data.error ||
          `Login gagal (HTTP ${res.status}${
            res.status >= 500 ? " — error server, cek Vercel logs" : ""
          }).`;
        // Untuk error 500 (server crash), tampilkan detail asli dari server
        // supaya admin tahu env mana yang salah TANPA harus buka Vercel logs.
        const msg = data.detail ? `${base}\n\nDetail: ${data.detail}` : base;
        toast.error(msg, { duration: 8000, style: { maxWidth: 520 } });
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
          <a
            href="/api/admin/diagnose"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs font-bold uppercase underline opacity-70 mt-2"
          >
            Diagnosa Konfigurasi Server →
          </a>
        </form>
      </div>
    </div>
  );
}
