"use client";

import { useEffect, useMemo, useState, useTransition, Fragment } from "react";
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
  progress: Progress;
};

type Token = {
  id: string;
  code: string;
  testKind: "MINAT" | "BAKAT";
  expiresAt: string;
  createdAt: string;
  redeemedAt: string | null;
  submissions: Submission[];
  participantCount: number;
  selesaiCount: number;
  mengerjakanCount: number;
  flaggedCount: number;
  lastActivityAt: string | null;
};

type Counts = {
  belumMulai: number;
  mengerjakan: number;
  selesai: number;
  expired: number;
  totalToken: number;
  totalPeserta: number;
};

// Render selalu di zona Asia/Jakarta (WIB) supaya konsisten dengan waktu
// siswa di Indonesia — bukan waktu server (UTC).
function fmt(dt: string | null): string {
  if (!dt) return "—";
  return (
    new Date(dt).toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB"
  );
}

function fmtShort(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
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

// Interval auto-refresh untuk fetch ke server (peserta baru, progres, dst.)
// 2 detik = cukup real-time tanpa membebani server. Tick UI (countdown, "x
// detik lalu") tetap di 1 detik supaya angka bergerak halus.
const RELOAD_INTERVAL_MS = 2000;

export default function AdminTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [counts, setCounts] = useState<Counts>({
    belumMulai: 0,
    mengerjakan: 0,
    selesai: 0,
    expired: 0,
    totalToken: 0,
    totalPeserta: 0,
  });
  const [testKind, setTestKind] = useState<"MINAT" | "BAKAT">("BAKAT");
  const [count, setCount] = useState(1);
  const [ttlSec, setTtlSec] = useState(300);
  const [includeRedeemed, setIncludeRedeemed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [, setTick] = useState(0);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number>(0);
  // window.location.origin di-baca lazy saat user klik tombol SALIN LINK,
  // bukan disimpan ke state — supaya tidak memicu re-render dari useEffect.
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = () =>
    fetch(`/api/admin/tokens${includeRedeemed ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setTokens(d.tokens || []);
        if (d.counts) setCounts(d.counts);
        setLastSync(Date.now());
      })
      .catch(() => {
        /* swallow: polling akan retry siklus berikutnya */
      });

  useEffect(() => {
    load();
    const tickId = setInterval(() => setTick((n) => n + 1), 1000);
    // Reload tiap 2 detik supaya peserta baru, progres, dan status selesai
    // tampil mendekati real-time tanpa admin harus refresh manual.
    const reloadId = setInterval(load, RELOAD_INTERVAL_MS);
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

  // Status pengerjaan: flatten semua submission dari semua token ke 1 list.
  // Urut: belum selesai dulu, lalu paling baru aktif. Tiap baris = 1 peserta.
  type Row = { token: Token; sub: Submission };
  const statusRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    for (const t of tokens) {
      for (const s of t.submissions) rows.push({ token: t, sub: s });
    }
    rows.sort((a, b) => {
      const aDone = !!a.sub.finishedAt;
      const bDone = !!b.sub.finishedAt;
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aLast = a.sub.progress.lastActivityAt || a.sub.startedAt;
      const bLast = b.sub.progress.lastActivityAt || b.sub.startedAt;
      return +new Date(bLast) - +new Date(aLast);
    });
    return rows;
  }, [tokens]);

  const copyLink = async (code: string) => {
    const link = `${origin || ""}/k/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link kelas disalin");
    } catch {
      toast.error("Gagal menyalin — copy manual: " + link);
    }
  };

  const lastSyncLabel = lastSync ? timeAgo(new Date(lastSync).toISOString()) : "—";

  return (
    <div className="space-y-6">
      <div className="brut-card" style={{ background: "#a3e635" }}>
        <h2 className="text-2xl font-black uppercase mb-3">Generate Token Kelas</h2>
        <p className="text-xs font-bold mb-3 opacity-80">
          Satu token bisa dipakai BANYAK siswa selama belum kadaluarsa. Share 1 link/kode ke grup
          kelas — semua peserta otomatis terdaftar dengan submission masing-masing.
        </p>
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
            <label className="text-xs font-black uppercase block mb-1">Jumlah Token</label>
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
            <p className="text-xs font-bold mt-1">Default 300s = 5 menit · max 1 jam</p>
          </div>
          <button onClick={generate} disabled={pending} className="brut-btn brut-btn-black">
            {pending ? "BUAT..." : "BUAT TOKEN"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="brut-card" style={{ background: "#fde047" }}>
          <p className="text-xs font-black uppercase">Token Kosong</p>
          <p className="text-3xl font-black">{counts.belumMulai}</p>
          <p className="text-xs font-bold opacity-70">aktif · belum ada peserta</p>
        </div>
        <div className="brut-card" style={{ background: "#fb923c" }}>
          <p className="text-xs font-black uppercase">Sedang Mengerjakan</p>
          <p className="text-3xl font-black">{counts.mengerjakan}</p>
          <p className="text-xs font-bold opacity-70">peserta aktif</p>
        </div>
        <div className="brut-card" style={{ background: "#a3e635" }}>
          <p className="text-xs font-black uppercase">Selesai</p>
          <p className="text-3xl font-black">{counts.selesai}</p>
          <p className="text-xs font-bold opacity-70">peserta tuntas</p>
        </div>
        <div className="brut-card" style={{ background: "#fca5a5" }}>
          <p className="text-xs font-black uppercase">Expired Kosong</p>
          <p className="text-3xl font-black">{counts.expired}</p>
          <p className="text-xs font-bold opacity-70">token mati, tanpa peserta</p>
        </div>
        <div className="brut-card" style={{ background: "#22d3ee" }}>
          <p className="text-xs font-black uppercase">Total Peserta</p>
          <p className="text-3xl font-black">{counts.totalPeserta}</p>
          <p className="text-xs font-bold opacity-70">di {counts.totalToken} token</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-2xl font-black uppercase">Daftar Token</h3>
        <div className="flex items-center gap-4">
          <span
            className="text-xs font-bold"
            style={{
              padding: "4px 8px",
              border: "2px solid #000",
              background: "#fff",
            }}
            title={`Polling tiap ${RELOAD_INTERVAL_MS / 1000} detik`}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            LIVE · sync {lastSyncLabel}
          </span>
          <label className="brut-checkbox">
            <input
              type="checkbox"
              checked={includeRedeemed}
              onChange={(e) => setIncludeRedeemed(e.target.checked)}
            />
            Tampilkan token kadaluarsa (kosong)
          </label>
        </div>
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
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center font-bold py-6">
                  Belum ada token aktif.
                </td>
              </tr>
            )}
            {tokens.map((t) => {
              const tl = timeLeft(t.expiresAt);
              const expired = tl === "EXPIRED";
              const hasParticipants = t.participantCount > 0;
              const allDone = hasParticipants && t.mengerjakanCount === 0;
              const expanded = expandedToken === t.id;
              return (
                <Fragment key={t.id}>
                  <tr>
                    <td className="font-mono font-black">{t.code}</td>
                    <td>{t.testKind}</td>
                    <td className={expired ? "text-red-600 font-black" : "font-mono font-bold"}>
                      {tl}
                    </td>
                    <td className="text-xs">{fmt(t.createdAt)}</td>
                    <td>
                      {!hasParticipants && expired ? (
                        <span className="brut-tag" style={{ background: "#ff4d8d" }}>
                          EXPIRED
                        </span>
                      ) : !hasParticipants ? (
                        <span className="brut-tag">AKTIF</span>
                      ) : allDone ? (
                        <span className="brut-tag" style={{ background: "#a3e635" }}>
                          SELESAI · {t.selesaiCount}
                        </span>
                      ) : (
                        <span className="brut-tag" style={{ background: "#fb923c" }}>
                          MENGERJAKAN · {t.mengerjakanCount}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <span className="font-black text-lg leading-tight">
                          {t.participantCount} orang
                        </span>
                        {hasParticipants && (
                          <span className="text-xs font-mono opacity-80">
                            {t.selesaiCount} selesai · {t.mengerjakanCount} mengerjakan
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {t.flaggedCount > 0 ? (
                        <span
                          className="brut-tag"
                          style={{ background: "#ef4444", color: "#fff" }}
                          title={`${t.flaggedCount} peserta terdeteksi melanggar / di-flag`}
                        >
                          ⚠ {t.flaggedCount}
                        </span>
                      ) : (
                        <span className="brut-tag" style={{ background: "#a3e635" }}>
                          0
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <button
                          className="brut-btn"
                          style={{ padding: "4px 8px", fontSize: 11 }}
                          onClick={() => copyLink(t.code)}
                          disabled={expired && !hasParticipants}
                          title="Salin link kelas untuk dibagikan ke grup"
                        >
                          SALIN LINK
                        </button>
                        {hasParticipants && (
                          <button
                            className="brut-btn"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => setExpandedToken(expanded ? null : t.id)}
                          >
                            {expanded ? "TUTUP" : `DETAIL (${t.participantCount})`}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && hasParticipants && (
                    <tr>
                      <td colSpan={8} style={{ background: "#f5f5f5" }}>
                        <div className="p-3 space-y-2">
                          <p className="text-xs font-black uppercase">
                            Daftar Peserta · {t.participantCount} orang
                          </p>
                          <table className="brut-table" style={{ background: "#fff" }}>
                            <thead>
                              <tr>
                                <th>Nama</th>
                                <th>Kelas / Sekolah</th>
                                <th>Progres</th>
                                <th>Mulai</th>
                                <th>Selesai</th>
                                <th>Pelanggaran</th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.submissions.map((s) => {
                                const prog = s.progress;
                                const done = !!s.finishedAt;
                                const percent =
                                  prog.total > 0
                                    ? Math.round((prog.completed / prog.total) * 100)
                                    : 0;
                                return (
                                  <tr key={s.id}>
                                    <td className="font-bold">{s.fullName || "(belum isi nama)"}</td>
                                    <td className="text-xs">
                                      {[s.grade, s.school].filter(Boolean).join(" · ") || "—"}
                                    </td>
                                    <td style={{ minWidth: 160 }}>
                                      <div className="flex items-center gap-2">
                                        <div
                                          style={{
                                            flex: 1,
                                            height: 10,
                                            border: "2px solid #000",
                                            background: "#fff",
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
                                          {prog.completed}/{prog.total}
                                        </span>
                                      </div>
                                      {!done && prog.currentSubtest && (
                                        <span className="text-xs opacity-70">
                                          {prog.currentSubtest}
                                        </span>
                                      )}
                                    </td>
                                    <td className="text-xs">{fmtShort(s.startedAt)}</td>
                                    <td className="text-xs">{fmtShort(s.finishedAt)}</td>
                                    <td>
                                      <ViolationBadge
                                        count={s.violationCount}
                                        flagged={s.flaggedCheating}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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

      <div className="flex items-center justify-between mt-8">
        <h3 className="text-2xl font-black uppercase">Status Pengerjaan (Per Peserta)</h3>
        <span className="text-xs font-bold opacity-70">
          Auto-refresh tiap {RELOAD_INTERVAL_MS / 1000} detik · sync {lastSyncLabel}
        </span>
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
            </tr>
          </thead>
          <tbody>
            {statusRows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center font-bold py-6">
                  Belum ada siswa yang mengerjakan.
                </td>
              </tr>
            )}
            {statusRows.map(({ token: t, sub }) => {
              const prog = sub.progress;
              const done = !!sub.finishedAt;
              const percent =
                prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
              return (
                <tr key={sub.id}>
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
                        {prog.completed}/{prog.total}
                      </span>
                    </div>
                  </td>
                  <td>
                    {done ? (
                      <span className="brut-tag" style={{ background: "#a3e635" }}>
                        SELESAI
                      </span>
                    ) : (
                      <span className="text-xs">{prog.currentSubtest || "—"}</span>
                    )}
                  </td>
                  <td className="text-xs">{timeAgo(prog.lastActivityAt)}</td>
                  <td className="text-xs">{fmtShort(sub.startedAt)}</td>
                  <td className="text-xs">{fmtShort(sub.finishedAt)}</td>
                  <td>
                    <ViolationBadge count={sub.violationCount} flagged={sub.flaggedCheating} />
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
