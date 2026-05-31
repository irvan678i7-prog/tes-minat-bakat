"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Auto-redeem link kelas. Dijalankan sekali di sisi client supaya cookie
// HttpOnly bisa di-set lewat response API. Kalau token valid dan siswa
// belum pernah isi profil → /test/profile. Sudah isi & belum selesai →
// /test. Sudah selesai → tampilkan pesan, jangan redirect ke dasbor tes.
export default function KelasRedeem({ code }: { code: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState<string>("Memeriksa token kelas…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/student/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Token tidak valid.");
          return;
        }
        if (data.finishedAt) {
          setStatus("done");
          setMessage(
            "Tes pada browser ini sudah selesai. Buka di browser/HP lain bila ingin mengerjakan ulang sebagai peserta baru.",
          );
          return;
        }
        // OK — arahkan ke halaman profil (kalau belum diisi) atau dasbor tes.
        router.replace(data.profileFilled ? "/test" : "/test/profile");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Gagal menghubungi server. Coba ulang.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="brut-card max-w-md w-full text-center">
        <p className="text-xs font-black uppercase opacity-70 mb-1">Link Kelas</p>
        <p className="font-mono font-black text-2xl tracking-widest mb-4">{code}</p>
        {status === "loading" && (
          <p className="font-bold">{message}</p>
        )}
        {status === "done" && (
          <>
            <p className="font-black text-lg mb-2">Sudah Selesai</p>
            <p className="text-sm font-bold mb-4">{message}</p>
            <Link href="/" className="brut-btn brut-btn-black inline-block">
              KEMBALI
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="font-black text-lg mb-2">Token Tidak Valid</p>
            <p className="text-sm font-bold mb-4">{message}</p>
            <Link href="/" className="brut-btn brut-btn-black inline-block">
              KEMBALI
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
