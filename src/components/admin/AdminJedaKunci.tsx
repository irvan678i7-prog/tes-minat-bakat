"use client";

import { useCallback, useEffect, useState } from "react";

// REKAP JEDA & BUKA KUNCI (audit #7 dan #8).
//
// Satu tab untuk dua kebutuhan yang selalu muncul bersamaan di lapangan:
// melihat siapa yang lama menghilang dari halaman tes, lalu memutuskan apakah
// subtesnya perlu dibuka kembali.

type Kind = "MINAT_BAKAT" | "CFIT";

type SubtestRow = {
  subtestId: string;
  code: string;
  name: string;
  durationSec: number;
  consumedSec: number;
  remainingSec: number;
  pausedSec: number;
  pauseCount: number;
  finishReason: string | null;
  locked: boolean;
  startedAt: string | null;
  lastSeenAt: string | null;
};

type SessionRow = {
  id: string;
  kind: Kind;
  fullName: string | null;
  school: string | null;
  grade: string | null;
  label: string;
  tokenCode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  violationCount: number;
  flaggedCheating: boolean;
  totalPausedSec: number;
  totalPauseCount: number;
  lockedCount: number;
  subtests: SubtestRow[];
};

type Report = {
  kind: Kind;
  sessions: SessionRow[];
  pauseBudgetSec: number;
  pauseColumnsMissing: boolean;
  unavailable: boolean;
};

function fmtSec(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r} dtk`;
  if (r === 0) return `${m} mnt`;
  return `${m} mnt ${r} dtk`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminJedaKunci() {
  const [kind, setKind] = useState<Kind>("MINAT_BAKAT");
  const [q, setQ] = useState("");
  const [tokenCode, setTokenCode] = useState("");
  const [sort, setSort] = useState<"paused" | "recent">("paused");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [extraMin, setExtraMin] = useState(5);
  const [reopenSession, setReopenSession] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ kind, sort });
      if (q.trim()) params.set("q", q.trim());
      if (tokenCode.trim()) params.set("tokenCode", tokenCode.trim());
      const res = await fetch(`/api/admin/pause-report?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Gagal memuat rekap jeda.");
        setData(null);
      } else {
        setData(json as Report);
      }
    } catch {
      setError("Tidak bisa menghubungi server.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [kind, q, tokenCode, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const unlock = async (session: SessionRow, sub: SubtestRow) => {
    const label = `${sub.code} — ${session.fullName ?? "tanpa nama"}`;
    if (
      !window.confirm(
        `Buka kunci ${label} dan beri waktu tambahan ${extraMin} menit?\n\n` +
          "Tindakan ini mengubah waktu ujian dan tercatat di log server.",
      )
    ) {
      return;
    }
    const key = `${session.id}:${sub.code}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/subtest-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: session.kind,
          submissionId: session.id,
          subtestCode: sub.code,
          extraSec: Math.max(60, Math.min(3600, Math.round(extraMin * 60))),
          reopenSession,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(json?.error || "Gagal membuka kunci subtes.");
      } else {
        const extras: string[] = [];
        if (json?.sessionReopened) extras.push("sesi dibuka kembali");
        if (json?.sessionStillFinished) {
          extras.push(
            "PERHATIAN: sesi ini sudah ditutup, siswa belum bisa masuk sebelum sesi dibuka kembali",
          );
        }
        if (json?.partial) {
          extras.push(
            "kunci dibuka, tapi sisa waktu belum bisa diatur karena migrasi kolom jeda belum di-apply",
          );
        }
        setNotice(
          `✓ ${sub.code} dibuka, waktu tambahan ${extraMin} menit` +
            (extras.length ? ` — ${extras.join("; ")}` : ""),
        );
        await load();
      }
    } catch {
      setNotice("Tidak bisa menghubungi server.");
    } finally {
      setBusyKey(null);
    }
  };

  const budget = data?.pauseBudgetSec ?? 0;

  return (
    <div>
      <div className="brut-card mb-4" style={{ background: "#fef9c3" }}>
        <h2 className="text-xl font-black uppercase mb-1">Jeda &amp; Kunci Subtes</h2>
        <p className="text-sm font-semibold leading-relaxed">
          Timer sadar-jeda memberi tiap subtes jatah jeda{" "}
          <strong>{budget ? fmtSec(budget) : "—"}</strong>, supaya mati lampu tidak
          memakan waktu ujian. Konsekuensinya: kalau siswa <strong>menutup tab</strong>,
          anti-cheat tidak mencatat apa pun — pencatatan pindah-tab butuh halaman yang
          masih hidup. Jadi jatah itu juga jendela yang bisa dipakai membuka catatan.
          Daftar di bawah diurutkan dari <strong>jeda terpanjang</strong> supaya celah
          itu tetap terlihat.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label className="block text-xs font-black uppercase">Jenis tes</label>
          <div className="flex gap-0">
            {([
              ["MINAT_BAKAT", "Minat / Bakat"],
              ["CFIT", "Tes IQ"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`brut-btn ${kind === k ? "brut-btn-black" : "brut-btn-white"} text-xs`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-black uppercase">Nama siswa</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="cari nama"
            className="border-4 border-black px-2 py-1 font-bold text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase">Token</label>
          <input
            value={tokenCode}
            onChange={(e) => setTokenCode(e.target.value)}
            placeholder="XXXX-XXXX"
            className="border-4 border-black px-2 py-1 font-black uppercase text-sm w-40"
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase">Urutkan</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value === "recent" ? "recent" : "paused")}
            className="border-4 border-black px-2 py-1 font-bold text-sm"
          >
            <option value="paused">Jeda terpanjang</option>
            <option value="recent">Paling baru</option>
          </select>
        </div>
        <button type="button" onClick={() => void load()} className="brut-btn brut-btn-black text-xs">
          {loading ? "MEMUAT…" : "MUAT ULANG"}
        </button>
      </div>

      <div className="brut-card mb-4" style={{ background: "#e0f2fe" }}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-black uppercase">
            Waktu tambahan saat membuka kunci
            <input
              type="number"
              min={1}
              max={60}
              value={extraMin}
              onChange={(e) => setExtraMin(Number(e.target.value) || 5)}
              className="ml-2 w-20 border-4 border-black px-2 py-1 font-black"
            />
            <span className="ml-1">menit</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-black uppercase">
            <input
              type="checkbox"
              checked={reopenSession}
              onChange={(e) => setReopenSession(e.target.checked)}
            />
            Buka juga sesi yang sudah tertutup
          </label>
        </div>
      </div>

      {data?.unavailable ? (
        <div className="brut-card mb-4" style={{ background: "#fecaca" }}>
          <strong className="font-black uppercase">Data belum tersedia.</strong> Tabel atau
          kolom yang dibutuhkan belum ada di database. Apply migrasi di{" "}
          <code>prisma/sql/</code> lalu muat ulang.
        </div>
      ) : null}
      {data?.pauseColumnsMissing ? (
        <div className="brut-card mb-4" style={{ background: "#fed7aa" }}>
          <strong className="font-black uppercase">Angka jeda masih 0.</strong> Kolom
          timer sadar-jeda belum ada di database, jadi jeda belum tercatat. Apply{" "}
          <code>0007_subtestprogress_pause_columns.sql</code>
          {kind === "CFIT" ? " dan 0009_cfit_pause_and_resume.sql" : ""}.
        </div>
      ) : null}
      {error ? (
        <div className="brut-card mb-4" style={{ background: "#fecaca" }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="brut-card mb-4" style={{ background: "#bbf7d0" }}>
          <span className="font-bold text-sm">{notice}</span>
        </div>
      ) : null}

      {!loading && data && data.sessions.length === 0 ? (
        <div className="brut-card">Tidak ada sesi yang cocok dengan filter.</div>
      ) : null}

      <div className="space-y-3">
        {(data?.sessions ?? []).map((s) => {
          const overBudget = budget > 0 && s.subtests.some((x) => x.pausedSec >= budget);
          const isOpen = openId === s.id;
          return (
            <div
              key={s.id}
              className="border-4 border-black"
              style={{ background: overBudget ? "#fee2e2" : "#fff" }}
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : s.id)}
                className="w-full text-left p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black uppercase">{s.fullName ?? "(belum isi nama)"}</span>
                  <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
                    {s.label}
                  </span>
                  {s.tokenCode ? <span className="brut-tag">{s.tokenCode}</span> : null}
                  {s.finishedAt ? <span className="brut-tag">SELESAI</span> : null}
                  {s.flaggedCheating ? (
                    <span className="brut-tag" style={{ background: "#ef4444", color: "#fff" }}>
                      DICURIGAI
                    </span>
                  ) : null}
                </div>
                <div className="text-sm font-bold mt-1">
                  Total jeda <strong>{fmtSec(s.totalPausedSec)}</strong> dalam{" "}
                  {s.totalPauseCount}× · subtes terkunci {s.lockedCount} · pelanggaran{" "}
                  {s.violationCount} · mulai {fmtTime(s.startedAt)}
                </div>
              </button>

              {isOpen ? (
                <div className="border-t-4 border-black p-3 overflow-x-auto">
                  {s.subtests.length === 0 ? (
                    <p className="text-sm font-bold">Belum ada subtes yang dibuka.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="pr-2 font-black uppercase text-xs">Subtes</th>
                          <th className="pr-2 font-black uppercase text-xs">Terpakai</th>
                          <th className="pr-2 font-black uppercase text-xs">Sisa</th>
                          <th className="pr-2 font-black uppercase text-xs">Jeda</th>
                          <th className="pr-2 font-black uppercase text-xs">Status</th>
                          <th className="pr-2 font-black uppercase text-xs">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.subtests.map((sub) => {
                          const key = `${s.id}:${sub.code}`;
                          const hot = budget > 0 && sub.pausedSec >= budget * 0.8;
                          return (
                            <tr key={sub.subtestId} className="border-t-2 border-black">
                              <td className="pr-2 py-1 font-bold">
                                {sub.code}
                                <div className="text-xs opacity-70">{sub.name}</div>
                              </td>
                              <td className="pr-2 py-1">
                                {fmtSec(sub.consumedSec)}
                                <div className="text-xs opacity-70">dari {fmtSec(sub.durationSec)}</div>
                              </td>
                              <td className="pr-2 py-1 font-bold">{fmtSec(sub.remainingSec)}</td>
                              <td
                                className="pr-2 py-1 font-black"
                                style={hot ? { background: "#fca5a5" } : undefined}
                              >
                                {fmtSec(sub.pausedSec)}
                                <div className="text-xs font-bold opacity-70">{sub.pauseCount}×</div>
                              </td>
                              <td className="pr-2 py-1">
                                {sub.locked ? (
                                  <span className="brut-tag" style={{ background: "#ef4444", color: "#fff" }}>
                                    {sub.finishReason ?? "TERKUNCI"}
                                  </span>
                                ) : (
                                  <span className="brut-tag" style={{ background: "#16a34a", color: "#fff" }}>
                                    BERJALAN
                                  </span>
                                )}
                                <div className="text-xs opacity-70">
                                  denyut {fmtTime(sub.lastSeenAt)}
                                </div>
                              </td>
                              <td className="pr-2 py-1">
                                <button
                                  type="button"
                                  disabled={busyKey === key}
                                  onClick={() => void unlock(s, sub)}
                                  className="brut-btn brut-btn-white text-xs"
                                >
                                  {busyKey === key ? "…" : sub.locked ? "BUKA KUNCI" : "+ WAKTU"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
