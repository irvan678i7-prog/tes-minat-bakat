import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScoringPayload } from "./scoring";
import { CATEGORY_LABEL } from "./test-config";

type SubmissionRow = {
  id: string;
  fullName: string | null;
  gender: string | null;
  age: number | null;
  grade: string | null;
  school: string | null;
  testKind: "MINAT" | "BAKAT";
  finishedAt: Date | null;
  iqEstimate: number | null;
  payload: ScoringPayload | null;
};

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const YELLOW = "#FFEB00";
const PINK = "#FF4D8D";
const CYAN = "#00E1FF";
const LIME = "#A3E635";

function pct(n: number, d: number): string {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

export function buildRekapPDF(
  meta: { school: string; grade: string; testKind: "MINAT" | "BAKAT"; generatedAt: Date },
  rows: SubmissionRow[],
): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  doc.setFillColor(YELLOW);
  doc.rect(0, 0, pageW, 100, "F");
  doc.setFillColor(BLACK);
  doc.rect(0, 100, pageW, 6, "F");
  doc.setTextColor(BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("REKAP HASIL TES", margin, 42);
  doc.setFontSize(28);
  doc.text(`${meta.testKind === "BAKAT" ? "TES BAKAT" : "TES MINAT"} — ${meta.school || "Semua Sekolah"}`.toUpperCase(), margin, 78);

  let y = 130;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const printedAt = meta.generatedAt.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  const subtitle = `Kelas: ${meta.grade || "Semua Kelas"}    •    Total Peserta: ${rows.length}    •    Dicetak: ${printedAt} WIB`;
  doc.text(subtitle, margin, y);
  y += 18;

  // ── Tabel peserta + skor ringkas ────────────────────────────────────
  if (meta.testKind === "BAKAT") {
    y = drawBakatTable(doc, rows, margin, y);
    y = drawCategoryDistribution(doc, rows, margin, y, pageW);
    y = drawIqDistribution(doc, rows, margin, y, pageW);
  } else {
    y = drawMinatTable(doc, rows, margin, y);
    y = drawBidangDistribution(doc, rows, margin, y, pageW);
  }
  drawTopRecommendations(doc, rows, margin, y, pageW);

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(BLACK);
    doc.rect(0, pageH - 22, pageW, 22, "F");
    doc.setTextColor(WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("REKAP HASIL TES — DICETAK OTOMATIS — RAHASIA", margin, pageH - 8);
    doc.text(`Hal. ${i} / ${totalPages}`, pageW - margin - 60, pageH - 8);
  }
  return Buffer.from(doc.output("arraybuffer"));
}

function drawBakatTable(doc: jsPDF, rows: SubmissionRow[], margin: number, yIn: number): number {
  const y = yIn;
  const subtestCodes: string[] = [];
  for (const r of rows) {
    if (!r.payload?.perSubtest) continue;
    for (const code of Object.keys(r.payload.perSubtest)) {
      if (!subtestCodes.includes(code)) subtestCodes.push(code);
    }
  }
  subtestCodes.sort();
  const subShort: Record<string, string> = {
    BAKAT_1_VISUAL: "Vis",
    BAKAT_2_NUMERIK: "Num",
    BAKAT_3_VERBAL: "Ver",
    BAKAT_4_URUTAN: "Urt",
    BAKAT_5_SPASIAL: "Spa",
    BAKAT_6_3DIMENSI: "3D",
    BAKAT_7_SISTEMATISASI: "Sis",
    BAKAT_8_KOSAKATA: "Kos",
    BAKAT_9_FIGURAL: "Fig",
  };
  const head = [
    ["No", "Nama", "Kelas", "JK", "Usia", "IQ", ...subtestCodes.map((c) => subShort[c] || c), "Top Profil"],
  ];
  const body = rows.map((r, i) => {
    const subs = subtestCodes.map((c) => {
      const s = r.payload?.perSubtest?.[c];
      return s ? `${s.raw}/${s.max} ${s.categoryCode || ""}` : "—";
    });
    const top = r.payload?.bakat?.topProfiles?.[0]?.name || "—";
    return [
      String(i + 1),
      r.fullName || "—",
      r.grade || "—",
      r.gender || "—",
      r.age != null ? String(r.age) : "—",
      r.iqEstimate != null ? String(r.iqEstimate) : "—",
      ...subs,
      top,
    ];
  });
  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 7.5, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 3 },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  return (doc.lastAutoTable?.finalY ?? y) + 16;
}

function drawMinatTable(doc: jsPDF, rows: SubmissionRow[], margin: number, yIn: number): number {
  const head = [["No", "Nama", "Kelas", "JK", "Usia", "Top Bidang", "Rekomendasi Program"]];
  const body = rows.map((r, i) => {
    const top = r.payload?.minat?.topBidang?.join(", ") || "—";
    const rec = r.payload?.minat?.programs?.flatMap((p) => p.topAnswers.map((a) => a.label)).slice(0, 3).join(", ") || "—";
    return [
      String(i + 1),
      r.fullName || "—",
      r.grade || "—",
      r.gender || "—",
      r.age != null ? String(r.age) : "—",
      top,
      rec,
    ];
  });
  autoTable(doc, {
    startY: yIn,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 3 },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  return (doc.lastAutoTable?.finalY ?? yIn) + 16;
}

function drawCategoryDistribution(
  doc: jsPDF,
  rows: SubmissionRow[],
  margin: number,
  yIn: number,
  pageW: number,
): number {
  let y = ensureSpace(doc, yIn, 200, margin, doc.internal.pageSize.getHeight());
  doc.setFillColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, 18, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DISTRIBUSI KATEGORI PER SUBTES (PERSENTASE)", margin + 6, y + 13);
  doc.setTextColor(BLACK);
  y += 26;

  const cats = ["BR", "RR", "AR", "B", "LB"];
  const head = [["Subtes", "Total", ...cats.map((c) => `${c} (${CATEGORY_LABEL[c]})`)]];
  const subtestCodes: string[] = [];
  for (const r of rows) {
    if (!r.payload?.perSubtest) continue;
    for (const code of Object.keys(r.payload.perSubtest)) {
      if (!subtestCodes.includes(code)) subtestCodes.push(code);
    }
  }
  subtestCodes.sort();
  const body = subtestCodes.map((code) => {
    const counts: Record<string, number> = { BR: 0, RR: 0, AR: 0, B: 0, LB: 0 };
    let total = 0;
    let name = code;
    for (const r of rows) {
      const s = r.payload?.perSubtest?.[code];
      if (!s) continue;
      total += 1;
      name = s.name;
      const c = s.categoryCode || "RR";
      counts[c] = (counts[c] || 0) + 1;
    }
    return [
      name,
      String(total),
      ...cats.map((c) => `${counts[c] || 0} (${pct(counts[c] || 0, total)})`),
    ];
  });
  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 3 },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  return (doc.lastAutoTable?.finalY ?? y) + 16;
}

function drawIqDistribution(
  doc: jsPDF,
  rows: SubmissionRow[],
  margin: number,
  yIn: number,
  pageW: number,
): number {
  const iqs = rows.map((r) => r.iqEstimate).filter((n): n is number => typeof n === "number");
  if (iqs.length === 0) return yIn;
  const buckets = [
    { label: "Sangat Rendah (<80)", min: 0, max: 79 },
    { label: "Rendah (80–89)", min: 80, max: 89 },
    { label: "Rata-rata (90–109)", min: 90, max: 109 },
    { label: "Atas Rata-rata (110–119)", min: 110, max: 119 },
    { label: "Tinggi (120–129)", min: 120, max: 129 },
    { label: "Sangat Tinggi (≥130)", min: 130, max: 999 },
  ];
  let y = ensureSpace(doc, yIn, 180, margin, doc.internal.pageSize.getHeight());
  doc.setFillColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, 18, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DISTRIBUSI IQ (PERSENTASE)", margin + 6, y + 13);
  doc.setTextColor(BLACK);
  y += 26;
  const total = iqs.length;
  const avg = Math.round(iqs.reduce((a, b) => a + b, 0) / total);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Rata-rata IQ kelas: ${avg}    •    n = ${total}`, margin, y);
  y += 14;
  const head = [["Kategori IQ", "Jumlah", "%"]];
  const body = buckets.map((b) => {
    const c = iqs.filter((iq) => iq >= b.min && iq <= b.max).length;
    return [b.label, String(c), pct(c, total)];
  });
  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 4 },
    headStyles: { fillColor: CYAN, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  return (doc.lastAutoTable?.finalY ?? y) + 16;
}

function drawBidangDistribution(
  doc: jsPDF,
  rows: SubmissionRow[],
  margin: number,
  yIn: number,
  pageW: number,
): number {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const top = r.payload?.minat?.topBidang?.[0];
    if (!top) continue;
    counts[top] = (counts[top] || 0) + 1;
    total += 1;
  }
  let y = ensureSpace(doc, yIn, 200, margin, doc.internal.pageSize.getHeight());
  doc.setFillColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, 18, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DISTRIBUSI BIDANG MINAT TERTINGGI (PERSENTASE)", margin + 6, y + 13);
  doc.setTextColor(BLACK);
  y += 26;
  const head = [["Bidang", "Jumlah", "%"]];
  const body = ["A", "B", "C", "D", "E", "F", "G", "H"].map((l) => [
    l,
    String(counts[l] || 0),
    pct(counts[l] || 0, total),
  ]);
  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 4 },
    headStyles: { fillColor: PINK, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  return (doc.lastAutoTable?.finalY ?? y) + 16;
}

function drawTopRecommendations(
  doc: jsPDF,
  rows: SubmissionRow[],
  margin: number,
  yIn: number,
  pageW: number,
): number {
  const majorCount: Record<string, number> = {};
  const careerCount: Record<string, number> = {};
  for (const r of rows) {
    const ms = r.payload?.recommendations?.majors || [];
    const cs = r.payload?.recommendations?.careers || [];
    for (const m of ms) majorCount[m] = (majorCount[m] || 0) + 1;
    for (const c of cs) careerCount[c] = (careerCount[c] || 0) + 1;
  }
  const total = rows.length;
  let y = ensureSpace(doc, yIn, 220, margin, doc.internal.pageSize.getHeight());
  doc.setFillColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, 18, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("REKOMENDASI POPULER (PERSENTASE PESERTA)", margin + 6, y + 13);
  doc.setTextColor(BLACK);
  y += 26;

  const topMajors = Object.entries(majorCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topCareers = Object.entries(careerCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const colW = (pageW - margin * 2 - 12) / 2;

  autoTable(doc, {
    startY: y,
    head: [["Jurusan", "Jumlah", "%"]],
    body: topMajors.map(([k, n]) => [k, String(n), pct(n, total)]),
    theme: "grid",
    styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 4 },
    headStyles: { fillColor: LIME, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin, right: margin + colW + 12 },
    tableWidth: colW,
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  const yAfterLeft = doc.lastAutoTable?.finalY ?? y;

  autoTable(doc, {
    startY: y,
    head: [["Karir", "Jumlah", "%"]],
    body: topCareers.map(([k, n]) => [k, String(n), pct(n, total)]),
    theme: "grid",
    styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 4 },
    headStyles: { fillColor: LIME, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin + colW + 12, right: margin },
    tableWidth: colW,
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  const yAfterRight = doc.lastAutoTable?.finalY ?? y;

  return Math.max(yAfterLeft, yAfterRight) + 16;
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number, pageH: number): number {
  if (y + needed > pageH - 40) {
    doc.addPage();
    return margin;
  }
  return y;
}
