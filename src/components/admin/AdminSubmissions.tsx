"use client";

import { Fragment, useEffect, useState } from "react";
import toast from "react-hot-toast";

type ViolationEntry = { type: string; subtestCode?: string | null; at: string };

type Sub = {
  id: string;
  tokenCode: string;
  testKind: "MINAT" | "BAKAT";
  fullName: string | null;
  school: string | null;
  grade: string | null;
  startedAt: string;
  finishedAt: string | null;
  iqEstimate: number | null;
  hasResult: boolean;
  violationCount: number;
  flaggedCheating: boolean;
  violationLog?: ViolationEntry[];
};

type ClassRow = { school: string; grade: string; testKind: "MINAT" | "BAKAT"; count: number };

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

export default function AdminSubmissions() {
  const [items, setItems] = useState<Sub[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterKind, setFilterKind] = useState<"" | "MINAT" | "BAKAT">("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  const refresh = () => {
    fetch("/api/admin/submissions")
      .then((r) => r.json())
      .then((d) => setItems(d.submissions || []));
    fetch("/api/admin/classes")
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []));
  };

  useEffect(() => {
    refresh();
    // Auto-refresh tiap 5 detik supaya daftar peserta real-time — admin tidak
    // perlu refresh manual untuk melihat siapa yang baru saja selesai.
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const onDelete = async (s: Sub) => {
    const label = s.fullName || s.tokenCode;
    if (!confirm(`Hapus data peserta "${label}" (${s.testKind})? Tindakan ini permanen dan tidak bisa dibatalkan.`)) return;
    setDeleting(s.id);
    try {
      const res = await fetch(`/api/admin/submissions/${s.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gagal menghapus data");
        return;
      }
      toast.success(`Data "${label}" dihapus`);
      setItems((prev) => prev.filter((it) => it.id !== s.id));
    } finally {
      setDeleting(null);
    }
  };

  const filteredItems = items.filter(
    (s) =>
      (!filterSchool || s.school === filterSchool) &&
      (!filterGrade || s.grade === filterGrade) &&
      (!filterKind || s.testKind === filterKind) &&
      (!onlyFlagged || s.flaggedCheating || s.violationCount >= 5),
  );
  const flaggedCount = items.filter((s) => s.flaggedCheating || s.violationCount >= 5).length;

  const schools = Array.from(new Set(classes.map((c) => c.school).filter(Boolean)));
  const grades = Array.from(
    new Set(classes.filter((c) => !filterSchool || c.school === filterSchool).map((c) => c.grade).filter(Boolean)),
  );

  return (
    <div className="space-y-6">
      <div className="brut-card" style={{ background: "#a3e635" }}>
        <h3 className="text-xl font-black uppercase mb-3">Rekap per Kelas / Sekolah</h3>
        <p className="text-sm font-semibold mb-3">
          Pilih sekolah, kelas, dan jenis tes untuk mengunduh laporan rekap dengan persentase.
        </p>
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-black uppercase block mb-1">Sekolah</label>
            <select className="brut-input w-full" value={filterSchool} onChange={(e) => { setFilterSchool(e.target.value); setFilterGrade(""); }}>
              <option value="">Semua</option>
              {schools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase block mb-1">Kelas</label>
            <select className="brut-input w-full" value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
              <option value="">Semua</option>
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase block mb-1">Jenis Tes</label>
            <select className="brut-input w-full" value={filterKind} onChange={(e) => setFilterKind(e.target.value as "" | "MINAT" | "BAKAT")}>
              <option value="">Pilih</option>
              <option value="BAKAT">BAKAT</option>
              <option value="MINAT">MINAT</option>
            </select>
          </div>
          <a
            className={`brut-btn brut-btn-black text-center ${filterKind ? "" : "pointer-events-none opacity-50"}`}
            href={`/api/admin/rekap?testKind=${filterKind}&school=${encodeURIComponent(filterSchool)}&grade=${encodeURIComponent(filterGrade)}`}
            target="_blank"
            rel="noreferrer"
          >
            UNDUH REKAP PDF
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-2xl font-black uppercase">Daftar Peserta</h3>
        <label className="brut-checkbox" title="Tampilkan hanya peserta dengan minimal 5 pelanggaran (terdeteksi curang)">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          <span>
            Hanya tampilkan yang dicurigai ({flaggedCount})
          </span>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="brut-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Tes</th>
              <th>Nama</th>
              <th>Sekolah</th>
              <th>Kelas</th>
              <th>Mulai</th>
              <th>Selesai</th>
              <th>IQ</th>
              <th>Pelanggaran</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center font-bold py-6">Tidak ada peserta sesuai filter.</td>
              </tr>
            )}
            {filteredItems.map((s) => {
              const isFlagged = s.flaggedCheating || s.violationCount >= 5;
              const isOpen = openLogId === s.id;
              const log = Array.isArray(s.violationLog) ? s.violationLog : [];
              return (
                <Fragment key={s.id}>
                  <tr style={isFlagged ? { background: "#fee2e2" } : undefined}>
                    <td className="font-mono font-bold">{s.tokenCode}</td>
                    <td>{s.testKind}</td>
                    <td>{s.fullName || "—"}</td>
                    <td>{s.school || "—"}</td>
                    <td>{s.grade || "—"}</td>
                    <td>{fmt(s.startedAt)}</td>
                    <td>{fmt(s.finishedAt)}</td>
                    <td className="font-mono font-black text-center">
                      {s.iqEstimate ?? "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setOpenLogId(isOpen ? null : s.id)}
                        title={
                          s.violationCount > 0
                            ? "Klik untuk lihat detail log pelanggaran"
                            : "Tidak ada pelanggaran terdeteksi"
                        }
                        className="brut-tag"
                        style={{
                          background: isFlagged
                            ? "#ef4444"
                            : s.violationCount > 0
                              ? "#fb923c"
                              : "#a3e635",
                          color: isFlagged ? "#fff" : "#000",
                          cursor: s.violationCount > 0 ? "pointer" : "default",
                          fontWeight: 900,
                        }}
                      >
                        {isFlagged ? "⚠ " : ""}{s.violationCount}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {s.finishedAt ? (
                          <a
                            href={`/api/admin/submissions/${s.id}/pdf`}
                            className="brut-btn brut-btn-pink text-xs"
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF
                          </a>
                        ) : (
                          <span className="brut-tag" style={{ background: "#facc15" }}>BERLANGSUNG</span>
                        )}
                        <button
                          type="button"
                          className="brut-btn brut-btn-black text-xs"
                          style={{ background: "#ff4d8d" }}
                          onClick={() => onDelete(s)}
                          disabled={deleting === s.id}
                          title="Hapus data peserta ini"
                        >
                          {deleting === s.id ? "..." : "HAPUS"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && log.length > 0 && (
                    <tr>
                      <td colSpan={10} style={{ background: "#fff7ed" }}>
                        <div className="p-3">
                          <p className="text-xs font-black uppercase mb-2">
                            Detail Pelanggaran ({log.length})
                          </p>
                          <div style={{ maxHeight: 220, overflowY: "auto" }}>
                            <table className="brut-table" style={{ fontSize: 12 }}>
                              <thead>
                                <tr>
                                  <th>Waktu</th>
                                  <th>Subtes</th>
                                  <th>Jenis</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...log]
                                  .slice(-50)
                                  .reverse()
                                  .map((v, i) => (
                                    <tr key={i}>
                                      <td className="font-mono">{fmt(v.at)}</td>
                                      <td className="font-mono">{v.subtestCode || "—"}</td>
                                      <td className="font-bold">{v.type}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-xs font-semibold opacity-70 mt-2">
                            Menampilkan 50 entri terakhir. Total: {log.length}.
                            {isFlagged && " Siswa otomatis ditandai karena ≥ 5 pelanggaran."}
                          </p>
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
