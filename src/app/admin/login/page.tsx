"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={pending}
              className="brut-input w-full pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={pending}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center border-2 border-black bg-white hover:bg-yellow-200 active:translate-y-0 disabled:opacity-50"
            >
              {showPassword ? (
                // Eye-off (password visible → klik untuk sembunyikan)
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                // Eye (password hidden → klik untuk tampilkan)
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <button type="submit" className="brut-btn brut-btn-black w-full" disabled={pending}>
            {pending ? "MASUK..." : "MASUK"}
          </button>
        </form>
      </div>
    </div>
  );
}
