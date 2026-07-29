// ───────────────────────────────────────────────────────────
// Laporan individual Tes IQ — CFIT Skala 3 (Bentuk A + B), satu halaman A4.
// TERPISAH dari laporan minat-bakat (src/lib/pdf.ts).
// ───────────────────────────────────────────────────────────

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  LEMBAGA_PRODI,
  LEMBAGA_UNIT,
  buildReportCode,
  drawQrCode,
  qrPayload,
  verificationFooterText,
} from "../report-verification"
import type { CfitSubtestScore } from "./scoring"

export type CfitPdfSubmission = {
  id: string
  form: string
  fullName: string | null
  nis?: string | null
  gender: string | null
  age: number | null
  grade: string | null
  school: string | null
  startedAt: Date
  finishedAt: Date | null
}

export type CfitPdfResult = {
  rawScoreA: number | null
  rawScoreB: number | null
  rawScoreTotal: number
  iq: number
  classification: string
  payload?: unknown
  generatedAt?: Date | null
}

// ─── Palet ───
const INK = "#0F172A"
const SOFT_INK = "#475569"
const HAIRLINE = "#CBD5E1"
const STRIPE = "#F8FAFC"
const PANEL = "#F1F5F9"
const WHITE = "#FFFFFF"
const ACCENT = "#22D3EE"
const ACCENT_DEEP = "#0E7490"
const HIGHLIGHT = "#CFFAFE"

// ─── Identitas penanda tangan ───
// Default sesuai penanda tangan resmi; masih bisa ditimpa lewat environment
// variable bila suatu saat berganti.
const KOP_KOTA = (process.env.REPORT_KOTA ?? "Metro").trim()
const KAPRODI_NAMA = (
  process.env.REPORT_KAPRODI_NAMA ?? "Dr. Eko Susanto, M.Pd., Kons."
).trim()
const KAPRODI_NIDN = (process.env.REPORT_KAPRODI_NIDN ?? "0213068302").trim()
const TESTER_NAMA = (
  process.env.REPORT_TESTER_NAMA ?? "Dr. Agus Wibowo, M.Pd."
).trim()
const TESTER_NA = (process.env.REPORT_TESTER_NA ?? "").trim()

const FORM_LABEL: Record<string, string> = {
  FORM_3A: "Bentuk A",
  FORM_3B: "Bentuk B",
  FORM_3AB: "Bentuk A + B",
}

const SUBTEST_LABEL: Record<string, string> = {
  "3A_SERIES": "A — Subtes 1: Series",
  "3A_CLASSIFICATION": "A — Subtes 2: Classification",
  "3A_MATRICES": "A — Subtes 3: Matrices",
  "3A_CONDITIONS": "A — Subtes 4: Conditions (Topology)",
  "3B_SERIES": "B — Subtes 1: Series",
  "3B_CLASSIFICATION": "B — Subtes 2: Classification",
  "3B_MATRICES": "B — Subtes 3: Matrices",
  "3B_CONDITIONS": "B — Subtes 4: Conditions (Topology)",
}

/** Kelompok grafik: 4 subtes CFIT, nilai Bentuk A + B digabung. */
const CHART_GROUPS: Array<{ key: string; label: string }> = [
  { key: "SERIES", label: "SERIES" },
  { key: "CLASSIFICATION", label: "CLASSIFICATION" },
  { key: "MATRICES", label: "MATRICES" },
  { key: "CONDITIONS", label: "CONDITIONS" },
]

const NORM_GROUP_LABEL: Record<string, string> = {
  "15": "usia 15 tahun",
  "16": "usia 16 tahun",
  "17+": "usia 17 tahun ke atas",
}

const NORM_GROUP_SHORT: Record<string, string> = {
  "15": "usia 15",
  "16": "usia 16",
  "17+": "usia 17+",
}

// ─── Helper warna & teks ───
function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function setFillHex(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRGB(hex)
  doc.setFillColor(r, g, b)
}

function setDrawHex(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRGB(hex)
  doc.setDrawColor(r, g, b)
}

function setTextHex(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRGB(hex)
  doc.setTextColor(r, g, b)
}

function nextY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
  return last?.finalY ? last.finalY : fallback
}

function fmtDate(v: Date | null | undefined): string {
  if (!v) return "-"
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })
}

function fmtDateOnly(v: Date | null | undefined): string {
  const d = v ? new Date(v) : new Date()
  const safe = Number.isNaN(d.getTime()) ? new Date() : d
  return safe.toLocaleDateString("id-ID", { dateStyle: "long" })
}

/** Kotak bergaya brutalism: bayangan pekat + garis tebal (seperti UI aplikasi). */
function drawBrutBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fillHex: string,
  shadow = 3.5,
) {
  setFillHex(doc, INK)
  doc.rect(x + shadow, y + shadow, w, h, "F")
  setFillHex(doc, fillHex)
  setDrawHex(doc, INK)
  doc.setLineWidth(1.2)
  doc.rect(x, y, w, h, "FD")
}

// ─── Kop resmi ───
function drawKop(doc: jsPDF, margin: number, pageW: number): number {
  setFillHex(doc, INK)
  doc.rect(0, 0, pageW, 5, "F")

  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12.5)
  doc.text("UNIVERSITAS MUHAMMADIYAH METRO", pageW / 2, 30, { align: "center" })
  doc.setFontSize(10.5)
  doc.text("PROGRAM PASCASARJANA", pageW / 2, 43, { align: "center" })
  doc.setFontSize(9.2)
  doc.text(
    "PROGRAM STUDI MAGISTER BIMBINGAN DAN KONSELING",
    pageW / 2,
    55,
    { align: "center" },
  )

  setDrawHex(doc, INK)
  doc.setLineWidth(1.6)
  doc.line(margin, 63, pageW - margin, 63)
  doc.setLineWidth(0.5)
  doc.line(margin, 66, pageW - margin, 66)
  return 66
}

/** Penanda kerahasiaan di kanan atas (menggantikan blok kode laporan). */
function drawRahasiaBadge(doc: jsPDF, pageW: number, margin: number) {
  const w = 92
  const h = 22
  const x = pageW - margin - w
  const y = 14
  setFillHex(doc, INK)
  doc.rect(x, y, w, h, "F")
  setTextHex(doc, WHITE)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.text("RAHASIA", x + w / 2, y + 15, { align: "center" })
  setTextHex(doc, INK)
}

// ─── Kartu hasil IQ ───
function drawScoreCard(
  doc: jsPDF,
  result: CfitPdfResult,
  info: { normGroup: string; classificationEn?: string; belowNorm?: boolean },
  margin: number,
  yIn: number,
  pageW: number,
): number {
  const innerW = pageW - margin * 2
  const cardH = 74
  const scoreW = 116

  drawBrutBox(doc, margin, yIn, innerW, cardH, WHITE)

  // Blok skor (gelap) di kiri
  setFillHex(doc, INK)
  doc.rect(margin + 6, yIn + 6, scoreW, cardH - 12, "F")
  const scoreCx = margin + 6 + scoreW / 2
  setTextHex(doc, ACCENT)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.8)
  doc.text("SKOR IQ (CFIT)", scoreCx, yIn + 20, { align: "center" })
  setTextHex(doc, WHITE)
  doc.setFontSize(30)
  doc.text(
    `${info.belowNorm ? "≤" : ""}${result.iq}`,
    scoreCx,
    yIn + 48,
    { align: "center" },
  )
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.2)
  doc.text(
    `Norma kelompok ${NORM_GROUP_SHORT[info.normGroup] ?? `usia ${info.normGroup}`}`,
    scoreCx,
    yIn + 61,
    { align: "center" },
  )

  // Klasifikasi & raw score di kanan
  const infoX = margin + 6 + scoreW + 18
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text(result.classification, infoX, yIn + 26)
  if (info.classificationEn) {
    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(info.classificationEn, infoX, yIn + 37)
  }

  setTextHex(doc, ACCENT_DEEP)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text("RAW SCORE (RS)", infoX, yIn + 52)
  setTextHex(doc, INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.4)
  doc.text(
    `Bentuk A: ${result.rawScoreA ?? "-"}   •   Bentuk B: ${result.rawScoreB ?? "-"}   •   Total: ${result.rawScoreTotal}`,
    infoX,
    yIn + 64,
  )

  return yIn + cardH + 4
}

// ─── Grafik batang bergaya UI: % benar per subtes (A + B digabung) ───
function drawSubtestChart(
  doc: jsPDF,
  perSubtest: CfitSubtestScore[],
  margin: number,
  yIn: number,
  pageW: number,
): number {
  const innerW = pageW - margin * 2
  const headerH = 17
  const plotH = 68
  const panelH = 122
  const baseY = yIn + headerH + 8 + plotH

  drawBrutBox(doc, margin, yIn, innerW, panelH, WHITE)

  // Bilah judul hitam
  setFillHex(doc, INK)
  doc.rect(margin, yIn, innerW, headerH, "F")
  setTextHex(doc, WHITE)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.4)
  doc.text("GRAFIK CAPAIAN PER SUBTES", margin + 8, yIn + 12)
  setTextHex(doc, ACCENT)
  doc.setFontSize(6.8)
  doc.text(
    "% JAWABAN BENAR • BENTUK A + B DIGABUNG",
    pageW - margin - 8,
    yIn + 12,
    { align: "right" },
  )

  const plotX = margin + 36
  const plotW = innerW - 36 - 16

  for (const p of [0, 25, 50, 75, 100]) {
    const gy = baseY - plotH * (p / 100)
    setDrawHex(doc, p === 0 ? INK : HAIRLINE)
    doc.setLineWidth(p === 0 ? 1.2 : 0.4)
    doc.line(plotX, gy, plotX + plotW, gy)
    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6)
    doc.text(`${p}%`, plotX - 6, gy + 2, { align: "right" })
  }

  const groups = CHART_GROUPS.map((g) => {
    const rows = perSubtest.filter((s) => s.subtestCode.endsWith(`_${g.key}`))
    const correct = rows.reduce((n, s) => n + s.correct, 0)
    const total = rows.reduce((n, s) => n + s.total, 0)
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0
    return { ...g, correct, total, pct }
  })

  const slotW = plotW / groups.length
  const barW = Math.min(46, slotW * 0.46)

  groups.forEach((g, i) => {
    const cx = plotX + slotW * i + slotW / 2
    const bx = cx - barW / 2
    const h = plotH * (Math.max(0, Math.min(100, g.pct)) / 100)

    // Bingkai penuh (100%) sebagai bayangan skala
    setFillHex(doc, STRIPE)
    doc.rect(bx, baseY - plotH, barW, plotH, "F")
    setDrawHex(doc, HAIRLINE)
    doc.setLineWidth(0.4)
    doc.rect(bx, baseY - plotH, barW, plotH)

    if (h > 0) {
      setFillHex(doc, INK)
      doc.rect(bx + 2.5, baseY - h + 2.5, barW, h, "F")
      setFillHex(doc, ACCENT)
      setDrawHex(doc, INK)
      doc.setLineWidth(1.2)
      doc.rect(bx, baseY - h, barW, h, "FD")
    }

    setTextHex(doc, INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.2)
    doc.text(`${g.pct}%`, cx, baseY - Math.max(h, 6) - 5, { align: "center" })

    doc.setFontSize(6.6)
    doc.text(g.label, cx, baseY + 11, { align: "center" })
    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.2)
    doc.text(`${g.correct} / ${g.total} benar`, cx, baseY + 20, { align: "center" })
  })

  setTextHex(doc, INK)
  return yIn + panelH
}

// ─── QR validasi (tengah bawah grafik) ───
function drawQrBlock(
  doc: jsPDF,
  code: string,
  yIn: number,
  pageW: number,
): number {
  const size = 56
  const x = (pageW - size) / 2
  drawQrCode(doc, qrPayload(code), x, yIn, size)

  let y = yIn + size + 9
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.2)
  doc.text(code, pageW / 2, y, { align: "center" })

  y += 8
  setTextHex(doc, SOFT_INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.4)
  doc.text(
    "Pindai QR atau masukkan kode di atas untuk memvalidasi keaslian laporan ini.",
    pageW / 2,
    y,
    { align: "center" },
  )
  setTextHex(doc, INK)
  return y
}

// ─── Dua blok tanda tangan (rata tengah per kolom) ───
function drawSignatures(
  doc: jsPDF,
  margin: number,
  yIn: number,
  pageW: number,
  tanggal: string,
): number {
  const innerW = pageW - margin * 2
  const gap = 28
  const colW = (innerW - gap) / 2
  const cols = [
    {
      cx: margin + colW / 2,
      jabatan: ["Ketua Program Studi Magister", "Bimbingan dan Konseling"],
      nama: KAPRODI_NAMA,
      idLabel: "NIDN",
      idValue: KAPRODI_NIDN,
      showDate: false,
    },
    {
      cx: margin + colW + gap + colW / 2,
      jabatan: ["Tester"],
      nama: TESTER_NAMA,
      idLabel: "NA",
      idValue: TESTER_NA,
      showDate: true,
    },
  ]

  const dateY = yIn
  const jabatanY = yIn + 13
  const nameY = jabatanY + 52

  setTextHex(doc, INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`${KOP_KOTA}, ${tanggal}`, cols[1].cx, dateY, { align: "center" })

  for (const c of cols) {
    setTextHex(doc, INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    c.jabatan.forEach((line, i) => {
      doc.text(line, c.cx, jabatanY + i * 10, { align: "center" })
    })

    const nama = c.nama || "..................................................."
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.6)
    doc.text(nama, c.cx, nameY, { align: "center" })

    const lineW = Math.min(
      colW - 10,
      Math.max(150, doc.getTextWidth(nama) + 24),
    )
    setDrawHex(doc, INK)
    doc.setLineWidth(0.6)
    doc.line(c.cx - lineW / 2, nameY + 3.5, c.cx + lineW / 2, nameY + 3.5)

    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.6)
    doc.text(
      c.idValue ? `${c.idLabel}. ${c.idValue}` : `${c.idLabel}.`,
      c.cx,
      nameY + 14,
      { align: "center" },
    )
    setTextHex(doc, INK)
  }

  return nameY + 20
}

// ─── Laporan ───
export function buildCfitReportPDF(
  sub: CfitPdfSubmission,
  result: CfitPdfResult,
): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 28
  const innerW = pageW - margin * 2

  const payload = (result.payload ?? {}) as {
    perSubtest?: CfitSubtestScore[]
    normGroup?: string
    classificationEn?: string
    belowNorm?: boolean
  }
  const perSubtest = payload.perSubtest ?? []
  const normGroup = payload.normGroup ?? "17+"
  const normGroupLabel = NORM_GROUP_LABEL[normGroup] ?? `usia ${normGroup}`
  const reportCode = buildReportCode("IQ", sub.id)

  // Kop resmi + penanda RAHASIA
  drawKop(doc, margin, pageW)
  drawRahasiaBadge(doc, pageW, margin)

  // Judul laporan
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("LAPORAN HASIL TES INTELEGENSI", pageW / 2, 86, { align: "center" })
  setTextHex(doc, SOFT_INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.4)
  doc.text(
    `Culture Fair Intelligence Test (CFIT) Skala 3 — ${FORM_LABEL[sub.form] ?? "Bentuk A + B"}`,
    pageW / 2,
    98,
    { align: "center" },
  )

  // Identitas peserta
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("IDENTITAS PESERTA", margin, 116)

  const identityBody: Array<
    Array<string | { content: string; colSpan: number }>
  > = [
    ["Nama", { content: sub.fullName ?? "-", colSpan: 3 }],
    ["NIS", { content: sub.nis ?? "-", colSpan: 3 }],
    [
      "Jenis Kelamin",
      sub.gender ?? "-",
      "Usia",
      sub.age != null ? `${sub.age} tahun` : "-",
    ],
    ["Kelas", sub.grade ?? "-", "Sekolah", sub.school ?? "-"],
    ["Mulai", fmtDate(sub.startedAt), "Selesai", fmtDate(sub.finishedAt)],
  ]

  autoTable(doc, {
    startY: 121,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.4,
      cellPadding: 2.4,
      lineColor: hexToRGB(HAIRLINE),
      lineWidth: 0.4,
      textColor: hexToRGB(INK),
    },
    columnStyles: {
      0: { cellWidth: 84, fontStyle: "bold", fillColor: hexToRGB(PANEL) },
      1: { cellWidth: innerW / 2 - 84 },
      2: { cellWidth: 84, fontStyle: "bold", fillColor: hexToRGB(PANEL) },
      3: { cellWidth: innerW / 2 - 84 },
    },
    body: identityBody,
  })

  // Kartu hasil IQ
  let y = nextY(doc, 190) + 14
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  setTextHex(doc, INK)
  doc.text("HASIL TES IQ (CFIT SKALA 3)", margin, y)
  y = drawScoreCard(
    doc,
    result,
    {
      normGroup,
      classificationEn: payload.classificationEn,
      belowNorm: payload.belowNorm,
    },
    margin,
    y + 6,
    pageW,
  )

  // Rincian per subtes
  y += 11
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("RINCIAN PER SUBTES", margin, y)

  autoTable(doc, {
    startY: y + 5,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 2.2,
      lineColor: hexToRGB(HAIRLINE),
      lineWidth: 0.4,
      textColor: hexToRGB(INK),
    },
    headStyles: {
      fillColor: hexToRGB(INK),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
    columnStyles: {
      0: { cellWidth: innerW - 4 * 62 },
      1: { cellWidth: 62, halign: "center" },
      2: { cellWidth: 62, halign: "center" },
      3: { cellWidth: 62, halign: "center" },
      4: { cellWidth: 62, halign: "center", fontStyle: "bold" },
    },
    head: [["Subtes", "Benar", "Dijawab", "Jumlah Soal", "% Benar"]],
    body: perSubtest.map((s) => [
      SUBTEST_LABEL[s.subtestCode] ?? s.subtestCode,
      String(s.correct),
      String(s.answered),
      String(s.total),
      s.total > 0 ? `${Math.round((s.correct / s.total) * 100)}%` : "-",
    ]),
  })

  y = nextY(doc, y + 60) + 11

  // Catatan penskoran
  const noteText = payload.belowNorm
    ? `Skor IQ diperoleh dengan mengonversi Raw Score total (A + B) = ${result.rawScoreTotal} memakai tabel norma CFIT Skala 3 kelompok ${normGroupLabel}. Raw Score berada di bawah rentang tabel norma (baris terendah 20), sehingga skor ditampilkan sebagai batas terendah norma.`
    : `Skor IQ diperoleh dengan mengonversi Raw Score total (A + B) = ${result.rawScoreTotal} memakai tabel norma CFIT Skala 3 kelompok ${normGroupLabel}.`
  const noteLines = doc.splitTextToSize(noteText, innerW - 16) as string[]
  const noteH = 11 + noteLines.length * 8.4
  setFillHex(doc, HIGHLIGHT)
  setDrawHex(doc, ACCENT_DEEP)
  doc.setLineWidth(0.6)
  doc.rect(margin, y, innerW, noteH, "FD")
  setTextHex(doc, INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.8)
  noteLines.forEach((line, i) => {
    doc.text(line, margin + 8, y + 10 + i * 8.4)
  })
  y += noteH + 12

  // Grafik pengganti tabel skala klasifikasi
  y = drawSubtestChart(doc, perSubtest, margin, y, pageW) + 10

  // QR validasi (tengah), lalu dua blok tanda tangan
  y = drawQrBlock(doc, reportCode, y, pageW) + 13
  drawSignatures(
    doc,
    margin,
    y,
    pageW,
    fmtDateOnly(result.generatedAt ?? sub.finishedAt),
  )

  // Footer
  setDrawHex(doc, HAIRLINE)
  doc.setLineWidth(0.5)
  doc.line(margin, pageH - 30, pageW - margin, pageH - 30)
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text(`${LEMBAGA_PRODI} — ${LEMBAGA_UNIT}`, margin, pageH - 21)
  setTextHex(doc, SOFT_INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.6)
  doc.text(verificationFooterText(reportCode), margin, pageH - 13)
  doc.setFontSize(6.4)
  doc.text(
    "Laporan Tes IQ (CFIT Skala 3) • Rahasia & hanya untuk keperluan layanan bimbingan dan konseling.",
    margin,
    pageH - 6,
  )

  // Pastikan tetap satu halaman
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages())
  }

  return Buffer.from(doc.output("arraybuffer"))
}
