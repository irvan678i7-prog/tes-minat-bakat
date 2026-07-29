// ──────────────────────────────────────────────────────────────────
// Laporan individual Tes IQ — CFIT Skala 3 (Bentuk A + B), satu halaman A4.
// TERPISAH dari laporan minat-bakat (src/lib/pdf.ts).
// ──────────────────────────────────────────────────────────────────

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

// ─── Identitas penanda tangan (bisa diatur lewat environment variable) ───
const KOP_KOTA = (process.env.REPORT_KOTA ?? "Metro").trim()
const KAPRODI_NAMA = (process.env.REPORT_KAPRODI_NAMA ?? "").trim()
const KAPRODI_NIDN = (process.env.REPORT_KAPRODI_NIDN ?? "").trim()
const TESTER_NAMA = (process.env.REPORT_TESTER_NAMA ?? "").trim()
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
  { key: "SERIES", label: "Series" },
  { key: "CLASSIFICATION", label: "Classification" },
  { key: "MATRICES", label: "Matrices" },
  { key: "CONDITIONS", label: "Conditions" },
]

const NORM_GROUP_LABEL: Record<string, string> = {
  "15": "usia 15 tahun",
  "16": "usia 16 tahun",
  "17+": "usia 17 tahun ke atas",
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
  const w = 96
  const h = 24
  const x = pageW - margin - w
  const y = 14
  setFillHex(doc, INK)
  doc.rect(x, y, w, h, "F")
  setTextHex(doc, WHITE)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("RAHASIA", x + w / 2, y + 16, { align: "center" })
  setTextHex(doc, INK)
}

// ─── Grafik batang: % benar per subtes (A + B digabung) ───
function drawSubtestChart(
  doc: jsPDF,
  perSubtest: CfitSubtestScore[],
  margin: number,
  yIn: number,
  pageW: number,
): number {
  const innerW = pageW - margin * 2
  const chartH = 96
  const plotH = chartH - 16
  const baseY = yIn + chartH

  setFillHex(doc, WHITE)
  setDrawHex(doc, HAIRLINE)
  doc.setLineWidth(0.6)
  doc.rect(margin, yIn - 8, innerW, chartH + 40, "FD")

  const plotX = margin + 34
  const plotW = innerW - 34 - 12

  for (const p of [0, 25, 50, 75, 100]) {
    const gy = baseY - plotH * (p / 100)
    setDrawHex(doc, p === 0 ? INK : HAIRLINE)
    doc.setLineWidth(p === 0 ? 0.8 : 0.3)
    doc.line(plotX, gy, plotX + plotW, gy)
    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.2)
    doc.text(`${p}%`, plotX - 5, gy + 2, { align: "right" })
  }

  const groups = CHART_GROUPS.map((g) => {
    const rows = perSubtest.filter((s) => s.subtestCode.endsWith(`_${g.key}`))
    const correct = rows.reduce((n, s) => n + s.correct, 0)
    const total = rows.reduce((n, s) => n + s.total, 0)
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0
    return { ...g, correct, total, pct }
  })

  const slotW = plotW / groups.length
  const barW = Math.min(52, slotW * 0.5)

  groups.forEach((g, i) => {
    const cx = plotX + slotW * i + slotW / 2
    const h = plotH * (Math.max(0, Math.min(100, g.pct)) / 100)
    if (h > 0) {
      setFillHex(doc, ACCENT)
      doc.rect(cx - barW / 2, baseY - h, barW, h, "F")
      setDrawHex(doc, INK)
      doc.setLineWidth(0.8)
      doc.rect(cx - barW / 2, baseY - h, barW, h)
    }
    setTextHex(doc, ACCENT_DEEP)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.text(`${g.pct}%`, cx, baseY - h - 4, { align: "center" })

    setTextHex(doc, INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.2)
    doc.text(g.label, cx, baseY + 11, { align: "center" })
    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.4)
    doc.text(`${g.correct}/${g.total} benar`, cx, baseY + 20, { align: "center" })
  })

  setTextHex(doc, SOFT_INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.4)
  doc.text(
    "Persentase jawaban benar per subtes (Bentuk A + B digabung).",
    margin + 6,
    baseY + 30,
  )
  setTextHex(doc, INK)

  return yIn + chartH + 40
}

// ─── QR validasi (tengah bawah grafik) ───
function drawQrBlock(
  doc: jsPDF,
  code: string,
  yIn: number,
  pageW: number,
): number {
  const size = 64
  const x = (pageW - size) / 2
  drawQrCode(doc, qrPayload(code), x, yIn, size)

  let y = yIn + size + 9
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.4)
  doc.text(code, pageW / 2, y, { align: "center" })

  y += 9
  setTextHex(doc, SOFT_INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.6)
  doc.text(
    "Pindai QR atau masukkan kode di atas untuk memvalidasi keaslian laporan ini.",
    pageW / 2,
    y,
    { align: "center" },
  )
  setTextHex(doc, INK)
  return y + 6
}

// ─── Dua blok tanda tangan ───
function drawSignatures(
  doc: jsPDF,
  margin: number,
  yIn: number,
  pageW: number,
  tanggal: string,
): number {
  let y = yIn
  setTextHex(doc, INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`${KOP_KOTA}, ${tanggal}`, pageW - margin, y, { align: "right" })
  y += 14

  const gap = 24
  const colW = (pageW - margin * 2 - gap) / 2
  const cols = [
    {
      x: margin,
      jabatan: ["Ketua Program Studi", "Magister Bimbingan dan Konseling"],
      nama: KAPRODI_NAMA,
      idLabel: "NIDN",
      idValue: KAPRODI_NIDN,
    },
    {
      x: margin + colW + gap,
      jabatan: ["Tester"],
      nama: TESTER_NAMA,
      idLabel: "NA",
      idValue: TESTER_NA,
    },
  ]

  for (const c of cols) {
    let cy = y
    setTextHex(doc, INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    for (const line of c.jabatan) {
      doc.text(line, c.x, cy)
      cy += 10
    }

    const nameY = y + 52
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.6)
    doc.text(c.nama || "(...............................................)", c.x, nameY)
    setDrawHex(doc, INK)
    doc.setLineWidth(0.5)
    doc.line(c.x, nameY + 3, c.x + Math.min(colW, 176), nameY + 3)

    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.6)
    doc.text(
      `${c.idLabel}. ${c.idValue || "................................"}`,
      c.x,
      nameY + 13,
    )
    setTextHex(doc, INK)
  }

  return y + 70
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

  autoTable(doc, {
    startY: 122,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 3.5,
      lineColor: hexToRGB(HAIRLINE),
      lineWidth: 0.4,
      textColor: hexToRGB(INK),
    },
    columnStyles: {
      0: { cellWidth: 88, fontStyle: "bold", fillColor: hexToRGB(PANEL) },
      1: { cellWidth: innerW / 2 - 88 },
      2: { cellWidth: 88, fontStyle: "bold", fillColor: hexToRGB(PANEL) },
      3: { cellWidth: innerW / 2 - 88 },
    },
    body: [
      ["Nama", sub.fullName ?? "-", "Bentuk Tes", FORM_LABEL[sub.form] ?? sub.form],
      [
        "Jenis Kelamin",
        sub.gender ?? "-",
        "Usia",
        sub.age != null ? `${sub.age} tahun` : "-",
      ],
      ["Kelas", sub.grade ?? "-", "Sekolah", sub.school ?? "-"],
      [
        "Mulai",
        fmtDate(sub.startedAt),
        "Selesai",
        fmtDate(sub.finishedAt),
      ],
    ],
  })

  // Kartu hasil IQ
  let y = nextY(doc, 200) + 14
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  setTextHex(doc, INK)
  doc.text("HASIL PENGUKURAN", margin, y)
  y += 6

  const cardH = 62
  setFillHex(doc, PANEL)
  setDrawHex(doc, HAIRLINE)
  doc.setLineWidth(0.6)
  doc.rect(margin, y, innerW, cardH, "FD")

  const scoreW = 120
  setFillHex(doc, HIGHLIGHT)
  setDrawHex(doc, ACCENT_DEEP)
  doc.setLineWidth(0.8)
  doc.rect(margin + 8, y + 8, scoreW, cardH - 16, "FD")
  setTextHex(doc, ACCENT_DEEP)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text("SKOR IQ", margin + 8 + scoreW / 2, y + 22, { align: "center" })
  setTextHex(doc, INK)
  doc.setFontSize(28)
  doc.text(
    `${payload.belowNorm ? "≤" : ""}${result.iq}`,
    margin + 8 + scoreW / 2,
    y + 46,
    { align: "center" },
  )

  const infoX = margin + scoreW + 24
  setTextHex(doc, SOFT_INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.4)
  doc.text(`Norma kelompok ${normGroupLabel}`, infoX, y + 18)
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(result.classification, infoX, y + 36)
  if (payload.classificationEn) {
    setTextHex(doc, SOFT_INK)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.4)
    doc.text(payload.classificationEn, infoX, y + 47)
  }

  const rsX = pageW - margin - 150
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text("RAW SCORE", rsX, y + 18)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.6)
  doc.text(`Bentuk A : ${result.rawScoreA ?? "-"}`, rsX, y + 30)
  doc.text(`Bentuk B : ${result.rawScoreB ?? "-"}`, rsX, y + 40)
  doc.setFont("helvetica", "bold")
  doc.text(`Total (A + B) : ${result.rawScoreTotal}`, rsX, y + 51)

  y += cardH + 16

  // Rincian per subtes
  setTextHex(doc, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("RINCIAN PER SUBTES", margin, y)

  autoTable(doc, {
    startY: y + 6,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.6,
      cellPadding: 3,
      lineColor: hexToRGB(HAIRLINE),
      lineWidth: 0.4,
      textColor: hexToRGB(INK),
    },
    headStyles: {
      fillColor: hexToRGB(INK),
      textColor: hexToRGB(WHITE),
      fontStyle: "bold",
      fontSize: 7.4,
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

  y = nextY(doc, y + 60) + 12

  // Catatan penskoran
  const noteLines = [
    `Skor IQ diperoleh dengan mengonversi Raw Score total (A + B) = ${result.rawScoreTotal} memakai tabel norma CFIT Skala 3 kelompok ${normGroupLabel}.`,
    payload.belowNorm
      ? "Raw Score berada di bawah rentang tabel norma (baris terendah 20), sehingga skor IQ ditampilkan sebagai batas terendah norma."
      : "Hasil ini bersifat skrining dan bukan pengganti pemeriksaan psikologis oleh psikolog berlisensi.",
  ]
  setFillHex(doc, HIGHLIGHT)
  setDrawHex(doc, ACCENT_DEEP)
  doc.setLineWidth(0.5)
  const noteH = 12 + noteLines.length * 9
  doc.rect(margin, y, innerW, noteH, "FD")
  setTextHex(doc, INK)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.8)
  noteLines.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(line, innerW - 12) as string[]
    doc.text(wrapped[0] ?? "", margin + 6, y + 11 + i * 9)
  })
  y += noteH + 16

  // Grafik pengganti tabel skala klasifikasi
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  setTextHex(doc, INK)
  doc.text("GRAFIK CAPAIAN PER SUBTES", margin, y)
  y = drawSubtestChart(doc, perSubtest, margin, y + 14, pageW) + 10

  // QR validasi (tengah), lalu dua blok tanda tangan
  y = drawQrBlock(doc, reportCode, y, pageW) + 8
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
