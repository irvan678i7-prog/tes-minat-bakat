"use client";

import { useEffect, useState, useTransition } from "react";
import toast from "react-hot-toast";

type Token = {
  id: string;
  code: string;
  testKind: "MINAT" | "BAKAT";
  expiresAt: string;
  createdAt: string;
  redeemedAt: string | null;
  submission: { id: string; fullName: string | null; finishedAt: string | null } | null;
};

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("id-ID");
}

function timeLeft(exp: string): string {
  const ms = +new Date(exp) - Date.now();
  if (ms <= 0) return "EXPIRED";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default function AdminTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [testKind, setTestKind] = useState<"MINAT" | "BAKAT">("BAKAT");
  const [count, setCount] = useState(1);
  const [ttlSec, setTtlSec] = useState(300);
  const [includeRedeemed, setIncludeRedeemed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [, setTick] = useState(0);

  const load = () =>
    fetch(`/api/admin/tokens${includeRedeemed ? "?all=1" : ""}`)
      .then((r) => r.json())
      .then((d) => setTokens(d.tokens || []));

  useEffect(() => {
    load();
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [includeRedeemed]);

  const generate = () =>
    startTransition(async () => {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testKind, count, ttlSec }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal generate");
        return;
      }
      toast.success(`${data.tokens.length} token dibuat`);
      load();
    });

  return (
    <div className="space-y-6">
      <div className="brut-card" style={{ background: "#a3e635" }}>
        <h2 className="text-2xl font-black uppercase mb-3">Generate Token</h2>
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-black uppercase block mb-1">Jenis Tes</label>
            <select
              className="brut-input w-full"
              value={testKind}
              onChange={(e) => setTestKind(e.target.value as "MINAT" | "BAKAT")}
            >
              <option value="BAKAT">BAKAT</option>
              <option value="MINAT">MINAT</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase block mb-1">Jumlah</label>
            <input
              type="number"
              min={1}
              max={100}
              className="brut-input w-full"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value || "1"))}
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase block mb-1">Berlaku (detik)</label>
            <input
              type="number"
              min={60}
              max={3600}
              className="brut-input w-full"
              value={ttlSec}
              onChange={(e) => setTtlSec(parseInt(e.target.value || "300"))}
            />
            <p className="text-xs font-bold mt-1">Default 300s = 5 menit</p>
          </div>
          <button onClick={generate} disabled={pending} className="brut-btn brut-btn-black">
            {pending ? "BUAT..." : "BUAT TOKEN"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-black uppercase">Daftar Token</h3>
        <label className="brut-checkbox">
          <input
            type="checkbox"
            checked={includeRedeemed}
            onChange={(e) => setIncludeRedeemed(e.target.checked)}
          />
          Tampilkan yang sudah dipakai
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="brut-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Tes</th>
              <th>Sisa</th>
              <th>Dibuat</th>
              <th>Status</th>
              <th>Peserta</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center font-bold py-6">
                  Belum ada token aktif.
                </td>
              </tr>
            )}
            {tokens.map((t) => {
              const tl = timeLeft(t.expiresAt);
              const expired = tl === "EXPIRED";
              const used = !!t.redeemedAt;
              return (
                <tr key={t.id}>
                  <td className="font-mono font-black">{t.code}</td>
                  <td>{t.testKind}</td>
                  <td className={expired ? "text-red-600 font-black" : "font-mono font-bold"}>{tl}</td>
                  <td>{fmt(t.createdAt)}</td>
                  <td>
                    {used ? (
                      <span className="brut-tag" style={{ background: "#22d3ee" }}>DIPAKAI</span>
                    ) : expired ? (
                      <span className="brut-tag" style={{ background: "#ff4d8d" }}>EXPIRED</span>
                    ) : (
                      <span className="brut-tag">AKTIF</span>
                    )}
                  </td>
                  <td>
                    {t.submission?.fullName || "—"}
                    {t.submission?.finishedAt && (
                      <span className="brut-tag ml-2" style={{ background: "#a3e635" }}>SELESAI</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
