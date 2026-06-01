"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Auto-redeem link kelas. Dijalankan sekali di sisi client supaya cookie
// HttpOnly bisa di-set lewat response API. Kalau token valid dan siswa
// belum pernah isi profil → /test/profile. Sudah isi & belum selesai →
// /test. Sudah selesai → tampilkan pesan + tombol "Mulai sebagai peserta
// baru" (forceNew). forceNew dipakai juga saat 2+ siswa bergantian di
// browser/HP yang sama.

async function callRedeem(code: string, forceNew: boolean) {
  const res = await fetch("/api/student/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, forceNew: forceNew || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function KelasRedeem({ code }: { code: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "done" | "resumed" | "error">("loading");
  const [message, setMessage] = useState<string>("Memeriksa token kelas…");
  const [resumedName, setResumedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const didMount = useRef(false);

  // Auto-redeem sekali saat mount.
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    let cancelled = false;
    callRedeem(code, false).then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok) {
        setStatus("error");
        setMessage(data.error || "Token tidak valid.");
        return;
      }
      if (data.finishedAt) {
        setStatus("done");
        setResumedName(data.fullName ?? null);
        return;
      }
      if (data.fullName) {
        setStatus("resumed");
        setResumedName(data.fullName);
        return;
      }
      router.replace(data.profileFilled ? "/test" : "/test/profile");
    }).catch(() => {
      if (!cancelled) {
        setStatus("error");
        setMessage("Gagal menghubungi server. Coba ulang.");
      }
    });
    return () => { cancelled = true; };
  }, [code, router]);

  const startNew = async () => {
    setStatus("loading");
    setMessage("Membuat sesi baru…");
    setBusy(true);
    try {
      const { ok, data } = await callRedeem(code, true);
      if (!ok) {
        setStatus("error");
        setMessage(data.error || "Token tidak valid.");
        return;
      }
      router.replace(data.profileFilled ? "/test" : "/test/profile");
    } catch {
      setStatus("error");
      setMessage("Gagal menghubungi server. Coba ulang.");
    } finally {
      setBusy(false);
    }
  };

  const continueExisting = () => router.replace("/test");

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="brut-card max-w-md w-full text-center">
        <p className="text-xs font-black uppercase opacity-70 mb-1">Link Kelas</p>
        <p className="font-mono font-black text-2xl tracking-widest mb-4">{code}</p>

        {status === "loading" && (
          <p className="font-bold">{message}</p>
        )}

        {/* Sesi sebelumnya belum selesai — tanya mau lanjut atau buat baru */}
        {status === "resumed" && (
          <>
            <p className="font-black text-lg mb-2">Sesi Ditemukan</p>
            <p className="text-sm font-bold mb-4">
              Browser ini masih memiliki sesi atas nama{" "}
              <span className="underline">{resumedName}</span>.
            </p>
            <div className="flex flex-col gap-3">
              <button
                className="brut-btn brut-btn-black w-full"
                onClick={continueExisting}
                disabled={busy}
              >
                LANJUTKAN SEBAGAI {resumedName?.toUpperCase()}
              </button>
              <button
                className="brut-btn w-full"
                onClick={startNew}
                disabled={busy}
              >
                {busy ? "MEMPROSES…" : "MULAI SEBAGAI PESERTA BARU"}
              </button>
            </div>
          </>
        )}

        {/* Submission sebelumnya sudah selesai */}
        {status === "done" && (
          <>
            <p className="font-black text-lg mb-2">Sudah Selesai</p>
            <p className="text-sm font-bold mb-4">
              {resumedName ? (
                <>Tes untuk <span className="underline">{resumedName}</span> sudah selesai.</>
              ) : (
                "Tes pada browser ini sudah selesai."
              )}
            </p>
            <div className="flex flex-col gap-3">
              <button
                className="brut-btn brut-btn-black w-full"
                onClick={startNew}
                disabled={busy}
              >
                {busy ? "MEMPROSES…" : "MULAI SEBAGAI PESERTA BARU"}
              </button>
              <Link href="/" className="brut-btn w-full inline-block">
                KEMBALI
              </Link>
            </div>
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
