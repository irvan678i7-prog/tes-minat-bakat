"use client";

import { useEffect, useState, useTransition, Fragment } from "react";
import toast from "react-hot-toast";

type PerSubtest = {
  code: string;
  name: string;
  total: number;
  answered: number;
  done: boolean;
};

type Progress = {
  completed: number;
  total: number;
  currentSubtest: string | null;
  lastActivityAt: string | null;
  perSubtest: PerSubtest[];
};

type Submission = {
  id: string;
  fullName: string | null;
  grade: string | null;
  school: string | null;
  startedAt: string;
  finishedAt: string | null;
  violationCount: number;
  flaggedCheating: boolean;
  progress: Progress | null;
};

type Token = {
  id: string;
  code: string;
  testKind: "MINAT" | "BAKAT";
  expiresAt: string;
  createdAt: string;
  redeemedAt: string | null;
  submission: Submission | null;
};

type Counts = {
  belumMulai: number;
  mengerjakan: number;
  selesai: number;
  expired: number;
  total: number;
};

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("id-ID");
}

function fmtShort(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function timeLeft(exp: string): string {
  const ms = +new Date(exp) - Date.now();
  if (ms <= 0) return "EXPIRED";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function timeAgo(dt: string | null): string {
  if (!dt) return "—";
  const ms = Date.now() - +new Date(dt);
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}d lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return new Date(dt).toLocaleString("id-ID");
}

function ViolationBadge({ count, flagged }: { count: number; flagged: boolean }) {
  if (flagged || count >= 5) {
    return (
      <span
        className="brut-tag"
        style={{ background: "#ef4444", color: "#fff" }}
        title="Siswa terdeteksi melanggar berkali-kali — perlu review manual"
      >
        ⚠ {count}
      </span>
    );
  }
  if (count > 0) {
    return (
      <span
        className="brut-tag"
        style={{ background: "#fb923c" }}
        title={`${count} pelanggaran terdeteksi (pindah tab/blur/copy-paste). Belum mencapai ambang batas.`}
      >
        {count}
      </span>
    );
  }
  return (
    <span
      className="brut-tag"
      style={{ background: "#a3e635" }}
      title="Tidak ada pelanggaran terdeteksi"
    >
      0
    </span>
  );
}

export default function AdminTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [counts, setCounts] = useState<Counts>({
    belumMulai: 0,
    mengerjakan: 0,
    selesai: 0,
    expired: 0,
    total: 0,
  });
  const [testKind, setTestKind] = useState<"MINAT" | "BAKAT">("BAKAT");
  const [count, setCount] = useState(1);
  const [ttlSec, setTtlSec] = useState(300);
  const [includeRedeemed, setIncludeRedeemed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/admin/tokens${includeRedeemed ? "?all=1" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setTokens(d.tokens || []);
        if (d.counts) setCounts(d.counts);
      });

  useEffect(() => {
    load();
    const tickId = setInterval(() => setTick((n) => n + 1), 1000);
    const reloadId = setInterval(load, 8000);
    return () => {
      clearInterval(tickId);
      clearInterval(reloadId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Status pengerjaan = semua submission (sedang mengerjakan + selesai),
  // urut: belum selesai dulu, lalu paling baru aktif.
  const statusRows = tokens
    .filter((t) => !!t.submission)
    .sort((a, b) => {
      const aDone = !!a.submission?.finishedAt;
      const bDone = !!b.submission?.finishedAt;
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aLast =
        a.submission?.progress?.lastActivityAt || a.submission?.startedAt || a.createdAt;
      const bLast =
        b.submission?.progress?.lastActivityAt || b.submission?.startedAt || b.createdAt;
      return +new Date(bLast) - +new Date(aLast);
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="brut-card" style={{ background: "#fde047" }}>
          <p className="text-xs font-black uppercase">Belum Mulai</p>
          <p className="text-3xl font-black">{counts.belumMulai}</p>
        </div>
        <div className="brut-card" style={{ background: "#fb923c" }}>
          <p className="text-xs font-black uppercase">Sedang Mengerjakan</p>
          <p className="text-3xl font-black">{counts.mengerjakan}</p>
        </div>
        <div className="brut-card" style={{ background: "#a3e635" }}>
          <p className="text-xs font-black uppercase">Selesai</p>
          <p className="text-3xl font-black">{counts.selesai}</p>
        </div>
        <div className="brut-card" style={{ background: "#fca5a5" }}>
          <p className="text-xs font-black uppercase">Expired (Belum Dipakai)</p>
          <p className="text-3xl font-black">{counts.expired}</p>
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
              <th>Pelanggaran</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center font-bold py-6">
                  Belum ada token aktif.
                </td>
              </tr>
            )}
            {tokens.map((t) => {
              const tl = timeLeft(t.expiresAt);
              const expired = tl === "EXPIRED";
              const used = !!t.redeemedAt;
              const sub = t.submission;
              const done = !!sub?.finishedAt;
              const prog = sub?.progress;
              return (
                <tr key={t.id}>
                  <td className="font-mono font-black">{t.code}</td>
                  <td>{t.testKind}</td>
                  <td className={expired ? "text-red-600 font-black" : "font-mono font-bold"}>{tl}</td>
                  <td>{fmt(t.createdAt)}</td>
                  <td>
                    {done ? (
                      <span className="brut-tag" style={{ background: "#a3e635" }}>SELESAI</span>
                    ) : sub ? (
                      <span className="brut-tag" style={{ background: "#fb923c" }}>MENGERJAKAN</span>
                    ) : expired ? (
                      <span className="brut-tag" style={{ background: "#ff4d8d" }}>EXPIRED</span>
                    ) : used ? (
                      <span className="brut-tag" style={{ background: "#22d3ee" }}>DIPAKAI</span>
                    ) : (
                      <span className="brut-tag">AKTIF</span>
                    )}
                  </td>
                  <td>
                    {sub ? (
                      <div className="flex flex-col gap-1">
                        <span className="font-bold">{sub.fullName || "(belum isi nama)"}</span>
                        {prog && (
                          <span className="text-xs font-mono opacity-80">
                            {prog.completed}/{prog.total} subtes
                            {!done && prog.currentSubtest ? ` · ${prog.currentSubtest}` : ""}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </td>
                  <td>{sub ? <ViolationBadge count={sub.violationCount} flagged={sub.flaggedCheating} /> : <span className="opacity-50">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-8">
        <h3 className="text-2xl font-black uppercase">Status Pengerjaan</h3>
        <span className="text-xs font-bold opacity-70">Auto-refresh tiap 8 detik</span>
      </div>

      <div className="overflow-x-auto">
        <table className="brut-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kelas / Sekolah</th>
              <th>Token</th>
              <th>Tes</th>
              <th>Progres</th>
              <th>Subtes Sekarang</th>
              <th>Aktif Terakhir</th>
              <th>Mulai</th>
              <th>Selesai</th>
              <th>Pelanggaran</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {statusRows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center font-bold py-6">
                  Belum ada siswa yang mengerjakan.
                </td>
              </tr>
            )}
            {statusRows.map((t) => {
              const sub = t.submission!;
              const prog = sub.progress;
              const done = !!sub.finishedAt;
              const percent =
                prog && prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
              const isOpen = expandedId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr>
                    <td className="font-bold">{sub.fullName || "(belum isi nama)"}</td>
                    <td>
                      {sub.grade || sub.school ? (
                        <span className="text-xs">
                          {[sub.grade, sub.school].filter(Boolean).join(" · ")}
                        </span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td className="font-mono">{t.code}</td>
                    <td>{t.testKind}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            flex: 1,
                            height: 12,
                            border: "2px solid #000",
                            background: "#fff",
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              width: `${percent}%`,
                              height: "100%",
                              background: done ? "#a3e635" : "#fb923c",
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono font-bold whitespace-nowrap">
                          {prog?.completed ?? 0}/{prog?.total ?? 0}
                        </span>
                      </div>
                    </td>
                    <td>
                      {done ? (
                        <span className="brut-tag" style={{ background: "#a3e635" }}>SELESAI</span>
                      ) : (
                        <span className="text-xs">{prog?.currentSubtest || "—"}</span>
                      )}
                    </td>
                    <td className="text-xs">{timeAgo(prog?.lastActivityAt ?? null)}</td>
                    <td className="text-xs">{fmtShort(sub.startedAt)}</td>
                    <td className="text-xs">{fmtShort(sub.finishedAt)}</td>
                    <td><ViolationBadge count={sub.violationCount} flagged={sub.flaggedCheating} /></td>
                    <td>
                      <button
                        className="brut-btn"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => setExpandedId(isOpen ? null : t.id)}
                      >
                        {isOpen ? "TUTUP" : "DETAIL"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && prog && (
                    <tr>
                      <td colSpan={11} style={{ background: "#f5f5f5" }}>
                        <div className="p-3">
                          <p className="text-xs font-black uppercase mb-2">Per Subtes</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {prog.perSubtest.map((p) => {
                              const sp =
                                p.total > 0 ? Math.round((p.answered / p.total) * 100) : 0;
                              return (
                                <div
                                  key={p.code}
                                  className="flex items-center gap-2 p-2"
                                  style={{ border: "2px solid #000", background: "#fff" }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <p className="text-xs font-bold leading-tight">{p.name}</p>
                                    <div
                                      style={{
                                        height: 8,
                                        border: "1.5px solid #000",
                                        background: "#fff",
                                        marginTop: 4,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: `${sp}%`,
                                          height: "100%",
                                          background: p.done ? "#a3e635" : "#fb923c",
                                        }}
                                      />
                                    </div>
                                  </div>
                                  <span className="text-xs font-mono font-bold">
                                    {p.answered}/{p.total}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
