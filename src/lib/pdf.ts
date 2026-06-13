import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScoringPayload } from "./scoring";
import {
  BOBOT_IPA_PCT,
  BOBOT_IPS_PCT,
  KOMPONEN_LABEL,
  type KomponenKode,
} from "./penjurusan";

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

function fmtDateTime(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtBirth(d?: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function truncate(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + "…") > maxW) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/**
 * Build the per-submission report on a single A4 page (portrait).
 *
 * Layout is intentionally tight: section title bars are 12pt, body uses
 * 7–8pt fonts, autoTable cell padding is 1.5–2pt. As a safety net any extra
 * page that jspdf-autotable might still create is deleted before output.
 */
export function buildReportPDF(submission: SubmissionInfo, payload: ScoringPayload): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 22;
  const innerW = pageW - margin * 2;

  // ── Banner ─────────────────────────────────────────────────────────
  doc.setFillColor(YELLOW);
  doc.rect(0, 0, pageW, 36, "F");
  doc.setFillColor(BLACK);
  doc.rect(0, 36, pageW, 3, "F");
  doc.setTextColor(BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const title = submission.testKind === "BAKAT" ? "LAPORAN TES BAKAT" : "LAPORAN TES MINAT";
  doc.text(title, margin, 24);
  doc.setFontSize(8);
  doc.text(`Dicetak: ${fmtDateTime(new Date())}`, pageW - margin, 24, { align: "right" });

  let y = 46;

  // ── Identitas ──────────────────────────────────────────────────────
  y = sectionTitle(doc, "IDENTITAS PESERTA", margin, y, innerW);
  y = drawIdentitas(doc, submission, margin, y, innerW);

  if (payload.testKind === "BAKAT") {
    drawBakat(doc, payload, margin, y, innerW);
  } else {
    drawMinat(doc, payload, margin, y, innerW);
  }

  // Hard-cap to 1 page in case any nested table tries to overflow.
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages());
  }
  doc.setPage(1);

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFillColor(BLACK);
  doc.rect(0, pageH - 14, pageW, 14, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(
    "LAPORAN TES MINAT & BAKAT — DICETAK OTOMATIS — RAHASIA",
    margin,
    pageH - 4,
  );
  doc.text("Hal. 1 / 1", pageW - margin, pageH - 4, { align: "right" });

  return Buffer.from(doc.output("arraybuffer"));
}

function sectionTitle(
  doc: jsPDF,
  label: string,
  margin: number,
  y: number,
  innerW: number,
): number {
  doc.setFillColor(BLACK);
  doc.rect(margin, y, innerW, 12, "F");
  doc.setTextColor(WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(label, margin + 4, y + 9);
  doc.setTextColor(BLACK);
  return y + 14;
}

function drawIdentitas(
  doc: jsPDF,
  s: SubmissionInfo,
  margin: number,
  y: number,
  innerW: number,
): number {
  doc.setFontSize(8);
  const colW = (innerW - 8) / 2;
  const rows: [string, string][] = [
    ["Nama", s.fullName || "—"],
    ["Jenis Kelamin", s.gender || "—"],
    ["TTL", `${s.birthPlace || "—"} / ${fmtBirth(s.birthDate)}`],
    ["Sekolah", s.school || "—"],
    ["Kelas / Jurusan", `${s.grade || "—"} / ${s.major || "—"}`],
    ["Telepon", s.phone || "—"],
    ["Email", s.email || "—"],
    ["Mulai Tes", fmtDateTime(s.startedAt)],
    ["Selesai Tes", fmtDateTime(s.finishedAt)],
  ];
  const half = Math.ceil(rows.length / 2);
  for (let i = 0; i < half; i++) {
    drawIdLine(doc, margin, y, colW, rows[i]);
    if (i + half < rows.length) {
      drawIdLine(doc, margin + colW + 8, y, colW, rows[i + half]);
    }
    y += 11;
  }
  return y + 4;
}

function drawIdLine(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  [k, v]: [string, string],
): void {
  const labelW = 78;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`${k}:`, x, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(truncate(doc, String(v), w - labelW), x + labelW, y + 8);
}

function drawBakat(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  innerW: number,
): number {
  let y = yIn;

  // ── Skor per subtes (compact table) ──
  y = sectionTitle(doc, "SKOR PER SUBTES", margin, y, innerW);
  const rows = Object.values(payload.perSubtest).map((v) => [
    v.name,
    `${v.raw}/${v.max}`,
    v.categoryLabel ?? "—",
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Subtes", "Skor", "Kategori"]],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      lineWidth: 0.6,
      lineColor: BLACK,
      textColor: BLACK,
      cellPadding: 1.8,
    },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF instance with lastAutoTable
  y = (doc.lastAutoTable?.finalY ?? y) + 6;

  // ── EKIU + Top Profil (side-by-side) ──
  y = sectionTitle(doc, "EKIU PREDIKSI & PROFIL BAKAT TERATAS", margin, y, innerW);
  const halfW = (innerW - 8) / 2;
  const blockH = 56;

  // EKIU box (left)
  doc.setFillColor(CYAN);
  doc.rect(margin, y, halfW, blockH, "F");
  doc.setLineWidth(1.2);
  doc.setDrawColor(BLACK);
  doc.rect(margin, y, halfW, blockH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(BLACK);
  doc.text(String(payload.iqEstimate ?? "—"), margin + 8, y + 30);
  doc.setFontSize(9);
  doc.text(payload.iqInterpretation?.band ?? "", margin + 70, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const desc = doc.splitTextToSize(
    payload.iqInterpretation?.description ?? "",
    halfW - 76,
  ) as string[];
  doc.text(desc.slice(0, 4), margin + 70, y + 28);

  // Top Profile (right)
  const topX = margin + halfW + 8;
  doc.setFillColor(PINK);
  doc.rect(topX, y, halfW, blockH, "F");
  doc.setLineWidth(1.2);
  doc.rect(topX, y, halfW, blockH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("PROFIL BAKAT", topX + 6, y + 11);
  let py = y + 22;
  const profiles = (payload.bakat?.topProfiles ?? []).slice(0, 3);
  for (const p of profiles) {
    if (py > y + blockH - 4) break;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(`• ${p.name}`, topX + 6, py);
    py += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const line = (doc.splitTextToSize(p.description, halfW - 14) as string[])[0] ?? "";
    doc.text(line, topX + 12, py);
    py += 9;
  }
  y += blockH + 6;

  // ── Penjurusan IPA / IPS (jika ada) ──
  if (payload.penjurusan) {
    y = drawPenjurusanCompact(doc, payload, margin, y, innerW);
  }

  // ── Rekomendasi ──
  y = sectionTitle(doc, "REKOMENDASI JURUSAN & PEKERJAAN", margin, y, innerW);
  drawRecommendations(doc, payload, margin, y, innerW);
  return y;
}

function drawPenjurusanCompact(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  innerW: number,
): number {
  const pj = payload.penjurusan!;
  let y = yIn;
  y = sectionTitle(doc, "PENJURUSAN IPA / IPS (SMA)", margin, y, innerW);

  const tableW = innerW * 0.55 - 6;
  const boxX = margin + tableW + 12;
  const boxW = innerW - tableW - 12;

  // Tabel komponen kompak (kiri)
  const order: KomponenKode[] = ["KUA", "PEN", "SPA", "MEK", "VER", "BHS", "KLE"];
  const compRows = order.map((k) => [
    KOMPONEN_LABEL[k],
    pj.components[k].toFixed(1),
    BOBOT_IPA_PCT[k] > 0 ? `${BOBOT_IPA_PCT[k]}%` : "—",
    BOBOT_IPS_PCT[k] > 0 ? `${BOBOT_IPS_PCT[k]}%` : "—",
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Komponen", "Skor", "IPA", "IPS"]],
    body: compRows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      lineWidth: 0.5,
      lineColor: BLACK,
      textColor: BLACK,
      cellPadding: 1.5,
    },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 0.8 },
    margin: { left: margin },
    tableWidth: tableW,
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  const tEnd = (doc.lastAutoTable?.finalY ?? y) as number;

  // Score boxes IPA / IPS sebelah kanan
  const boxH = 28;
  drawScoreBoxMini(doc, boxX, y, boxW, "IPA", pj.finalIPA, pj.kategoriIPA.label, CYAN);
  drawScoreBoxMini(doc, boxX, y + boxH + 4, boxW, "IPS", pj.finalIPS, pj.kategoriIPS.label, PINK);

  let yBelow = Math.max(tEnd, y + boxH * 2 + 4) + 4;

  // Banner rekomendasi penjurusan
  doc.setFillColor(YELLOW);
  doc.rect(margin, yBelow, innerW, 14, "F");
  doc.setLineWidth(1);
  doc.setDrawColor(BLACK);
  doc.rect(margin, yBelow, innerW, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(
    `REKOMENDASI: ${pj.rekomendasiLabel.toUpperCase()}  •  Selisih (IPA−IPS): ${pj.selisih.toFixed(1)}`,
    margin + 6,
    yBelow + 10,
  );
  yBelow += 16;

  // Catatan (max 2 baris)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const note = doc.splitTextToSize(pj.catatan, innerW) as string[];
  doc.text(note.slice(0, 2), margin, yBelow + 7);
  yBelow += note.slice(0, 2).length * 8 + 4;
  return yBelow;
}

// kept intentionally minimal — additional helpers below

function drawScoreBoxMini(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  score: number,
  kategori: string,
  fill: string,
): void {
  const h = 28;
  doc.setFillColor(fill);
  doc.rect(x, y, w, h, "F");
  doc.setLineWidth(1.2);
  doc.setDrawColor(BLACK);
  doc.rect(x, y, w, h);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(BLACK);
  doc.text(label, x + 6, y + 11);
  doc.setFontSize(16);
  doc.text(score.toFixed(1), x + 6, y + 24);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(kategori, x + 50, y + 14, { maxWidth: w - 56 });
}

function drawMinat(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  yIn: number,
  innerW: number,
): number {
  let y = yIn;
  y = sectionTitle(doc, "SKOR BIDANG MINAT", margin, y, innerW);
  const tableW = innerW / 2 - 4;
  const rightX = margin + tableW + 8;
  const rightW = innerW - tableW - 8;

  const rows = Object.entries(payload.minat?.bidangScores ?? {}).map(([k, v]) => [
    k,
    String(v),
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Bidang", "Skor"]],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      lineWidth: 0.6,
      lineColor: BLACK,
      textColor: BLACK,
      cellPadding: 2,
    },
    headStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: "bold", lineWidth: 1 },
    margin: { left: margin },
    tableWidth: tableW,
  });
  // @ts-expect-error - jspdf-autotable extends jsPDF
  const t1End = (doc.lastAutoTable?.finalY ?? y) as number;

  // Top bidang chips di kanan
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TOP BIDANG", rightX, y + 8);
  let ry = y + 14;
  const top = payload.minat?.topBidang ?? [];
  for (let i = 0; i < top.length; i++) {
    const fill = i === 0 ? PINK : i === 1 ? CYAN : YELLOW;
    doc.setFillColor(fill);
    doc.rect(rightX, ry, rightW, 18, "F");
    doc.setLineWidth(1);
    doc.setDrawColor(BLACK);
    doc.rect(rightX, ry, rightW, 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`#${i + 1} ${top[i]}`, rightX + 6, ry + 12);
    ry += 22;
  }
  y = Math.max(t1End, ry) + 6;

  // ── Program Keahlian Rekomendasi (compact) ──
  y = sectionTitle(doc, "PROGRAM KEAHLIAN REKOMENDASI", margin, y, innerW);
  const programs = payload.minat?.programs ?? [];
  for (const p of programs) {
    doc.setFillColor(CYAN);
    doc.rect(margin, y, innerW, 12, "F");
    doc.setLineWidth(1);
    doc.setDrawColor(BLACK);
    doc.rect(margin, y, innerW, 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Bidang ${p.bidang}: ${p.kind}`, margin + 4, y + 9);
    y += 14;
    doc.setFontSize(7.5);
    for (const a of p.topAnswers) {
      doc.setFont("helvetica", "bold");
      doc.text(`• ${a.label}`, margin + 6, y + 7);
      doc.setFont("helvetica", "normal");
      doc.text(`(${a.major})`, margin + 140, y + 7, { maxWidth: innerW - 146 });
      y += 9;
    }
    y += 3;
  }

  // ── Rekomendasi ──
  y = sectionTitle(doc, "REKOMENDASI JURUSAN & PEKERJAAN", margin, y, innerW);
  drawRecommendations(doc, payload, margin, y, innerW);
  return y;
}

function drawRecommendations(
  doc: jsPDF,
  payload: ScoringPayload,
  margin: number,
  y: number,
  innerW: number,
): void {
  const colW = (innerW - 8) / 2;
  doc.setFillColor(YELLOW);
  doc.rect(margin, y, colW, 12, "F");
  doc.rect(margin + colW + 8, y, colW, 12, "F");
  doc.setLineWidth(1);
  doc.setDrawColor(BLACK);
  doc.rect(margin, y, colW, 12);
  doc.rect(margin + colW + 8, y, colW, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(BLACK);
  doc.text("JURUSAN", margin + 4, y + 9);
  doc.text("PEKERJAAN", margin + colW + 12, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  let yL = y + 20;
  for (const m of (payload.recommendations.majors || []).slice(0, 10)) {
    doc.text(`• ${m}`, margin + 4, yL, { maxWidth: colW - 8 });
    yL += 9;
  }
  let yR = y + 20;
  for (const c of (payload.recommendations.careers || []).slice(0, 10)) {
    doc.text(`• ${c}`, margin + colW + 12, yR, { maxWidth: colW - 8 });
    yR += 9;
  }
}
