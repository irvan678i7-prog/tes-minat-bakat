"use client";

import { useEffect } from "react";
import Link from "next/link";

// Global error boundary brutalism style. Dipakai Next.js otomatis kalau ada
// uncaught error di server component / client component dalam render tree.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log ke console supaya bisa di-debug; integrasi Sentry/Datadog bisa
    // ditambah di sini nanti.
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg brut-card" style={{ background: "#ff4d8d" }}>
        <div
          className="inline-flex items-center justify-center font-black mb-4"
          style={{
            width: 60,
            height: 60,
            border: "4px solid #000",
            background: "#fff",
            fontSize: 36,
            boxShadow: "4px 4px 0 0 #000",
          }}
          aria-hidden
        >
          ⚠
        </div>
        <h1 className="text-3xl font-black uppercase mb-2">Terjadi Kesalahan</h1>
        <p className="font-semibold mb-6">
          Sistem mengalami kendala sementara. Silakan coba lagi atau kembali ke
          halaman utama.
        </p>
        {error.digest ? (
          <p className="text-xs font-mono opacity-70 mb-6">
            Kode rujukan: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="brut-btn brut-btn-black"
          >
            COBA LAGI
          </button>
          <Link href="/" className="brut-btn brut-btn-white">
            KE HALAMAN UTAMA
          </Link>
        </div>
      </div>
    </div>
  );
}
