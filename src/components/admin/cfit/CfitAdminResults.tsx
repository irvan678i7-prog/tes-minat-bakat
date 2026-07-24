"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

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

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/cfit/results${finishedOnly ? "" : "?finishedOnly=0"}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Gagal memuat hasil");
      return;
    }
    setRows(data.submissions);
    setLoading(false);
  }, [finishedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const header = ["Nama", "JK", "Usia", "Kelas", "Sekolah", "Bentuk", "RS A", "RS B", "RS Total", "IQ", "Klasifikasi", "Mulai", "Selesai", "Pelanggaran", "Token"];
    const lines = rows.map((r) =>
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="brut-checkbox">
          <input type="checkbox" checked={finishedOnly} onChange={(e) => setFinishedOnly(e.target.checked)} />
          Hanya yang sudah selesai
        </label>
        <button className="brut-btn brut-btn-lime text-sm" onClick={exportCsv} disabled={rows.length === 0}>
          ⬇ EKSPOR CSV ({rows.length})
        </button>
      </div>

      {loading ? (
        <div className="brut-card font-black uppercase brut-blink">Memuat...</div>
      ) : rows.length === 0 ? (
        <div className="brut-card font-bold">Belum ada hasil tes CFIT.</div>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
