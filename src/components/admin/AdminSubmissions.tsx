"use client";

import { useEffect, useState } from "react";

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
};

type ClassRow = { school: string; grade: string; testKind: "MINAT" | "BAKAT"; count: number };

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("id-ID");
}

export default function AdminSubmissions() {
  const [items, setItems] = useState<Sub[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterKind, setFilterKind] = useState<"" | "MINAT" | "BAKAT">("");

  useEffect(() => {
    fetch("/api/admin/submissions")
      .then((r) => r.json())
      .then((d) => setItems(d.submissions || []));
    fetch("/api/admin/classes")
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []));
  }, []);

  const filteredItems = items.filter(
    (s) =>
      (!filterSchool || s.school === filterSchool) &&
      (!filterGrade || s.grade === filterGrade) &&
      (!filterKind || s.testKind === filterKind),
  );

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

      <h3 className="text-2xl font-black uppercase">Daftar Peserta</h3>
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
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center font-bold py-6">Tidak ada peserta sesuai filter.</td>
              </tr>
            )}
            {filteredItems.map((s) => (
              <tr key={s.id}>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
