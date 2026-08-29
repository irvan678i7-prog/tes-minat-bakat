"use client";

import { useCallback, useEffect, useState } from "react";

// PEMULIHAN SESI — halaman pengawas untuk sesi tes yang terputus.
// Cari nama peserta → klik BUAT LINK → kirim link ke komputer peserta.
// Link berumur 30 menit, SEKALI PAKAI, dan langsung mengembalikan sesi lama
// (jawaban serta sisa waktu subtes tetap utuh).
//
// Sejak audit #1, halaman ini juga melayani tes IQ (CFIT), bukan hanya
// minat-bakat. Sejak audit #5, token link tidak lagi bisa dipakai berulang.

type Kind = "MINAT_BAKAT" | "CFIT";
type Filter = "ALL" | Kind;

type Session = {
  id: string;
  kind: Kind;
  fullName: string | null;
  school: string | null;
  grade: string | null;
  testKind: string;
  startedAt: string | null;
  resumeCode: string | null;
  tokenCode: string | null;
  answered: number;
};

const FILTERS: Array<[Filter, string]> = [
  ["ALL", "Semua"],
  ["MINAT_BAKAT", "Minat / Bakat"],
  ["CFIT", "Tes IQ"],
];

export default function PemulihanPage() {
  const [q, setQ] = useState("");
  const [tokenCode, setTokenCode] = useState("");
  const [kindFilter, setKindFilter] = useState<Filter>("ALL");
  const [rows, setRows] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cfitUnavailable, setCfitUnavailable] = useState(false);
  const [link, setLink] = useState<{
    id: string;
    url: string;
    name: string | null;
    kind: Kind;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (tokenCode.trim()) params.set("tokenCode", tokenCode.trim());
      if (kindFilter !== "ALL") params.set("kind", kindFilter);
      const res = await fetch(`/api/admin/resume-link?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Gagal memuat daftar sesi.");
        setRows([]);
      } else {
        setRows(data?.sessions ?? []);
        setCfitUnavailable(!!data?.cfitUnavailable);
      }
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setLoading(false);
    }
  }, [q, tokenCode, kindFilter]);

  useEffect(() => {
    void load();
    // Muat sekali saat halaman dibuka; pencarian dijalankan lewat tombol.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const makeLink = async (row: Session) => {
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/resume-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: row.id, kind: row.kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Gagal membuat link pemulihan.");
        return;
      }
      setLink({ id: row.id, url: data.url, name: row.fullName, kind: row.kind });
      void load();
    } catch {
      setError("Tidak bisa menghubungi server.");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-black uppercase tracking-tight">Pemulihan Sesi Tes</h1>
      <p className="mt-2 max-w-3xl text-sm font-bold">
        Untuk peserta yang tesnya terputus — mati lampu, komputer restart, atau
        ganti komputer sehingga cookie sesinya hilang. Buat link pemulihan lalu
        buka link itu di komputer peserta: jawaban dan sisa waktu subtes tetap
        utuh, tes TIDAK dimulai dari nol. Berlaku untuk minat-bakat maupun tes IQ.
      </p>
      <div className="mt-3 max-w-3xl border-4 border-black bg-orange-200 p-3 text-sm font-bold">
        Link berlaku 30 menit dan <span className="font-black uppercase">hanya bisa dipakai sekali</span>.
        Begitu satu komputer memakainya, link itu mati — jangan sebar ke grup WA,
        karena pemakai pertama langsung masuk ke sesi peserta ini tanpa verifikasi
        nama. Kalau salah kirim, cukup buat link baru. Untuk peserta yang masih
        ingat <span className="font-black uppercase">Kode Lanjut</span>-nya, arahkan
        saja ke halaman /lanjut: jalur itu memverifikasi nama dan bisa dipakai
        berulang.
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 border-4 border-black bg-white p-4">
        <div>
          <label className="block text-xs font-black uppercase">Jenis tes</label>
          <div className="mt-1 flex flex-wrap gap-0">
            {FILTERS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className="border-4 border-black px-3 py-2 text-xs font-black uppercase"
                style={{
                  background:
                    kindFilter === k ? "#000" : k === "CFIT" ? "#a5f3fc" : "#fff",
                  color: kindFilter === k ? "#fff" : "#000",
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-black uppercase">Cari nama</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="nama peserta"
            className="mt-1 border-4 border-black px-3 py-2 font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase">Token kelas</label>
          <input
            value={tokenCode}
            onChange={(e) => setTokenCode(e.target.value)}
            placeholder="XXXX-XXXX"
            className="mt-1 border-4 border-black px-3 py-2 font-black uppercase tracking-widest"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="border-4 border-black bg-yellow-300 px-4 py-2 text-sm font-black uppercase"
        >
          Cari
        </button>
      </div>

      {cfitUnavailable ? (
        <div className="mt-4 border-4 border-black bg-orange-300 p-3 text-sm font-bold">
          <span className="font-black uppercase">Sesi tes IQ belum bisa dipulihkan.</span>{" "}
          Kolom Kode Lanjut untuk CFIT belum ada di database. Apply{" "}
          <code>prisma/sql/0009_cfit_pause_and_resume.sql</code> lalu muat ulang
          halaman ini.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 border-4 border-black bg-red-300 p-3 text-sm font-black uppercase">
          {error}
        </div>
      ) : null}

      {link ? (
        <div className="mt-4 border-4 border-black bg-green-200 p-4">
          <div className="text-xs font-black uppercase">
            Link pemulihan untuk {link.name || "peserta"}{" "}
            ({link.kind === "CFIT" ? "tes IQ" : "minat / bakat"}) — 30 menit, sekali pakai
          </div>
          <div className="mt-2 break-all border-4 border-black bg-white p-2 text-xs font-bold">
            {link.url}
          </div>
          <button
            type="button"
            onClick={() => void copy(link.url)}
            className="mt-2 border-4 border-black bg-white px-3 py-1 text-xs font-black uppercase"
          >
            {copied ? "Tersalin" : "Salin link"}
          </button>
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto border-4 border-black bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black text-white">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Nama</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Tes</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Token</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Kode Lanjut</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Jawaban</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Mulai</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 font-bold" colSpan={7}>Memuat…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 font-bold" colSpan={7}>
                  Tidak ada sesi yang belum selesai.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.kind}:${r.id}`} className="border-t-2 border-black">
                  <td className="px-3 py-2 font-bold">
                    {r.fullName || "(belum isi data diri)"}
                    <div className="text-xs opacity-70">
                      {[r.school, r.grade].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="border-4 border-black px-2 py-1 text-xs font-black uppercase"
                      style={{ background: r.kind === "CFIT" ? "#a5f3fc" : "#fde047" }}
                    >
                      {r.testKind}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.tokenCode || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.resumeCode || "—"}</td>
                  <td className="px-3 py-2 font-bold">{r.answered}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.startedAt ? new Date(r.startedAt).toLocaleString("id-ID") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void makeLink(r)}
                      className="border-4 border-black px-3 py-1 text-xs font-black uppercase"
                      style={{ background: r.kind === "CFIT" ? "#22d3ee" : "#fde047" }}
                    >
                      Buat link
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
