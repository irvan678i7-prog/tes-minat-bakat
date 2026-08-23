"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Halaman pemulihan sesi. Dua mode:
//   - linkToken ada  → langsung pulihkan (link dari pengawas).
//   - linkToken null → tampilkan formulir: token kelas + Kode Lanjut + nama.

export default function LanjutForm({ linkToken }: { linkToken: string | null }) {
  const router = useRouter();
  const [classCode, setClassCode] = useState("");
  const [resumeCode, setResumeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(!!linkToken);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const submit = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Gagal melanjutkan sesi.");
        setBusy(false);
        return;
      }
      router.replace(data?.redirect || "/test");
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi internet.");
      setBusy(false);
    }
  };

  // Mode link pengawas: jalankan sekali saat halaman dibuka.
  useEffect(() => {
    if (!linkToken || autoTried.current) return;
    autoTried.current = true;
    void submit({ linkToken });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken]);

  if (linkToken) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md border-4 border-black bg-white p-6">
          <h1 className="text-2xl font-black uppercase tracking-tight">Memulihkan Sesi</h1>
          <p className="mt-2 text-sm font-bold">
            {busy ? "Mohon tunggu, sesi tes sedang dipulihkan…" : "Selesai."}
          </p>
          {error ? (
            <div className="mt-4 border-4 border-black bg-red-300 p-3 text-sm font-black uppercase">
              {error}
            </div>
          ) : null}
          {error ? (
            <a
              href="/lanjut"
              className="mt-4 inline-block border-4 border-black bg-yellow-300 px-4 py-2 text-sm font-black uppercase"
            >
              Coba cara manual
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md border-4 border-black bg-white p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Lanjutkan Tes</h1>
        <p className="mt-2 text-sm font-bold">
          Untuk peserta yang tesnya terputus (mati lampu, komputer restart, atau
          ganti komputer). Jawaban dan sisa waktu yang sudah tersimpan akan
          dikembalikan — tes TIDAK dimulai dari nol.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            void submit({ classCode, resumeCode, fullName });
          }}
        >
          <div>
            <label className="block text-xs font-black uppercase tracking-wide">
              Kode token kelas
            </label>
            <input
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              className="mt-1 w-full border-4 border-black px-3 py-2 font-black uppercase tracking-widest"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wide">
              Kode Lanjut
            </label>
            <input
              value={resumeCode}
              onChange={(e) => setResumeCode(e.target.value)}
              placeholder="ABC-DEF"
              autoComplete="off"
              className="mt-1 w-full border-4 border-black px-3 py-2 font-black uppercase tracking-widest"
            />
            <p className="mt-1 text-xs font-bold opacity-70">
              Kode ini tampil di halaman daftar subtes sebelum tes terputus.
              Kalau tidak tercatat, minta pengawas membuat link pemulihan.
            </p>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wide">
              Nama lengkap
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Sesuai yang diisi saat mulai tes"
              autoComplete="off"
              className="mt-1 w-full border-4 border-black px-3 py-2 font-bold"
            />
          </div>

          {error ? (
            <div className="border-4 border-black bg-red-300 p-3 text-sm font-black uppercase">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full border-4 border-black bg-yellow-300 px-4 py-3 text-base font-black uppercase tracking-wide disabled:opacity-50"
          >
            {busy ? "Memproses…" : "Lanjutkan Tes"}
          </button>
        </form>
      </div>
    </main>
  );
}
