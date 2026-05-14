// Laporan EKIU — 1 lembar A4 portrait, kompak tapi lengkap.
//
// Konten BAKAT (urut atas → bawah):
//   1. Header: brand EKIU + judul laporan + kode laporan
//   2. Identitas peserta (kompak, 1 tabel hairline)
//   3. Kartu EKIU: skor IQ + band + CI + formula
//   4. Tabel 4 Kategori Akumulasi (Penalaran/Verbal/Kuantitatif/Spasial)
//   5. Tabel skor per subtes + visual bar mini
//   6. Rekomendasi jurusan & karir (2 kolom)
//   7. Disclaimer ringkas
//   8. Footer
//
// Konten MINAT (urut):
//   1. Header
//   2. Identitas peserta
//   3. Kartu 3 bidang minat dominan
//   4. Tabel skor bidang minat
//   5. Program keahlian terekomendasi (kompak)
//   6. Rekomendasi jurusan & karir
//   7. Disclaimer & footer

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

// ── PALETTE ─────────────────────────────────────────────────────────────
const INK = "#0F172A";        // primary text (slate-900)
const SOFT_INK = "#475569";   // secondary text (slate-600)
const HAIRLINE = "#CBD5E1";   // borders (slate-300)
const STRIPE = "#F8FAFC";     // alt row (slate-50)
const PANEL = "#F1F5F9";      // soft panel (slate-100)
const WHITE = "#FFFFFF";
const ACCENT = "#FACC15";     // brand yellow
const ACCENT_DEEP = "#CA8A04"; // brand yellow darker
const PRIMARY = "#0EA5E9";    // sky-500
const SUCCESS = "#16A34A";    // green-600
const WARN = "#F97316";       // orange-500
const DANGER = "#DC2626";     // red-600
const VIOLET = "#7C3AED";

// Tier colors for category chips
const TIER_COLORS: Record<string, string> = {
  BR: DANGER,
  RR: WARN,
  AR: ACCENT_DEEP,
  B: PRIMARY,
  LB: SUCCESS,
};

// Selalu render di zona waktu Asia/Jakarta (WIB) supaya waktu di laporan
// konsisten dengan waktu siswa di Indonesia — bukan UTC server.
function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }) + " WIB";
}

function fmtDateOnly(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function hexToRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function setFillHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRGB(hex);
  doc.setFillColor(r, g, b);
}
function setDrawHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRGB(hex);
  doc.setDrawColor(r, g, b);
}
function setTextHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRGB(hex);
  doc.setTextColor(r, g, b);
}

function nextY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? fallback;
}

export function buildReportPDF(submission: SubmissionInfo, payload: ScoringPayload): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;

  drawHeader(doc, submission, margin, pageW);

  // Identitas peserta — kompak 2 baris × 4 sel.
  const y = drawIdentity(doc, submission, margin, 88);

  if (payload.testKind === "BAKAT") {
    drawBakatBody(doc, payload, margin, y, pageW, pageH);
  } else {
    drawMinatBody(doc, payload, margin, y, pageW, pageH);
  }

  drawFooter(doc, margin, pageW, pageH);
  return Buffer.from(doc.output("arraybuffer"));
}

// ── HEADER ──────────────────────────────────────────────────────────────
function drawHeader(doc: jsPDF, sub: SubmissionInfo, margin: number, pageW: number): void {
  // Aksen kuning tipis di atas
  setFillHex(doc, ACCENT);
  doc.rect(0, 0, pageW, 4, "F");

  // Brand mark kotak hitam-kuning
  setFillHex(doc, INK);
  doc.rect(margin, 14, 22, 22, "F");
  setFillHex(doc, ACCENT);
  doc.rect(margin + 4, 18, 14, 14, "F");

  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("EKIU", margin + 30, 26);
  doc.setFont("helvetica", "normal");
  setTextHex(doc, SOFT_INK);
  doc.setFontSize(7.6);
  doc.text("ESTIMASI KEMAMPUAN INTELEKTUAL UMUM", margin + 30, 35);

  // Judul laporan
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const title = sub.testKind === "BAKAT" ? "Laporan Tes Bakat" : "Laporan Tes Minat";
  doc.text(title, margin, 58);
  doc.setFont("helvetica", "normal");
  setTextHex(doc, SOFT_INK);
  doc.setFontSize(8.6);
  doc.text(
    `${sub.fullName || "Peserta"}  •  Dicetak ${fmtDate(new Date())}`,
    margin,
    70,
  );

  // Badge ID di kanan (kompak)
  const badgeW = 110;
  const badgeH = 50;
  const badgeX = pageW - margin - badgeW;
  const badgeY = 14;
  setFillHex(doc, INK);
  doc.rect(badgeX, badgeY, badgeW, badgeH, "F");
  setFillHex(doc, ACCENT);
  doc.rect(badgeX, badgeY, badgeW, 3, "F");
  setTextHex(doc, WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("KODE LAPORAN", badgeX + 10, badgeY + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(sub.id.slice(0, 8).toUpperCase(), badgeX + 10, badgeY + 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Rahasia • Internal", badgeX + 10, badgeY + 44);

  // Hairline divider
  setDrawHex(doc, HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(margin, 80, pageW - margin, 80);
}

// ── IDENTITAS ───────────────────────────────────────────────────────────
function drawIdentity(
  doc: jsPDF,
  sub: SubmissionInfo,
  margin: number,
  yIn: number,
): number {
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("IDENTITAS PESERTA", margin, yIn);

  const tglLahir = sub.birthDate ? fmtDateOnly(sub.birthDate) : "—";
  const tempatTgl = `${sub.birthPlace || "—"} / ${tglLahir}`;
  const idData: [string, string, string, string][] = [
    [
      "Nama",
      sub.fullName || "—",
      "L/P",
      sub.gender || "—",
    ],
    [
      "Tempat/Tgl Lahir",
      tempatTgl,
      "Usia",
      sub.age != null ? `${sub.age} th` : "—",
    ],
    [
      "Sekolah",
      sub.school || "—",
      "Kelas/Jurusan",
      `${sub.grade || "—"} / ${sub.major || "—"}`,
    ],
    [
      "Mulai",
      fmtDate(sub.startedAt),
      "Selesai",
      fmtDate(sub.finishedAt),
    ],
  ];
  autoTable(doc, {
    startY: yIn + 4,
    body: idData,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 2.5, bottom: 2.5, left: 6, right: 6 },
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: hexToRGB(SOFT_INK), cellWidth: 76 },
      1: { fontStyle: "bold", cellWidth: "auto" },
      2: { fontStyle: "bold", textColor: hexToRGB(SOFT_INK), cellWidth: 76 },
      3: { fontStyle: "bold", cellWidth: 130 },
    },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const x1 = data.cell.x;
      const x2 = data.cell.x + data.cell.width;
      const yLine = data.cell.y + data.cell.height;
      setDrawHex(doc, HAIRLINE);
      doc.setLineWidth(0.3);
      doc.line(x1, yLine, x2, yLine);
    },
  });
  return nextY(doc, yIn + 4) + 8;
}

// ── BAKAT BODY (1 PAGE) ─────────────────────────────────────────────────
function drawBakatBody(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
  pageH: number,
): number {
  let y = yIn;

  // 1) Kartu EKIU
  y = drawIqCard(doc, payload, margin, y, pageW);

  // 2) Akumulasi 4 Kategori
  const cats = payload.bakat?.iqCategories ?? [];
  if (cats.length > 0) {
    y = drawIqCategoryTable(doc, cats, margin, y);
  }

  // 3) Skor per subtes
  y = drawSubtestTable(doc, payload, margin, y);

  // 4) Rekomendasi (2 kolom)
  y = drawRecommendations(doc, payload, margin, y, pageW);

  // 5) Narasi singkat
  const narrative = payload.bakat?.narrative;
  if (narrative) {
    y = drawNarrative(doc, narrative, margin, y, pageW);
  }

  // 6) Disclaimer ringkas
  drawDisclaimerOneLine(doc, margin, pageW, pageH);
  return y;
}

// ── NARASI SINGKAT ───────────────────────────────────────────────────────
function drawNarrative(
  doc: jsPDF,
  text: string,
  margin: number,
  yIn: number,
  pageW: number,
): number {
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RINGKASAN", margin, yIn);
  setTextHex(doc, SOFT_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  const lines = doc.splitTextToSize(text, pageW - margin * 2);
  doc.text(lines, margin, yIn + 12);
  return yIn + 12 + lines.length * 10 + 4;
}

// ── EKIU IQ CARD ────────────────────────────────────────────────────────
function drawIqCard(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
): number {
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ESTIMASI KEMAMPUAN INTELEKTUAL UMUM (EKIU)", margin, yIn);

  const y = yIn + 4;
  const cardH = 82;
  setFillHex(doc, PANEL);
  doc.rect(margin, y, pageW - margin * 2, cardH, "F");
  setDrawHex(doc, HAIRLINE);
  doc.setLineWidth(0.5);
  doc.rect(margin, y, pageW - margin * 2, cardH);

  // Panel skor di kiri
  const scoreW = 120;
  setFillHex(doc, INK);
  doc.rect(margin, y, scoreW, cardH, "F");
  setFillHex(doc, ACCENT);
  doc.rect(margin, y, scoreW, 3, "F");

  const fsiq = payload.bakat?.fsiq;
  setTextHex(doc, WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.text("SKOR IQ PREDIKTIF", margin + 10, y + 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  const score = fsiq?.score ?? payload.iqEstimate ?? null;
  doc.text(score != null ? String(score) : "—", margin + 10, y + 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  if (fsiq) {
    doc.text(`CI 95%: ${fsiq.ci95Low}\u2013${fsiq.ci95High}`, margin + 10, y + 68);
    doc.text(`Percentile: ${fsiq.percentile}`, margin + 10, y + 76);
  } else {
    doc.text("Berbasis 8 subtes Bakat.", margin + 10, y + 68);
    doc.text("Bukan IQ klinis.", margin + 10, y + 76);
  }

  // Bagian kanan
  const rightX = margin + scoreW + 12;
  const rightW = pageW - margin * 2 - scoreW - 22;

  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const bandLabel =
    fsiq?.band.label ?? payload.iqInterpretation?.band ?? "—";
  doc.text(bandLabel, rightX, y + 18);

  doc.setFont("helvetica", "normal");
  setTextHex(doc, SOFT_INK);
  doc.setFontSize(8.4);
  const desc = fsiq?.band.descId ?? payload.iqInterpretation?.description ?? "";
  const descLines = doc.splitTextToSize(desc, rightW);
  doc.text(descLines, rightX, y + 30);

  // Formula box
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.text("FORMULA AKUMULASI", rightX, y + 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setTextHex(doc, SOFT_INK);
  const formula =
    fsiq?.formula ??
    "IQ = (0.30 \u00D7 Penalaran) + (0.25 \u00D7 Verbal) + (0.25 \u00D7 Kuantitatif) + (0.20 \u00D7 Spasial)";
  const fLines = doc.splitTextToSize(formula, rightW);
  doc.text(fLines, rightX, y + 62);
  doc.setFontSize(7.4);
  doc.text(
    "-> hasil dikonversi ke skala IQ (M=100, SD=15).",
    rightX,
    y + 76,
  );

  return y + cardH + 10;
}

// ── 4 Kategori Akumulasi IQ ──────────────────────────────────────────────
type IqCategory = NonNullable<NonNullable<ScoringPayload["bakat"]>["iqCategories"]>[number];

function drawIqCategoryTable(
  doc: jsPDF,
  cats: IqCategory[],
  margin: number,
  yIn: number,
): number {
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AKUMULASI 4 KATEGORI", margin, yIn);

  const rows = cats.map((c) => [
    c.name,
    `${(c.weight * 100).toFixed(0)}%`,
    String(c.scaled),
    String(c.percentile),
    c.band.label,
  ]);

  autoTable(doc, {
    startY: yIn + 4,
    head: [["Kategori", "Bobot", "Skor (M=100)", "Percentile", "Kategori IQ"]],
    body: rows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.6,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 3.5, bottom: 3.5, left: 8, right: 8 },
    },
    headStyles: {
      fillColor: hexToRGB(INK),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { cellWidth: 48, halign: "center" },
      2: { cellWidth: 70, halign: "center" },
      3: { cellWidth: 60, halign: "center" },
      4: { cellWidth: 110, halign: "left" },
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin, right: margin },
  });
  return nextY(doc, yIn + 4) + 10;
}

// ── SUBTEST TABLE ───────────────────────────────────────────────────────
function drawSubtestTable(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
): number {
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SKOR PER SUBTES (NORMA STANDAR)", margin, yIn);

  const items = Object.entries(payload.perSubtest);
  const tableRows = items.map(([, v]) => [
    v.name,
    `${v.raw}/${v.max}`,
    `${Math.round((v.raw / Math.max(1, v.max)) * 100)}%`,
    v.percentile != null ? String(v.percentile) : "—",
    v.tScore != null ? String(v.tScore) : "—",
    v.stanine != null ? String(v.stanine) : "—",
    v.categoryLabel ?? "—",
    v.categoryCode ?? "",
  ]);
  autoTable(doc, {
    startY: yIn + 4,
    head: [["Subtes", "Skor", "%", "PR", "T", "St", "Kategori", ""]],
    body: tableRows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.2,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 3, bottom: 3, left: 6, right: 6 },
    },
    headStyles: {
      fillColor: hexToRGB(INK),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 7.6,
    },
    columnStyles: {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { cellWidth: 44, halign: "center" },
      2: { cellWidth: 30, halign: "center" },
      3: { cellWidth: 28, halign: "center" },
      4: { cellWidth: 28, halign: "center" },
      5: { cellWidth: 26, halign: "center" },
      6: { cellWidth: 90, halign: "left" },
      7: { cellWidth: 24, halign: "center" },
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index !== 7) return;
      const code = String(tableRows[data.row.index][7] || "");
      if (!code) return;
      const color = TIER_COLORS[code] ?? SOFT_INK;
      const cx = data.cell.x + 3;
      const cy = data.cell.y + 3;
      const cw = data.cell.width - 6;
      const ch = data.cell.height - 6;
      setFillHex(doc, color);
      doc.rect(cx, cy, cw, ch, "F");
      setTextHex(doc, WHITE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.6);
      const tw = doc.getTextWidth(code);
      doc.text(code, cx + (cw - tw) / 2, cy + ch / 2 + 3);
      setTextHex(doc, INK);
    },
  });
  const y = nextY(doc, yIn + 4) + 4;
  setTextHex(doc, SOFT_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    "Keterangan: PR = Percentile Rank (1\u201399). T = T-Score (M=50, SD=10). St = Stanine (1\u20139, M=5).",
    margin,
    y,
  );
  return y + 8;
}

// ── REKOMENDASI (2 kolom) ────────────────────────────────────────────────
function drawRecommendations(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
): number {
  const majors = payload.recommendations.majors.slice(0, 6);
  const careers = payload.recommendations.careers.slice(0, 6);
  if (majors.length === 0 && careers.length === 0) return yIn;

  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("REKOMENDASI", margin, yIn);

  const colW = (pageW - margin * 2 - 12) / 2;
  const yStart = yIn + 4;
  autoTable(doc, {
    startY: yStart,
    head: [["JURUSAN"]],
    body: majors.length > 0 ? majors.map((m) => [m]) : [["—"]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.4,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 2.5, bottom: 2.5, left: 8, right: 8 },
    },
    headStyles: {
      fillColor: hexToRGB(ACCENT),
      textColor: hexToRGB(INK),
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin, right: margin + colW + 12 },
    tableWidth: colW,
  });
  autoTable(doc, {
    startY: yStart,
    head: [["PEKERJAAN"]],
    body: careers.length > 0 ? careers.map((c) => [c]) : [["—"]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.4,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 2.5, bottom: 2.5, left: 8, right: 8 },
    },
    headStyles: {
      fillColor: hexToRGB(PRIMARY),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin + colW + 12, right: margin },
    tableWidth: colW,
  });
  return nextY(doc, yStart) + 8;
}

// ── DISCLAIMER 1-baris ───────────────────────────────────────────────────
function drawDisclaimerOneLine(
  doc: jsPDF,
  margin: number,
  pageW: number,
  pageH: number,
): void {
  const text =
    "Disclaimer: laporan ini bersifat skrining minat & bakat (BUKAN diagnosis klinis). Skor IQ adalah estimasi profil dengan formula 0.30 Penalaran + 0.25 Verbal + 0.25 Kuantitatif + 0.20 Spasial, dikonversi ke skala IQ (M=100, SD=15). Untuk diagnosis klinis konsultasikan dengan psikolog berlisensi.";
  const boxY = pageH - 56;
  setFillHex(doc, "#FEF3C7");
  doc.rect(margin, boxY, pageW - margin * 2, 22, "F");
  setDrawHex(doc, ACCENT_DEEP);
  doc.setLineWidth(0.4);
  doc.rect(margin, boxY, pageW - margin * 2, 22);
  setFillHex(doc, ACCENT_DEEP);
  doc.rect(margin, boxY, 3, 22, "F");
  setTextHex(doc, "#78350F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("DISCLAIMER", margin + 8, boxY + 9);
  setTextHex(doc, INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const lines = doc.splitTextToSize(text, pageW - margin * 2 - 80);
  doc.text(lines.slice(0, 2), margin + 70, boxY + 9);
}

// ── FOOTER ──────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, margin: number, pageW: number, pageH: number): void {
  setDrawHex(doc, HAIRLINE);
  doc.setLineWidth(0.4);
  doc.line(margin, pageH - 24, pageW - margin, pageH - 24);
  setTextHex(doc, SOFT_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.text(
    "EKIU \u2014 Estimasi Kemampuan Intelektual Umum  \u2022  Rahasia & untuk keperluan internal.",
    margin,
    pageH - 12,
  );
  doc.setFont("helvetica", "bold");
  setTextHex(doc, INK);
  const totalPages = doc.getNumberOfPages();
  const txt = `Hal 1 / ${totalPages}`;
  const w = doc.getTextWidth(txt);
  doc.text(txt, pageW - margin - w, pageH - 12);
}

// ── MINAT BODY (1 PAGE) ──────────────────────────────────────────────────
function drawMinatBody(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  pageW: number,
  pageH: number,
): number {
  let y = yIn;

  // Kartu 3 Bidang Minat Tertinggi
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("3 BIDANG MINAT TERTINGGI", margin, y);
  const cardY = y + 4;
  const cardH = 56;
  setFillHex(doc, PANEL);
  doc.rect(margin, cardY, pageW - margin * 2, cardH, "F");
  setDrawHex(doc, HAIRLINE);
  doc.setLineWidth(0.5);
  doc.rect(margin, cardY, pageW - margin * 2, cardH);
  setFillHex(doc, VIOLET);
  doc.rect(margin, cardY, 3, cardH, "F");

  const topBidang = payload.minat?.topBidang ?? [];
  let bx = margin + 14;
  const by = cardY + 14;
  for (const b of topBidang) {
    setFillHex(doc, ACCENT);
    doc.rect(bx, by, 28, 28, "F");
    setDrawHex(doc, INK);
    doc.setLineWidth(0.6);
    doc.rect(bx, by, 28, 28);
    setTextHex(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const tw = doc.getTextWidth(b);
    doc.text(b, bx + (28 - tw) / 2, by + 19);
    bx += 34;
  }
  setTextHex(doc, SOFT_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  doc.text(
    "Huruf A\u2013H mewakili 8 bidang minat yang dipetakan ke program keahlian SMK.",
    bx + 8,
    by + 12,
    { maxWidth: pageW - margin * 2 - (bx - margin) - 16 },
  );
  doc.text(
    "Daftar lengkap program ada di bawah \u2014 berurut dari yang paling selaras.",
    bx + 8,
    by + 24,
    { maxWidth: pageW - margin * 2 - (bx - margin) - 16 },
  );
  y = cardY + cardH + 10;

  // Skor Bidang Minat (tabel kompak)
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SKOR BIDANG MINAT", margin, y);
  const bidangEntries = Object.entries(payload.minat?.bidangScores ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const totalBidang = bidangEntries.reduce((sum, [, v]) => sum + v, 0) || 1;
  const bidangRows = bidangEntries.map(([k, v]) => [
    k,
    String(v),
    `${Math.round((v / totalBidang) * 100)}%`,
  ]);
  autoTable(doc, {
    startY: y + 4,
    head: [["Bidang", "Skor", "%"]],
    body: bidangRows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.4,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 3, bottom: 3, left: 8, right: 8 },
    },
    headStyles: {
      fillColor: hexToRGB(INK),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 70, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 70, halign: "center" },
      2: { cellWidth: 70, halign: "center" },
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin, right: margin },
  });
  y = nextY(doc, y + 4) + 10;

  // Program rekomendasi (kompak: 1 baris per bidang)
  const programs = payload.minat?.programs ?? [];
  if (programs.length > 0) {
    setTextHex(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PROGRAM KEAHLIAN DIREKOMENDASIKAN", margin, y);
    const progRows = programs.map((p) => {
      const ans = p.topAnswers
        .map((a) => `${a.label} (${a.count}\u00D7)`)
        .join("; ");
      return [p.bidang, p.kind || "—", ans || "—"];
    });
    autoTable(doc, {
      startY: y + 4,
      head: [["Bidang", "Program", "Top Pilihan"]],
      body: progRows,
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8.2,
        lineWidth: 0.3,
        lineColor: hexToRGB(HAIRLINE),
        textColor: hexToRGB(INK),
        cellPadding: { top: 3, bottom: 3, left: 8, right: 8 },
      },
      headStyles: {
        fillColor: hexToRGB(INK),
        textColor: hexToRGB(WHITE),
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 50, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 150, halign: "left" },
        2: { cellWidth: "auto", halign: "left" },
      },
      alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
      margin: { left: margin, right: margin },
    });
    y = nextY(doc, y + 4) + 10;
  }

  // Rekomendasi jurusan & karir
  y = drawRecommendations(doc, payload, margin, y, pageW);

  // Disclaimer + footer
  drawDisclaimerOneLine(doc, margin, pageW, pageH);
  return y;
}
