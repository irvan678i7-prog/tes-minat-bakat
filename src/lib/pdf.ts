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
    month: "long",
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
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function nextY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? fallback;
}

function setFillHex(doc: jsPDF, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  doc.setFillColor(r, g, b);
}
function setDrawHex(doc: jsPDF, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  doc.setDrawColor(r, g, b);
}
function setTextHex(doc: jsPDF, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  doc.setTextColor(r, g, b);
}

export function buildReportPDF(submission: SubmissionInfo, payload: ScoringPayload): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 42;

  drawHeader(doc, submission, margin, pageW);

  // ── IDENTITAS PESERTA ────────────────────────────────────────────────
  let y = 168;
  y = sectionTitle(doc, "Identitas Peserta", margin, y, pageW);
  const tglLahir = submission.birthDate ? fmtDateOnly(submission.birthDate) : "—";
  const tempatTgl = `${submission.birthPlace || "—"} / ${tglLahir}`;
  const idData: [string, string, string, string][] = [
    ["Nama Lengkap", submission.fullName || "—", "Jenis Kelamin", submission.gender || "—"],
    ["Tempat / Tgl Lahir", tempatTgl, "Usia", submission.age != null ? `${submission.age} tahun` : "—"],
    ["Sekolah", submission.school || "—", "Kelas / Jurusan", `${submission.grade || "—"} / ${submission.major || "—"}`],
    ["Telepon", submission.phone || "—", "Email", submission.email || "—"],
    ["Mulai Tes", fmtDate(submission.startedAt), "Selesai Tes", fmtDate(submission.finishedAt)],
  ];
  autoTable(doc, {
    startY: y,
    body: idData,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      lineWidth: 0.4,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 6, bottom: 6, left: 10, right: 10 },
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: hexToRGB(SOFT_INK), cellWidth: 110 },
      1: { fontStyle: "bold", cellWidth: "auto" },
      2: { fontStyle: "bold", textColor: hexToRGB(SOFT_INK), cellWidth: 110 },
      3: { fontStyle: "bold", cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      if (data.section === "body" && data.row.index < idData.length) {
        // bottom hairline only
        const x1 = data.cell.x;
        const x2 = data.cell.x + data.cell.width;
        const yLine = data.cell.y + data.cell.height;
        setDrawHex(doc, HAIRLINE);
        doc.setLineWidth(0.4);
        doc.line(x1, yLine, x2, yLine);
      }
    },
  });
  y = nextY(doc, y) + 22;

  if (payload.testKind === "BAKAT") {
    y = drawBakatSection(doc, payload, margin, y, pageW);
  } else {
    y = drawMinatSection(doc, payload, margin, y, pageW);
  }

  // ── REKOMENDASI ──────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 140, margin);
  y = sectionTitle(doc, "Rekomendasi Jurusan & Pekerjaan", margin, y, pageW);
  drawRecommendations(doc, payload, margin, y, pageW);

  // ── FOOTER & PAGE NUMBERS ────────────────────────────────────────────
  drawFooters(doc, margin, pageW);

  return Buffer.from(doc.output("arraybuffer"));
}

function hexToRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function drawHeader(doc: jsPDF, sub: SubmissionInfo, margin: number, pageW: number): void {
  // Top thin yellow accent bar
  setFillHex(doc, ACCENT);
  doc.rect(0, 0, pageW, 6, "F");

  // Main banner — clean white with subtle ink content
  setFillHex(doc, WHITE);
  doc.rect(0, 6, pageW, 130, "F");

  // Vertical accent stripe at the left
  setFillHex(doc, INK);
  doc.rect(0, 6, 6, 130, "F");

  // Brand mark
  setFillHex(doc, INK);
  doc.rect(margin, 28, 28, 28, "F");
  setFillHex(doc, ACCENT);
  doc.rect(margin + 6, 34, 16, 16, "F");

  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TES MINAT & BAKAT", margin + 38, 42);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...hexToRGB(SOFT_INK));
  doc.setFontSize(9);
  doc.text("Laporan Profil Talenta dan Aptitude", margin + 38, 56);

  // Title (centered-ish, large)
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  const title = sub.testKind === "BAKAT" ? "Laporan Tes Bakat" : "Laporan Tes Minat";
  doc.text(title, margin, 96);

  // Sub-line: name + date small badges
  setTextHex(doc, SOFT_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const subline = `${sub.fullName || "Peserta"}  •  Dicetak ${fmtDate(new Date())}`;
  doc.text(subline, margin, 116);

  // Right-side badge for report code
  const badgeW = 130;
  const badgeH = 64;
  const badgeX = pageW - margin - badgeW;
  const badgeY = 32;
  setFillHex(doc, INK);
  doc.rect(badgeX, badgeY, badgeW, badgeH, "F");
  setFillHex(doc, ACCENT);
  doc.rect(badgeX, badgeY, badgeW, 4, "F");
  setTextHex(doc, WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("KODE LAPORAN", badgeX + 12, badgeY + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(sub.id.slice(0, 8).toUpperCase(), badgeX + 12, badgeY + 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Rahasia • Internal", badgeX + 12, badgeY + 56);

  // Bottom border
  setFillHex(doc, HAIRLINE);
  doc.rect(0, 136, pageW, 0.6, "F");
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 56) {
    doc.addPage();
    return margin + 18;
  }
  return y;
}

function sectionTitle(doc: jsPDF, label: string, margin: number, y: number, pageW: number): number {
  // Slim section header: tiny accent square + label + hairline divider
  const labelUpper = label.toUpperCase();
  const barH = 22;
  setFillHex(doc, ACCENT);
  doc.rect(margin, y + 4, 4, barH - 8, "F");
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text(labelUpper, margin + 12, y + 16);
  // small mono numeric "block" right side e.g. "01"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setTextHex(doc, SOFT_INK);
  // Hairline under
  setDrawHex(doc, HAIRLINE);
  doc.setLineWidth(0.6);
  doc.line(margin, y + barH + 2, pageW - margin, y + barH + 2);
  return y + barH + 12;
}

function drawFooters(doc: jsPDF, margin: number, pageW: number): void {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    setDrawHex(doc, HAIRLINE);
    doc.setLineWidth(0.6);
    doc.line(margin, pageH - 32, pageW - margin, pageH - 32);
    setTextHex(doc, SOFT_INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Laporan Tes Minat & Bakat — Dicetak otomatis. Bersifat rahasia.", margin, pageH - 18);
    doc.setFont("helvetica", "bold");
    setTextHex(doc, INK);
    const txt = `Halaman ${i} / ${totalPages}`;
    const w = doc.getTextWidth(txt);
    doc.text(txt, pageW - margin - w, pageH - 18);
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

  // ── Ringkasan Card ─────────────────────────────────────────────────
  y = ensureSpace(doc, y, 150, margin);
  y = sectionTitle(doc, "Ringkasan Hasil", margin, y, pageW);
  const cardH = 110;
  setFillHex(doc, PANEL);
  doc.rect(margin, y, pageW - margin * 2, cardH, "F");
  setDrawHex(doc, HAIRLINE);
  doc.setLineWidth(0.6);
  doc.rect(margin, y, pageW - margin * 2, cardH);

  // Left: IQ panel
  const iqW = 150;
  setFillHex(doc, INK);
  doc.rect(margin, y, iqW, cardH, "F");
  setFillHex(doc, ACCENT);
  doc.rect(margin, y, iqW, 4, "F");
  setTextHex(doc, WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("ESTIMASI IQ", margin + 14, y + 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(44);
  doc.text(String(payload.iqEstimate ?? "—"), margin + 14, y + 76);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Berbasis 9 subtes Bakat.", margin + 14, y + 96);
  doc.text("Bukan IQ klinis.", margin + 14, y + 106);

  // Right: band + description
  const rightX = margin + iqW + 16;
  const rightW = pageW - margin * 2 - iqW - 28;
  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(payload.iqInterpretation?.band ?? "—", rightX, y + 32);
  doc.setFont("helvetica", "normal");
  setTextHex(doc, SOFT_INK);
  doc.setFontSize(10);
  const desc = payload.iqInterpretation?.description ?? "";
  const descLines = doc.splitTextToSize(desc, rightW);
  doc.text(descLines, rightX, y + 50);

  // Top 3 dominant subtests as small chips (right-bottom)
  const items = Object.entries(payload.perSubtest);
  const sortedTop = items
    .map(([, v]) => ({ ...v, ratio: v.max > 0 ? v.raw / v.max : 0 }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
  if (sortedTop.length > 0) {
    setTextHex(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("3 BAKAT DOMINAN", rightX, y + 88);
    let cx = rightX;
    const cy = y + 92;
    for (const t of sortedTop) {
      const label = t.name;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const w = doc.getTextWidth(label) + 16;
      setFillHex(doc, ACCENT);
      doc.rect(cx, cy, w, 16, "F");
      setDrawHex(doc, INK);
      doc.setLineWidth(0.6);
      doc.rect(cx, cy, w, 16);
      setTextHex(doc, INK);
      doc.text(label, cx + 8, cy + 11);
      cx += w + 6;
      if (cx > pageW - margin - 60) break;
    }
  }
  y += cardH + 24;

  // ── Skor per Subtes (table) ────────────────────────────────────────
  y = ensureSpace(doc, y, 160, margin);
  y = sectionTitle(doc, "Skor Per Subtes", margin, y, pageW);
  const tableRows = items.map(([, v]) => [
    v.name,
    `${v.raw} / ${v.max}`,
    `${Math.round((v.raw / Math.max(1, v.max)) * 100)}%`,
    v.categoryLabel ?? "—",
    v.categoryCode ?? "",
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Subtes", "Skor", "%", "Kategori", ""]],
    body: tableRows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9.8,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 7, bottom: 7, left: 10, right: 10 },
    },
    headStyles: {
      fillColor: hexToRGB(INK),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { cellWidth: 70, halign: "center" },
      2: { cellWidth: 50, halign: "center" },
      3: { cellWidth: 110, halign: "left" },
      4: { cellWidth: 30, halign: "center" },
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index !== 4) return;
      const code = String(tableRows[data.row.index][4] || "");
      if (!code) return;
      const color = TIER_COLORS[code] ?? SOFT_INK;
      const cx = data.cell.x + 6;
      const cy = data.cell.y + 6;
      const cw = data.cell.width - 12;
      const ch = data.cell.height - 12;
      setFillHex(doc, color);
      doc.rect(cx, cy, cw, ch, "F");
      setTextHex(doc, WHITE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const tw = doc.getTextWidth(code);
      doc.text(code, cx + (cw - tw) / 2, cy + ch / 2 + 3);
      setTextHex(doc, INK);
    },
  });
  y = nextY(doc, y) + 22;

  // ── Visualisasi bar chart ──────────────────────────────────────────
  const chartH = items.length * 20 + 16;
  y = ensureSpace(doc, y, chartH + 40, margin);
  y = sectionTitle(doc, "Visualisasi Skor (%)", margin, y, pageW);
  drawBarChart(doc, items, margin, y, pageW);
  y += chartH + 18;

  // ── Profil bakat teratas ───────────────────────────────────────────
  const topProfiles = payload.bakat?.topProfiles ?? [];
  if (topProfiles.length > 0) {
    y = ensureSpace(doc, y, 80, margin);
    y = sectionTitle(doc, "Profil Bakat Teratas", margin, y, pageW);
    for (const p of topProfiles) {
      const descLines = doc.splitTextToSize(p.description, pageW - margin * 2 - 28);
      const majorsLines = drawPillsHeight(doc, p.majors, pageW - margin * 2 - 28);
      const careersLines = drawPillsHeight(doc, p.careers, pageW - margin * 2 - 28);
      const profileH =
        20 + 6 + descLines.length * 12 + 18 + majorsLines * 22 + 18 + careersLines * 22 + 12;
      y = ensureSpace(doc, y, profileH, margin);

      // Card
      setFillHex(doc, WHITE);
      doc.rect(margin, y, pageW - margin * 2, profileH, "F");
      setDrawHex(doc, HAIRLINE);
      doc.setLineWidth(0.6);
      doc.rect(margin, y, pageW - margin * 2, profileH);
      // Left accent stripe
      setFillHex(doc, PRIMARY);
      doc.rect(margin, y, 4, profileH, "F");

      setTextHex(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(p.name, margin + 14, y + 18);
      // match badge
      const matchTxt = `${p.matchScore}/3 selaras`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const mtw = doc.getTextWidth(matchTxt) + 12;
      setFillHex(doc, PRIMARY);
      doc.rect(pageW - margin - mtw - 8, y + 6, mtw, 14, "F");
      setTextHex(doc, WHITE);
      doc.text(matchTxt, pageW - margin - mtw - 8 + 6, y + 16);

      // Description
      setTextHex(doc, SOFT_INK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(descLines, margin + 14, y + 36);
      let yy = y + 36 + descLines.length * 12 + 6;

      // Jurusan
      setTextHex(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text("Jurusan terkait", margin + 14, yy + 8);
      yy = drawPills(doc, p.majors, margin + 14, yy + 12, pageW - margin * 2 - 28, ACCENT, INK);
      yy += 8;
      // Karir
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text("Pilihan karir", margin + 14, yy + 4);
      yy = drawPills(doc, p.careers, margin + 14, yy + 8, pageW - margin * 2 - 28, PRIMARY, WHITE);

      y += profileH + 12;
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

  // ── Ringkasan Minat Card ───────────────────────────────────────────
  y = ensureSpace(doc, y, 110, margin);
  y = sectionTitle(doc, "Ringkasan Minat", margin, y, pageW);
  const cardH = 88;
  setFillHex(doc, PANEL);
  doc.rect(margin, y, pageW - margin * 2, cardH, "F");
  setDrawHex(doc, HAIRLINE);
  doc.setLineWidth(0.6);
  doc.rect(margin, y, pageW - margin * 2, cardH);
  // Left accent
  setFillHex(doc, VIOLET);
  doc.rect(margin, y, 4, cardH, "F");

  setTextHex(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("3 Bidang Minat Tertinggi", margin + 16, y + 24);

  const topBidang = payload.minat?.topBidang ?? [];
  let bx = margin + 16;
  const by = y + 36;
  for (const b of topBidang) {
    setFillHex(doc, ACCENT);
    doc.rect(bx, by, 30, 30, "F");
    setDrawHex(doc, INK);
    doc.setLineWidth(0.8);
    doc.rect(bx, by, 30, 30);
    setTextHex(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const tw = doc.getTextWidth(b);
    doc.text(b, bx + (30 - tw) / 2, by + 20);
    bx += 38;
  }
  // Description
  setTextHex(doc, SOFT_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(
    "Bidang minat menggambarkan area yang paling Anda sukai berdasarkan pasangan kata.",
    margin + 16 + topBidang.length * 38 + 8,
    by + 20,
    { maxWidth: pageW - margin * 2 - 16 - topBidang.length * 38 - 24 },
  );
  y += cardH + 22;

  // ── Skor Bidang Minat ──────────────────────────────────────────────
  y = ensureSpace(doc, y, 160, margin);
  y = sectionTitle(doc, "Skor Bidang Minat", margin, y, pageW);
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
    startY: y,
    head: [["Bidang", "Skor", "%"]],
    body: bidangRows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 10,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 7, bottom: 7, left: 10, right: 10 },
    },
    headStyles: {
      fillColor: hexToRGB(INK),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 80, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 80, halign: "center" },
      2: { cellWidth: 80, halign: "center" },
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin, right: margin },
  });
  y = nextY(doc, y) + 22;

  // ── Program rekomendasi ────────────────────────────────────────────
  const programs = payload.minat?.programs ?? [];
  if (programs.length > 0) {
    y = ensureSpace(doc, y, 80, margin);
    y = sectionTitle(doc, "Program Keahlian Direkomendasikan", margin, y, pageW);
    for (const p of programs) {
      const ansLines = p.topAnswers.length;
      const cardH = 30 + ansLines * 16 + 14;
      y = ensureSpace(doc, y, cardH, margin);
      // Card
      setFillHex(doc, WHITE);
      doc.rect(margin, y, pageW - margin * 2, cardH, "F");
      setDrawHex(doc, HAIRLINE);
      doc.setLineWidth(0.6);
      doc.rect(margin, y, pageW - margin * 2, cardH);
      setFillHex(doc, PRIMARY);
      doc.rect(margin, y, 4, cardH, "F");

      setTextHex(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Bidang ${p.bidang}`, margin + 14, y + 18);
      doc.setFont("helvetica", "normal");
      setTextHex(doc, SOFT_INK);
      doc.setFontSize(9.5);
      doc.text(p.kind, margin + 14, y + 32);

      // Top answers
      let yy = y + 46;
      for (const a of p.topAnswers) {
        setTextHex(doc, INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text(`• ${a.label}`, margin + 18, yy);
        doc.setFont("helvetica", "normal");
        setTextHex(doc, SOFT_INK);
        const cnt = `(${a.count}×)`;
        doc.text(cnt, margin + 14 + 250, yy);
        doc.text(`→ ${a.major}`, margin + 14 + 290, yy, {
          maxWidth: pageW - margin * 2 - 14 - 290,
        });
        yy += 14;
      }

      y += cardH + 10;
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
  const labelW = 156;
  const valueW = 36;
  const trackPad = 4;
  const barAreaW = innerW - labelW - valueW - 4;
  const rowH = 20;
  doc.setFontSize(9.5);
  for (let i = 0; i < items.length; i++) {
    const [, v] = items[i];
    const yi = y + i * rowH;
    const ratio = v.max > 0 ? v.raw / v.max : 0;
    const bw = ratio * barAreaW;
    setTextHex(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.text(v.name, margin, yi + 13);
    // Track
    setFillHex(doc, STRIPE);
    doc.rect(margin + labelW, yi + trackPad, barAreaW, rowH - 8, "F");
    setDrawHex(doc, HAIRLINE);
    doc.setLineWidth(0.4);
    doc.rect(margin + labelW, yi + trackPad, barAreaW, rowH - 8);
    if (bw > 0) {
      const cat = v.categoryCode ?? "RR";
      setFillHex(doc, TIER_COLORS[cat] ?? PRIMARY);
      doc.rect(margin + labelW, yi + trackPad, bw, rowH - 8, "F");
    }
    setTextHex(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.text(`${Math.round(ratio * 100)}%`, margin + labelW + barAreaW + 6, yi + 13);
  }
}

function drawRecommendations(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  y: number,
  pageW: number,
): void {
  const colW = (pageW - margin * 2 - 16) / 2;
  const majors = payload.recommendations.majors.map((m) => [m]);
  const careers = payload.recommendations.careers.map((c) => [c]);
  if (majors.length === 0 && careers.length === 0) return;
  autoTable(doc, {
    startY: y,
    head: [["JURUSAN"]],
    body: majors.length > 0 ? majors : [["—"]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 10,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 6, bottom: 6, left: 10, right: 10 },
    },
    headStyles: {
      fillColor: hexToRGB(ACCENT),
      textColor: hexToRGB(INK),
      fontStyle: "bold",
      fontSize: 9.5,
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin, right: margin + colW + 16 },
    tableWidth: colW,
  });
  autoTable(doc, {
    startY: y,
    head: [["PEKERJAAN"]],
    body: careers.length > 0 ? careers : [["—"]],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 10,
      lineWidth: 0.3,
      lineColor: hexToRGB(HAIRLINE),
      textColor: hexToRGB(INK),
      cellPadding: { top: 6, bottom: 6, left: 10, right: 10 },
    },
    headStyles: {
      fillColor: hexToRGB(PRIMARY),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 9.5,
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    margin: { left: margin + colW + 16, right: margin },
    tableWidth: colW,
  });
}

// ── Helper: pills (chips) ────────────────────────────────────────────
function drawPillsHeight(doc: jsPDF, items: string[], maxW: number): number {
  if (items.length === 0) return 1;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let lines = 1;
  let used = 0;
  for (const it of items) {
    const w = doc.getTextWidth(it) + 16;
    if (used + w > maxW) {
      lines += 1;
      used = w + 6;
    } else {
      used += w + 6;
    }
  }
  return lines;
}

function drawPills(
  doc: jsPDF,
  items: string[],
  x: number,
  y: number,
  maxW: number,
  fill: string,
  text: string,
): number {
  if (items.length === 0) return y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let cx = x;
  let cy = y;
  const h = 16;
  for (const it of items) {
    const w = doc.getTextWidth(it) + 16;
    if (cx + w > x + maxW) {
      cx = x;
      cy += h + 6;
    }
    setFillHex(doc, fill);
    doc.rect(cx, cy, w, h, "F");
    setDrawHex(doc, INK);
    doc.setLineWidth(0.4);
    doc.rect(cx, cy, w, h);
    setTextHex(doc, text);
    doc.text(it, cx + 8, cy + 11);
    cx += w + 6;
  }
  return cy + h;
}
