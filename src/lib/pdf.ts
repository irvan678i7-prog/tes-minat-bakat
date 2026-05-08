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
const LIME = "#A3E635";
const GREY = "#F2F2F2";

function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateOnly(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function nextY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? fallback;
}

export function buildReportPDF(submission: SubmissionInfo, payload: ScoringPayload): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  drawHeader(doc, submission, margin, pageW);

  // ── IDENTITAS PESERTA — two-column autoTable ─────────────────────────
  let y = 152;
  y = sectionTitle(doc, "IDENTITAS PESERTA", margin, y, pageW);
  const tglLahir = submission.birthDate ? fmtDateOnly(submission.birthDate) : "—";
  const tempatTgl = `${submission.birthPlace || "—"} / ${tglLahir}`;
  const idData: [string, string, string, string][] = [
    ["Nama", submission.fullName || "—", "Jenis Kelamin", submission.gender || "—"],
    ["Tempat / Tgl Lahir", tempatTgl, "Usia", submission.age != null ? `${submission.age} tahun` : "—"],
    ["Sekolah", submission.school || "—", "Kelas / Jurusan", `${submission.grade || "—"} / ${submission.major || "—"}`],
    ["Telepon", submission.phone || "—", "Email", submission.email || "—"],
    ["Mulai Tes", fmtDate(submission.startedAt), "Selesai Tes", fmtDate(submission.finishedAt)],
  ];
  autoTable(doc, {
    startY: y,
    body: idData,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      lineWidth: 1,
      lineColor: BLACK,
      textColor: BLACK,
      cellPadding: { top: 5, bottom: 5, left: 8, right: 8 },
    },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: GREY, cellWidth: 110 },
      1: { cellWidth: "auto" },
      2: { fontStyle: "bold", fillColor: GREY, cellWidth: 110 },
      3: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
  });
  y = nextY(doc, y) + 16;

  if (payload.testKind === "BAKAT") {
    y = drawBakatSection(doc, payload, margin, y, pageW);
  } else {
    y = drawMinatSection(doc, payload, margin, y, pageW);
  }

  // ── REKOMENDASI ──────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 140, margin);
  y = sectionTitle(doc, "REKOMENDASI JURUSAN & PEKERJAAN", margin, y, pageW);
  drawRecommendations(doc, payload, margin, y, pageW);

  // ── FOOTER ───────────────────────────────────────────────────────────
  drawFooters(doc, margin, pageW);

  return Buffer.from(doc.output("arraybuffer"));
}

function drawHeader(doc: jsPDF, sub: SubmissionInfo, margin: number, pageW: number): void {
  doc.setFillColor(YELLOW);
  doc.rect(0, 0, pageW, 120, "F");
  doc.setFillColor(BLACK);
  doc.rect(0, 120, pageW, 6, "F");

  doc.setTextColor(BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("LAPORAN HASIL", margin, 44);
  doc.setFontSize(28);
  const title = sub.testKind === "BAKAT" ? "TES BAKAT" : "TES MINAT";
  doc.text(title, margin, 78);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Dicetak: ${fmtDate(new Date())}`, margin, 100);

  // Right-side small badge for report code
  const badgeW = 110;
  const badgeX = pageW - margin - badgeW;
  doc.setFillColor(BLACK);
  doc.rect(badgeX, 28, badgeW, 60, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("KODE LAPORAN", badgeX + 10, 46);
  doc.setFontSize(13);
  doc.text(sub.id.slice(0, 8).toUpperCase(), badgeX + 10, 70);
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 50) {
    doc.addPage();
    return margin + 12;
  }
  return y;
}

function sectionTitle(doc: jsPDF, label: string, margin: number, y: number, pageW: number): number {
  doc.setFillColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, 22, "F");
  doc.setFillColor(YELLOW);
  doc.rect(pageW - margin - 8, y, 8, 22, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(label, margin + 10, y + 15);
  doc.setTextColor(BLACK);
  return y + 30;
}

function drawFooters(doc: jsPDF, margin: number, pageW: number): void {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(BLACK);
    doc.rect(0, pageH - 26, pageW, 26, "F");
    doc.setTextColor(WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("LAPORAN TES MINAT & BAKAT — DICETAK OTOMATIS — RAHASIA", margin, pageH - 10);
    doc.text(`Hal. ${i} / ${totalPages}`, pageW - margin - 60, pageH - 10);
  }
}

// ──────────────────────────────────────────────────────────────────────
// BAKAT
// ──────────────────────────────────────────────────────────────────────
function drawBakatSection(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
): number {
  let y = yIn;

  // ── IQ Card ────────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 130, margin);
  y = sectionTitle(doc, "PREDIKSI IQ", margin, y, pageW);
  const cardH = 92;
  doc.setFillColor(CYAN);
  doc.rect(margin, y, pageW - margin * 2, cardH, "F");
  doc.setLineWidth(2);
  doc.setDrawColor(BLACK);
  doc.rect(margin, y, pageW - margin * 2, cardH);
  const numW = 130;
  doc.setFillColor(BLACK);
  doc.rect(margin + 12, y + 12, numW, cardH - 24, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SKOR IQ", margin + 22, y + 28);
  doc.setFontSize(40);
  doc.text(String(payload.iqEstimate ?? "—"), margin + 22, y + 64);
  doc.setTextColor(BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(payload.iqInterpretation?.band ?? "", margin + numW + 28, y + 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(payload.iqInterpretation?.description ?? "", margin + numW + 28, y + 52, {
    maxWidth: pageW - margin * 2 - numW - 36,
  });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text(
    "*Estimasi berbasis skor agregat 9 subtes; bukan IQ klinis.",
    margin + numW + 28,
    y + 80,
  );
  y += cardH + 18;

  // ── Skor per subtes ────────────────────────────────────────────────
  y = ensureSpace(doc, y, 160, margin);
  y = sectionTitle(doc, "SKOR PER SUBTES", margin, y, pageW);
  const items = Object.entries(payload.perSubtest);
  const rows = items.map(([, v]) => [
    v.name,
    `${v.raw} / ${v.max}`,
    `${Math.round((v.raw / Math.max(1, v.max)) * 100)}%`,
    v.categoryLabel ?? "—",
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Subtes", "Skor", "%", "Kategori"]],
    body: rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 6 },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    columnStyles: {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { cellWidth: 70, halign: "center" },
      2: { cellWidth: 50, halign: "center" },
      3: { cellWidth: 110, halign: "center" },
    },
    alternateRowStyles: { fillColor: GREY },
    margin: { left: margin, right: margin },
  });
  y = nextY(doc, y) + 18;

  // ── Visualisasi bar chart ──────────────────────────────────────────
  const chartH = items.length * 18 + 20;
  y = ensureSpace(doc, y, chartH + 40, margin);
  y = sectionTitle(doc, "VISUALISASI SKOR (%)", margin, y, pageW);
  drawBarChart(doc, items, margin, y, pageW);
  y += chartH + 12;

  // ── Profil bakat teratas ───────────────────────────────────────────
  const topProfiles = payload.bakat?.topProfiles ?? [];
  if (topProfiles.length > 0) {
    y = ensureSpace(doc, y, 60, margin);
    y = sectionTitle(doc, "PROFIL BAKAT TERATAS", margin, y, pageW);
    for (const p of topProfiles) {
      const descLines = doc.splitTextToSize(p.description, pageW - margin * 2 - 20);
      const profileH = 30 + descLines.length * 12 + 36;
      y = ensureSpace(doc, y, profileH, margin);
      doc.setFillColor(PINK);
      doc.rect(margin, y, pageW - margin * 2, 22, "F");
      doc.setLineWidth(1.2);
      doc.setDrawColor(BLACK);
      doc.rect(margin, y, pageW - margin * 2, 22);
      doc.setTextColor(BLACK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(p.name.toUpperCase(), margin + 10, y + 15);
      doc.setFontSize(9);
      doc.text(`Match: ${p.matchScore}/3`, pageW - margin - 70, y + 15);
      y += 28;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(descLines, margin + 4, y);
      y += descLines.length * 12 + 6;
      doc.setFont("helvetica", "bold");
      doc.text("Jurusan:", margin + 4, y);
      doc.setFont("helvetica", "normal");
      doc.text(p.majors.join(", "), margin + 60, y, { maxWidth: pageW - margin * 2 - 60 });
      y += 14;
      doc.setFont("helvetica", "bold");
      doc.text("Karir:", margin + 4, y);
      doc.setFont("helvetica", "normal");
      doc.text(p.careers.join(", "), margin + 60, y, { maxWidth: pageW - margin * 2 - 60 });
      y += 18;
    }
  }
  return y;
}

// ──────────────────────────────────────────────────────────────────────
// MINAT
// ──────────────────────────────────────────────────────────────────────
function drawMinatSection(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
): number {
  let y = yIn;

  // ── Skor Bidang Minat ──────────────────────────────────────────────
  y = ensureSpace(doc, y, 160, margin);
  y = sectionTitle(doc, "SKOR BIDANG MINAT", margin, y, pageW);
  const bidangEntries = Object.entries(payload.minat?.bidangScores ?? {});
  const totalBidang = bidangEntries.reduce((sum, [, v]) => sum + v, 0) || 1;
  const bidangRows = bidangEntries.map(([k, v]) => [
    k,
    String(v),
    `${Math.round((v / totalBidang) * 100)}%`,
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Bidang", "Skor", "%"]],
    body: bidangRows,
    theme: "grid",
    styles: { fontSize: 11, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 6 },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    columnStyles: {
      0: { cellWidth: 80, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 80, halign: "center" },
      2: { cellWidth: 80, halign: "center" },
    },
    alternateRowStyles: { fillColor: GREY },
    margin: { left: margin, right: margin },
  });
  y = nextY(doc, y) + 16;

  // ── Top Bidang badges ──────────────────────────────────────────────
  const topBidang = payload.minat?.topBidang ?? [];
  if (topBidang.length > 0) {
    y = ensureSpace(doc, y, 56, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("BIDANG MINAT TERTINGGI:", margin, y + 6);
    let bx = margin + 180;
    for (const b of topBidang) {
      doc.setFillColor(LIME);
      doc.rect(bx, y - 6, 28, 22, "F");
      doc.setLineWidth(1.2);
      doc.setDrawColor(BLACK);
      doc.rect(bx, y - 6, 28, 22);
      doc.setTextColor(BLACK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(b, bx + 10, y + 9);
      bx += 36;
    }
    y += 26;
  }

  // ── Program rekomendasi ────────────────────────────────────────────
  const programs = payload.minat?.programs ?? [];
  if (programs.length > 0) {
    y = ensureSpace(doc, y, 60, margin);
    y = sectionTitle(doc, "PROGRAM KEAHLIAN REKOMENDASI", margin, y, pageW);
    for (const p of programs) {
      const cardH = 30 + p.topAnswers.length * 14 + 8;
      y = ensureSpace(doc, y, cardH, margin);
      doc.setFillColor(CYAN);
      doc.rect(margin, y, pageW - margin * 2, 22, "F");
      doc.setLineWidth(1.2);
      doc.setDrawColor(BLACK);
      doc.rect(margin, y, pageW - margin * 2, 22);
      doc.setTextColor(BLACK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Bidang ${p.bidang} — ${p.kind}`, margin + 10, y + 15);
      y += 28;
      doc.setFontSize(10);
      for (const a of p.topAnswers) {
        doc.setFont("helvetica", "bold");
        doc.text(`• ${a.label}`, margin + 8, y);
        doc.setFont("helvetica", "normal");
        doc.text(`(${a.major})`, margin + 200, y, { maxWidth: pageW - margin * 2 - 210 });
        y += 14;
      }
      y += 6;
    }
  }
  return y;
}

// ──────────────────────────────────────────────────────────────────────
// Charts & Recommendations
// ──────────────────────────────────────────────────────────────────────
function drawBarChart(
  doc: jsPDF,
  items: [string, ScoringPayload["perSubtest"][string]][],
  margin: number,
  y: number,
  pageW: number,
): void {
  const innerW = pageW - margin * 2;
  const labelW = 150;
  const trackPad = 6;
  const barAreaW = innerW - labelW - 60;
  const rowH = 18;
  doc.setFontSize(9);
  for (let i = 0; i < items.length; i++) {
    const [, v] = items[i];
    const yi = y + i * rowH;
    const ratio = v.max > 0 ? v.raw / v.max : 0;
    const bw = ratio * barAreaW;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BLACK);
    doc.text(v.name, margin, yi + 12);
    doc.setFillColor(GREY);
    doc.rect(margin + labelW, yi + trackPad - 2, barAreaW, rowH - 8, "F");
    doc.setLineWidth(0.8);
    doc.setDrawColor(BLACK);
    doc.rect(margin + labelW, yi + trackPad - 2, barAreaW, rowH - 8);
    if (bw > 0) {
      doc.setFillColor(YELLOW);
      doc.rect(margin + labelW, yi + trackPad - 2, bw, rowH - 8, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.text(
      `${Math.round(ratio * 100)}%`,
      margin + labelW + barAreaW + 6,
      yi + 12,
    );
  }
}

function drawRecommendations(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  y: number,
  pageW: number,
): void {
  const colW = (pageW - margin * 2 - 12) / 2;
  const majors = payload.recommendations.majors.map((m) => [m]);
  const careers = payload.recommendations.careers.map((c) => [c]);
  if (majors.length === 0 && careers.length === 0) return;
  autoTable(doc, {
    startY: y,
    head: [["JURUSAN"]],
    body: majors.length > 0 ? majors : [["—"]],
    theme: "grid",
    styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 5 },
    headStyles: { fillColor: LIME, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin, right: margin + colW + 12 },
    tableWidth: colW,
  });
  autoTable(doc, {
    startY: y,
    head: [["PEKERJAAN"]],
    body: careers.length > 0 ? careers : [["—"]],
    theme: "grid",
    styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 5 },
    headStyles: { fillColor: PINK, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
    margin: { left: margin + colW + 12, right: margin },
    tableWidth: colW,
  });
}
