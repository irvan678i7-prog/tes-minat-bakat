"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Halaman pemulihan sesi. Dua mode:
//   - linkToken ada  → langsung pulihkan (link dari pengawas).
//   - linkToken null → tampilkan formulir: kode token + Kode Lanjut + nama.
//
// Melayani KEDUA tes. Sesi tes IQ (CFIT) tinggal di tabel lain dengan cookie
// lain, jadi endpoint pemulihannya juga berbeda — tapi bagi siswa halamannya
// tetap satu: /lanjut.

type Kind = "minat" | "cfit";

export default function LanjutForm({
  linkToken,
  kind = "minat",
}: {
  linkToken: string | null;
  kind?: Kind;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Kind>(kind);
  const [classCode, setClassCode] = useState("");
  const [resumeCode, setResumeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(!!linkToken);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  // Buang ?t=... dari bilah alamat begitu halaman terbuka. Token pemulihan
  // melewati verifikasi nama, jadi jangan sampai tertinggal di riwayat
  // browser komputer lab yang dipakai siswa berikutnya. replaceState tidak
  // memuat ulang halaman, jadi proses pemulihan yang sedang jalan tidak
  // terganggu.
  useEffect(() => {
    if (!linkToken || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("t")) return;
      url.searchParams.delete("t");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Browser tua tanpa history API — abaikan, bukan hal fatal.
    }
  }, [linkToken]);

  const submit = async (target: Kind, body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        target === "cfit" ? "/api/cfit/resume" : "/api/student/resume",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Gagal melanjutkan sesi.");
        setBusy(false);
        return;
      }
      router.replace(data?.redirect || (target === "cfit" ? "/cfit/test" : "/test"));
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi internet.");
      setBusy(false);
    }
  };

  // Mode link pengawas: jalankan sekali saat halaman dibuka.
  useEffect(() => {
    if (!linkToken || autoTried.current) return;
    autoTried.current = true;
    void submit(kind, { linkToken });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken, kind]);

  if (linkToken) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md border-4 border-black bg-white p-6">
          <h1 className="text-2xl font-black uppercase tracking-tight">Memulihkan Sesi</h1>
          <p className="mt-2 text-sm font-bold">
            {busy ? "Mohon tunggu, sesi tes sedang dipulihkan\u2026" : "Selesai."}
          </p>
          {error ? (
            <div className="mt-4 border-4 border-black bg-red-300 p-3 text-sm font-black uppercase">
              {error}
            </div>
          ) : null}
          {error ? (
            <a
              href={kind === "cfit" ? "/lanjut?k=cfit" : "/lanjut"}
              className="mt-4 inline-block border-4 border-black bg-yellow-300 px-4 py-2 text-sm font-black uppercase"
            >
              Coba cara manual
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  const isCfit = mode === "cfit";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md border-4 border-black bg-white p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Lanjutkan Tes</h1>
        <p className="mt-2 text-sm font-bold">
          Untuk peserta yang tesnya terputus (mati lampu, komputer restart, atau
          ganti komputer). Jawaban dan sisa waktu yang sudah tersimpan akan
          dikembalikan — tes TIDAK dimulai dari nol.
        </p>

        {/* Pemilih jenis tes. Sesi tes IQ tinggal di tabel & cookie yang
            berbeda, jadi siswa harus memberi tahu yang mana. */}
        <div className="mt-5">
          <span className="block text-xs font-black uppercase tracking-wide">
            Tes yang terputus
          </span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("minat")}
              className={`border-4 border-black px-3 py-2 text-xs font-black uppercase ${
                isCfit ? "bg-white" : "bg-yellow-300"
              }`}
            >
              Minat / Bakat
            </button>
            <button
              type="button"
              onClick={() => setMode("cfit")}
              className={`border-4 border-black px-3 py-2 text-xs font-black uppercase ${
                isCfit ? "bg-cyan-300" : "bg-white"
              }`}
            >
              Tes IQ
            </button>
          </div>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            // Nama field-nya beda antar endpoint: minat-bakat memakai
            // classCode, tes IQ memakai code.
            void submit(
              mode,
              isCfit
                ? { code: classCode, resumeCode, fullName }
                : { classCode, resumeCode, fullName },
            );
          }}
        >
          <div>
            <label className="block text-xs font-black uppercase tracking-wide">
              {isCfit ? "Kode token tes IQ" : "Kode token kelas"}
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
              {isCfit
                ? "Kode ini tampil di banner halaman tes IQ sebelum tes terputus."
                : "Kode ini tampil di halaman aturan & daftar subtes sebelum tes terputus."}{" "}
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
            {busy ? "Memproses\u2026" : "Lanjutkan Tes"}
          </button>
        </form>
      </div>
    </main>
  );
}
