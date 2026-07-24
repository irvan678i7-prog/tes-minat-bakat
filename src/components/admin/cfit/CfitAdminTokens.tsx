"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

type CfitForm = "FORM_3A" | "FORM_3B" | "FORM_3AB";

type SubmissionRow = {
  id: string;
  fullName: string | null;
  age: number | null;
  grade: string | null;
  school: string | null;
  startedAt: string;
  finishedAt: string | null;
  violationCount: number;
  flaggedCheating: boolean;
  result: { rawScoreTotal: number; iq: number; classification: string } | null;
};

type TokenRow = {
  id: string;
  code: string;
  form: CfitForm;
  expiresAt: string;
  createdAt: string;
  redeemedAt: string | null;
  submissions: SubmissionRow[];
  participantCount: number;
  selesaiCount: number;
  mengerjakanCount: number;
};

const FORM_LABEL: Record<CfitForm, string> = {
  FORM_3A: "3A",
  FORM_3B: "3B",
  FORM_3AB: "3A + 3B",
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function CfitAdminTokens() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [counts, setCounts] = useState<{ totalToken: number; totalPeserta: number; selesai: number; mengerjakan: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<CfitForm>("FORM_3AB");
  const [count, setCount] = useState(1);
  const [ttlHours, setTtlHours] = useState(3);
  const [openToken, setOpenToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/cfit/tokens${showAll ? "?all=1" : ""}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal memuat token");
      return;
    }
    setTokens(data.tokens);
    setCounts(data.counts);
    setLoading(false);
  }, [showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    const res = await fetch("/api/admin/cfit/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form, count, ttlSec: ttlHours * 3600 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal membuat token");
    } else {
      toast.success(`${data.tokens.length} token CFIT dibuat`);
      await load();
    }
    setCreating(false);
  };

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code).catch(() => null);
    toast.success(`Token ${code} disalin`);
  };

  return (
    <div className="space-y-6">
      <div className="brut-card" style={{ background: "#22d3ee" }}>
        <h2 className="text-xl font-black uppercase mb-3">Buat Token CFIT</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-black uppercase mb-1">Bentuk Tes</label>
            <select className="brut-input w-full" value={form} onChange={(e) => setForm(e.target.value as CfitForm)}>
              <option value="FORM_3AB">3A + 3B (lengkap)</option>
              <option value="FORM_3A">3A saja</option>
              <option value="FORM_3B">3B saja</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase mb-1">Jumlah</label>
            <input
              className="brut-input w-full"
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))}
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase mb-1">Masa Berlaku</label>
            <select className="brut-input w-full" value={ttlHours} onChange={(e) => setTtlHours(Number(e.target.value))}>
              {[1, 2, 3, 6, 12, 24].map((h) => (
                <option key={h} value={h}>{h} jam</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button className="brut-btn brut-btn-black w-full" onClick={create} disabled={creating}>
              {creating ? "MEMBUAT..." : "BUAT TOKEN"}
            </button>
          </div>
        </div>
        <p className="text-xs font-semibold mt-2">
          1 token bisa dipakai banyak peserta (token kelas). Bentuk tes otomatis terdeteksi saat peserta memasukkan token di halaman <span className="font-black">/cfit</span>.
        </p>
      </div>

      {counts ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["Token", counts.totalToken],
            ["Peserta", counts.totalPeserta],
            ["Mengerjakan", counts.mengerjakan],
            ["Selesai", counts.selesai],
          ] as const).map(([l, v]) => (
            <div key={l} className="brut-card text-center" style={{ background: "#fff" }}>
              <div className="text-3xl font-black">{v}</div>
              <div className="text-xs font-black uppercase">{l}</div>
            </div>
          ))}
        </div>
      ) : null}

      <label className="brut-checkbox">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Tampilkan juga token kadaluarsa tanpa peserta
      </label>

      {loading ? (
        <div className="brut-card font-black uppercase brut-blink">Memuat...</div>
      ) : tokens.length === 0 ? (
        <div className="brut-card font-bold">Belum ada token CFIT.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="brut-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Bentuk</th>
                <th>Kadaluarsa</th>
                <th>Peserta</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <>
                  <tr key={t.id}>
                    <td className="font-mono font-black tracking-widest">{t.code}</td>
                    <td><span className="brut-tag text-xs">{FORM_LABEL[t.form]}</span></td>
                    <td className={new Date(t.expiresAt) < new Date() ? "line-through opacity-60" : ""}>{fmtDate(t.expiresAt)}</td>
                    <td className="font-bold">{t.participantCount}</td>
                    <td className="font-bold">
                      {t.participantCount === 0
                        ? new Date(t.expiresAt) < new Date() ? "KADALUARSA" : "BELUM DIPAKAI"
                        : `${t.selesaiCount} selesai / ${t.mengerjakanCount} mengerjakan`}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="brut-btn brut-btn-white text-xs px-2 py-1" style={{ boxShadow: "3px 3px 0 0 #000" }} onClick={() => copy(t.code)}>
                          SALIN
                        </button>
                        {t.participantCount > 0 ? (
                          <button
                            className="brut-btn brut-btn-cyan text-xs px-2 py-1"
                            style={{ boxShadow: "3px 3px 0 0 #000" }}
                            onClick={() => setOpenToken(openToken === t.id ? null : t.id)}
                          >
                            {openToken === t.id ? "TUTUP" : "DETAIL"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {openToken === t.id
                    ? t.submissions.map((s) => (
                        <tr key={s.id} style={{ background: "#fef9c3" }}>
                          <td colSpan={2} className="font-bold">↳ {s.fullName ?? "(tanpa nama)"}</td>
                          <td>{s.grade ?? "-"} {s.school ? `· ${s.school}` : ""}</td>
                          <td>{s.finishedAt ? "SELESAI" : "MENGERJAKAN"}</td>
                          <td className="font-bold">
                            {s.result ? `IQ ${s.result.iq} · ${s.result.classification}` : "-"}
                          </td>
                          <td>{s.flaggedCheating || s.violationCount >= 5 ? `⚠️ ${s.violationCount} pelanggaran` : ""}</td>
                        </tr>
                      ))
                    : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
