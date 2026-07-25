"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { schoolKey, gradeKey, pickDisplay } from "@/lib/rekap-key";
import CfitConfirm from "@/components/cfit/CfitConfirm";

type ResultRow = {
  id: string;
  form: "FORM_3A" | "FORM_3B" | "FORM_3AB";
  fullName: string | null;
  gender: string | null;
  age: number | null;
  grade: string | null;
  school: string | null;
  startedAt: string;
  finishedAt: string | null;
  violationCount: number;
  flaggedCheating: boolean;
  tokenCode: string;
  result: {
    rawScoreA: number | null;
    rawScoreB: number | null;
    rawScoreTotal: number;
    iq: number;
    classification: string;
    generatedAt: string;
  } | null;
};

const FORM_LABEL: Record<string, string> = { FORM_3A: "3A", FORM_3B: "3B", FORM_3AB: "3A+3B" };

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CfitAdminResults() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishedOnly, setFinishedOnly] = useState(true);
  const [selSchool, setSelSchool] = useState("");
  const [selGrade, setSelGrade] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ResultRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/cfit/results${finishedOnly ? "" : "?finishedOnly=0"}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    // setLoading(false) juga saat error — tanpa ini tampilan macet di
    // "Memuat..." selamanya kalau fetch gagal.
    setLoading(false);
    if (!res.ok) {
      toast.error(data.error || "Gagal memuat hasil");
      return;
    }
    setRows(data.submissions);
  }, [finishedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/cfit/results/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      toast.error(data.error || "Gagal menghapus peserta");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success(`Peserta "${deleteTarget.fullName ?? "(tanpa nama)"}" dihapus.`);
  };

  // Opsi filter dibangun dari data, pakai kunci kanonik yang sama dengan
  // minat-bakat supaya variasi penulisan ("SMA 1" vs "SMAN 1") tergabung.
  const schoolOpts = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const k = schoolKey(r.school);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), r.school ?? ""]);
    }
    return [...map.entries()]
      .map(([key, labels]) => ({ key, label: pickDisplay(labels) || key }))
      .sort((a, b) => a.label.localeCompare(b.label, "id"));
  }, [rows]);

  const gradeOpts = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const k = gradeKey(r.grade);
      if (k) set.add(k);
    }
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!selSchool || schoolKey(r.school) === selSchool) &&
          (!selGrade || gradeKey(r.grade) === selGrade),
      ),
    [rows, selSchool, selGrade],
  );

  const rekapQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (selSchool) {
      q.set("schoolKey", selSchool);
      q.set("schoolLabel", schoolOpts.find((o) => o.key === selSchool)?.label ?? "");
    }
    if (selGrade) {
      q.set("gradeKey", selGrade);
      q.set("gradeLabel", `Kelas ${selGrade}`);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [selSchool, selGrade, schoolOpts]);

  const exportCsv = () => {
    const header = ["Nama", "JK", "Usia", "Kelas", "Sekolah", "Bentuk", "RS A", "RS B", "RS Total", "IQ", "Klasifikasi", "Mulai", "Selesai", "Pelanggaran", "Token"];
    const lines = visible.map((r) =>
      [
        r.fullName,
        r.gender,
        r.age,
        r.grade,
        r.school,
        FORM_LABEL[r.form] ?? r.form,
        r.result?.rawScoreA ?? "",
        r.result?.rawScoreB ?? "",
        r.result?.rawScoreTotal ?? "",
        r.result?.iq ?? "",
        r.result?.classification ?? "",
        fmtDate(r.startedAt),
        fmtDate(r.finishedAt),
        r.violationCount,
        r.tokenCode,
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rekap-cfit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      {/* ── KARTU UNDUH LAPORAN PDF ── */}
      <div className="brut-card space-y-3">
        <div className="font-black uppercase">⬇ Unduh Laporan PDF (Tes IQ CFIT)</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="brut-input text-sm" value={selSchool} onChange={(e) => setSelSchool(e.target.value)}>
            <option value="">Semua Sekolah</option>
            {schoolOpts.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <select className="brut-input text-sm" value={selGrade} onChange={(e) => setSelGrade(e.target.value)}>
            <option value="">Semua Kelas</option>
            {gradeOpts.map((k) => (
              <option key={k} value={k}>Kelas {k}</option>
            ))}
          </select>
          <a className="brut-btn brut-btn-cyan text-sm" href={`/api/admin/cfit/rekap${rekapQuery}`}>
            ⬇ REKAP PDF
          </a>
          <a className="brut-btn brut-btn-pink text-sm" href={`/api/admin/cfit/rekap-full${rekapQuery}`}>
            ⬇ REKAP + SEMUA LAPORAN INDIVIDU
          </a>
        </div>
        <div className="text-xs font-bold opacity-70">
          REKAP = tabel ringkas semua peserta + statistik & distribusi klasifikasi IQ (landscape).
          REKAP + INDIVIDU = rekap di halaman depan lalu laporan lengkap tiap peserta urut abjad dengan
          nomor halaman menyambung — siap cetak sekali unduh. Filter sekolah/kelas juga berlaku ke tabel
          di bawah dan ekspor CSV.
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t-2 border-black">
          <span className="text-xs font-black uppercase">Contoh laporan (data dummy):</span>
          <a className="brut-btn brut-btn-white text-xs px-2 py-1" href="/api/admin/cfit/report-contoh?jenis=individu">
            ⬇ INDIVIDU
          </a>
          <a className="brut-btn brut-btn-white text-xs px-2 py-1" href="/api/admin/cfit/report-contoh?jenis=rekap">
            ⬇ REKAP
          </a>
          <a className="brut-btn brut-btn-white text-xs px-2 py-1" href="/api/admin/cfit/report-contoh?jenis=lengkap">
            ⬇ REKAP + INDIVIDU
          </a>
          <span className="text-xs font-bold opacity-60">8 peserta fiktif — tidak menyentuh database.</span>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="brut-checkbox">
          <input type="checkbox" checked={finishedOnly} onChange={(e) => setFinishedOnly(e.target.checked)} />
          Hanya yang sudah selesai
        </label>
        <button className="brut-btn brut-btn-lime text-sm" onClick={exportCsv} disabled={visible.length === 0}>
          ⬇ EKSPOR CSV ({visible.length})
        </button>
      </div>

      {loading ? (
        <div className="brut-card font-black uppercase brut-blink">Memuat...</div>
      ) : visible.length === 0 ? (
        <div className="brut-card font-bold">
          {rows.length === 0 ? "Belum ada hasil tes CFIT." : "Tidak ada hasil untuk filter sekolah/kelas ini."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="brut-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Usia</th>
                <th>Kelas / Sekolah</th>
                <th>Bentuk</th>
                <th>RS A</th>
                <th>RS B</th>
                <th>RS Total</th>
                <th>IQ</th>
                <th>Klasifikasi</th>
                <th>Selesai</th>
                <th>PDF</th>
                <th>Hapus</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} style={r.flaggedCheating || r.violationCount >= 5 ? { background: "#ffe4e6" } : undefined}>
                  <td className="font-bold">
                    {r.fullName ?? "(tanpa nama)"}
                    {r.flaggedCheating || r.violationCount >= 5 ? " ⚠️" : ""}
                  </td>
                  <td>{r.age ?? "-"}</td>
                  <td>{[r.grade, r.school].filter(Boolean).join(" · ") || "-"}</td>
                  <td><span className="brut-tag text-xs">{FORM_LABEL[r.form] ?? r.form}</span></td>
                  <td>{r.result?.rawScoreA ?? "-"}</td>
                  <td>{r.result?.rawScoreB ?? "-"}</td>
                  <td className="font-bold">{r.result?.rawScoreTotal ?? "-"}</td>
                  <td className="font-black text-lg">{r.result?.iq ?? "-"}</td>
                  <td className="font-bold">{r.result?.classification ?? "-"}</td>
                  <td>{fmtDate(r.finishedAt)}</td>
                  <td>
                    {r.result ? (
                      <a
                        className="brut-btn brut-btn-white text-xs px-2 py-1 inline-block"
                        style={{ boxShadow: "3px 3px 0 0 #000" }}
                        href={`/api/admin/cfit/results/${r.id}/pdf`}
                      >
                        ⬇ PDF
                      </a>
                    ) : (
                      <span className="opacity-50 text-xs font-bold">-</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="brut-btn brut-btn-pink text-xs px-2 py-1"
                      style={{ boxShadow: "3px 3px 0 0 #000" }}
                      title="Hapus peserta ini beserta seluruh jawaban & hasilnya"
                      onClick={() => setDeleteTarget(r)}
                    >
                      🗑 HAPUS
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CfitConfirm
        open={!!deleteTarget}
        title="Hapus peserta ini?"
        danger
        confirmLabel="YA, HAPUS PERMANEN"
        pending={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteTarget(null)}
      >
        {deleteTarget
          ? `Peserta "${deleteTarget.fullName ?? "(tanpa nama)"}"${deleteTarget.school ? ` — ${deleteTarget.school}` : ""} akan dihapus PERMANEN beserta seluruh jawaban, progres subtes, dan hasil IQ-nya. Tindakan ini tidak bisa dibatalkan. Token tes TIDAK ikut terhapus.`
          : ""}
      </CfitConfirm>
    </div>
  );
}
