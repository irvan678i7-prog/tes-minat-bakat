import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScoringPayload } from "./scoring";

type SubmissionInfo = {
  id: string;
  fullName: string | null;
  gender: string | null;
  birthPlace: string | null;
  birthDate: Date | null;
  age: number | null;
  grade: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  email: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  testKind: "MINAT" | "BAKAT";
};

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const YELLOW = "#FFEB00";
const PINK = "#FF4D8D";
const CYAN = "#00E1FF";

function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function buildReportPDF(submission: SubmissionInfo, payload: ScoringPayload): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  // Brutalist banner
  doc.setFillColor(YELLOW);
  doc.rect(0, 0, pageW, 110, "F");
  doc.setFillColor(BLACK);
  doc.rect(0, 110, pageW, 6, "F");

  doc.setTextColor(BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("LAPORAN HASIL", margin, 50);
  doc.setFontSize(28);
  const title = submission.testKind === "BAKAT" ? "TES BAKAT" : "TES MINAT";
  doc.text(title, margin, 86);

  // Identitas
  let y = 140;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("IDENTITAS PESERTA", margin, y);
  y += 6;
  doc.setLineWidth(2);
  doc.setDrawColor(BLACK);
  doc.line(margin, y, pageW - margin, y);

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const idRows: [string, string][] = [
    ["Nama", submission.fullName || "—"],
    ["Jenis Kelamin", submission.gender || "—"],
    ["Tempat / Tgl Lahir", `${submission.birthPlace || "—"} / ${submission.birthDate ? fmtDate(submission.birthDate).split(",")[0] : "—"}`],
    ["Sekolah", submission.school || "—"],
    ["Kelas / Jurusan", `${submission.grade || "—"} / ${submission.major || "—"}`],
    ["Telepon", submission.phone || "—"],
    ["Email", submission.email || "—"],
    ["Mulai Tes", fmtDate(submission.startedAt)],
    ["Selesai Tes", fmtDate(submission.finishedAt)],
  ];
  for (const [k, v] of idRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 130, y);
    y += 14;
  }

  y += 8;
  if (payload.testKind === "BAKAT") {
    y = drawBakatSection(doc, payload, margin, y, pageW);
  } else {
    y = drawMinatSection(doc, payload, margin, y, pageW);
  }

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
    doc.text("LAPORAN TES MINAT & BAKAT — DICETAK OTOMATIS — RAHASIA", margin, pageH - 8);
    doc.text(`Hal. ${i} / ${totalPages}`, pageW - margin - 60, pageH - 8);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 40) {
    doc.addPage();
    return margin;
  }
  return y;
}

function drawBakatSection(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
): number {
  let y = yIn;
  // Skor per subtes
  y = sectionTitle(doc, "SKOR PER SUBTES", margin, y, pageW);
  const rows = Object.entries(payload.perSubtest).map(([code, v]) => [
    v.name,
    `${v.raw} / ${v.max}`,
    v.categoryLabel ?? "—",
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Subtes", "Skor", "Kategori"]],
    body: rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, lineWidth: 1.2, lineColor: BLACK, textColor: BLACK },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1.5 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error – jspdf-autotable extends jsPDF instance with lastAutoTable
  y = (doc.lastAutoTable?.finalY ?? y) + 18;

  // Bar chart
  y = ensureSpace(doc, y, 200, margin);
  y = sectionTitle(doc, "VISUALISASI SKOR", margin, y, pageW);
  drawBarChart(doc, payload, margin, y, pageW);
  y += 200;

  // IQ
  y = ensureSpace(doc, y, 110, margin);
  y = sectionTitle(doc, "IQ PREDIKSI", margin, y, pageW);
  doc.setFillColor(CYAN);
  doc.rect(margin, y, pageW - margin * 2, 80, "F");
  doc.setLineWidth(2);
  doc.setDrawColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, 80);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(BLACK);
  doc.text(String(payload.iqEstimate ?? "—"), margin + 16, y + 50);
  doc.setFontSize(12);
  doc.text(payload.iqInterpretation?.band ?? "", margin + 110, y + 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(payload.iqInterpretation?.description ?? "", margin + 110, y + 56, {
    maxWidth: pageW - margin * 2 - 130,
  });
  y += 100;

  // Profil
  y = ensureSpace(doc, y, 80, margin);
  y = sectionTitle(doc, "PROFIL BAKAT TERATAS", margin, y, pageW);
  for (const p of payload.bakat?.topProfiles ?? []) {
    y = ensureSpace(doc, y, 70, margin);
    doc.setFillColor(PINK);
    doc.rect(margin, y, pageW - margin * 2, 16, "F");
    doc.setLineWidth(1.5);
    doc.rect(margin, y, pageW - margin * 2, 16);
    doc.setTextColor(BLACK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(p.name.toUpperCase(), margin + 6, y + 12);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(p.description, margin, y, { maxWidth: pageW - margin * 2 });
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.text("Jurusan:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(p.majors.join(", "), margin + 50, y, { maxWidth: pageW - margin * 2 - 50 });
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.text("Karir:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(p.careers.join(", "), margin + 50, y, { maxWidth: pageW - margin * 2 - 50 });
    y += 18;
  }

  // Rekomendasi
  y = ensureSpace(doc, y, 80, margin);
  y = sectionTitle(doc, "REKOMENDASI JURUSAN & PEKERJAAN", margin, y, pageW);
  drawRecommendations(doc, payload, margin, y, pageW);
  return y + 100;
}

function drawMinatSection(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
): number {
  let y = yIn;
  y = sectionTitle(doc, "SKOR BIDANG MINAT", margin, y, pageW);
  const bidangRows = Object.entries(payload.minat?.bidangScores ?? {}).map(([k, v]) => [k, String(v)]);
  autoTable(doc, {
    startY: y,
    head: [["Bidang", "Skor"]],
    body: bidangRows,
    theme: "grid",
    styles: { fontSize: 11, lineWidth: 1.2, lineColor: BLACK, textColor: BLACK },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1.5 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - lastAutoTable extension on jsPDF
  y = (doc.lastAutoTable?.finalY ?? y) + 16;

  y = sectionTitle(doc, "PROGRAM KEAHLIAN REKOMENDASI", margin, y, pageW);
  for (const p of payload.minat?.programs ?? []) {
    y = ensureSpace(doc, y, 70, margin);
    doc.setFillColor(CYAN);
    doc.rect(margin, y, pageW - margin * 2, 16, "F");
    doc.setLineWidth(1.5);
    doc.rect(margin, y, pageW - margin * 2, 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Bidang ${p.bidang}: ${p.kind}`, margin + 6, y + 12);
    y += 22;
    for (const a of p.topAnswers) {
      doc.setFont("helvetica", "bold");
      doc.text(`• ${a.label}`, margin + 8, y);
      doc.setFont("helvetica", "normal");
      doc.text(`(${a.major})`, margin + 8 + 150, y);
      y += 13;
    }
    y += 8;
  }

  y = ensureSpace(doc, y, 80, margin);
  y = sectionTitle(doc, "REKOMENDASI JURUSAN & PEKERJAAN", margin, y, pageW);
  drawRecommendations(doc, payload, margin, y, pageW);
  return y + 100;
}

function sectionTitle(doc: jsPDF, label: string, margin: number, y: number, pageW: number): number {
  doc.setFillColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, 18, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(label, margin + 6, y + 13);
  doc.setTextColor(BLACK);
  return y + 26;
}

function drawBarChart(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  y: number,
  pageW: number,
): void {
  const items = Object.entries(payload.perSubtest);
  const innerW = pageW - margin * 2;
  const labelW = 140;
  const barAreaW = innerW - labelW - 10;
  const rowH = 16;
  const max = Math.max(1, ...items.map(([, v]) => v.max));
  doc.setFontSize(9);
  for (let i = 0; i < items.length; i++) {
    const [, v] = items[i];
    const yi = y + i * rowH;
    doc.setFont("helvetica", "bold");
    doc.text(v.name, margin, yi + 11);
    const bw = (v.raw / max) * barAreaW;
    doc.setFillColor(YELLOW);
    doc.rect(margin + labelW, yi + 2, bw, rowH - 6, "F");
    doc.setLineWidth(1);
    doc.setDrawColor(BLACK);
    doc.rect(margin + labelW, yi + 2, barAreaW, rowH - 6);
    doc.setFont("helvetica", "normal");
    doc.text(`${v.raw}/${v.max}`, margin + labelW + barAreaW + 4, yi + 11);
  }
}

function drawRecommendations(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  y: number,
  pageW: number,
): void {
  const colW = (pageW - margin * 2) / 2 - 6;
  doc.setFillColor(YELLOW);
  doc.rect(margin, y, colW, 16, "F");
  doc.rect(margin + colW + 12, y, colW, 16, "F");
  doc.setLineWidth(1.5);
  doc.rect(margin, y, colW, 16);
  doc.rect(margin + colW + 12, y, colW, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("JURUSAN", margin + 6, y + 12);
  doc.text("PEKERJAAN", margin + colW + 18, y + 12);
  doc.setFont("helvetica", "normal");
  let yLeft = y + 22;
  for (const m of payload.recommendations.majors) {
    doc.text(`• ${m}`, margin + 6, yLeft);
    yLeft += 13;
  }
  let yRight = y + 22;
  for (const c of payload.recommendations.careers) {
    doc.text(`• ${c}`, margin + colW + 18, yRight);
    yRight += 13;
  }
}
