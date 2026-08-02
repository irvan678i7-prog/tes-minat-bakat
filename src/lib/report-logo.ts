// ─────────────────────────────────
// Logo Program Pascasarjana UM Metro untuk kop laporan PDF.
//
// Sumber gambar dicari berurutan:
//   1. env REPORT_LOGO_DATA_URL → "data:image/png;base64,..."
//   2. env REPORT_LOGO_PATH     → path file (relatif terhadap root proyek)
//   3. public/logo-pps-um-metro.png (dan beberapa nama cadangan, .png & .jpg)
//
// PENTING — PNG TRANSPARAN:
// jsPDF merender sebagian PNG beralpha dengan area transparan menjadi HITAM.
// Karena itu setiap PNG DIRATAKAN dulu ke latar putih (lihat png-flatten.ts)
// sebelum ditempel ke dokumen, sehingga logo selalu tampil bersih.
//
// Bila tidak satu pun ditemukan, kop tetap tercetak TANPA logo (tidak error),
// sehingga laporan tetap bisa diunduh walau berkas logo belum dipasang.
// ─────────────────────────────────

import fs from "node:fs"
import path from "node:path"
import type jsPDF from "jspdf"
import { flattenPngOnBackground, isPngBuffer } from "./png-flatten"

export type ReportLogo = { dataUrl: string; format: "PNG" | "JPEG" }

const CANDIDATE_FILES: string[] = [
  process.env.REPORT_LOGO_PATH,
  "public/logo-pps-um-metro.png",
  "public/logo-pps-um-metro.jpg",
  "public/logo-pps.png",
  "public/logo-pps.jpg",
  "public/logo-pascasarjana.png",
  "public/logo-pascasarjana.jpg",
  "public/logo-um-metro.png",
  "public/logo-um-metro.jpg",
  "public/logo.png",
  "public/logo.jpg",
].filter((v): v is string => typeof v === "string" && v.trim().length > 0)

// undefined = belum pernah dicari, null = sudah dicari & memang tidak ada.
let cache: ReportLogo | null | undefined

function formatOf(source: string): "PNG" | "JPEG" {
  return /\.jpe?g$|^data:image\/jpe?g/i.test(source) ? "JPEG" : "PNG"
}

/**
 * Ubah isi berkas gambar menjadi data URL siap pakai jsPDF.
 * Khusus PNG, alpha diratakan ke latar putih lebih dulu.
 */
function toLogo(bytes: Buffer, format: "PNG" | "JPEG"): ReportLogo {
  if (format === "PNG" && isPngBuffer(bytes)) {
    const flat = flattenPngOnBackground(bytes, [255, 255, 255])
    if (flat) {
      return { dataUrl: `data:image/png;base64,${flat.toString("base64")}`, format: "PNG" }
    }
  }
  return {
    dataUrl: `data:image/${format === "JPEG" ? "jpeg" : "png"};base64,${bytes.toString("base64")}`,
    format,
  }
}

export function getReportLogo(): ReportLogo | null {
  if (cache !== undefined) return cache
  cache = null

  const inline = (process.env.REPORT_LOGO_DATA_URL ?? "").trim()
  if (inline.startsWith("data:image/")) {
    const format = formatOf(inline)
    const base64 = inline.slice(inline.indexOf(",") + 1)
    try {
      cache = toLogo(Buffer.from(base64, "base64"), format)
    } catch {
      cache = { dataUrl: inline, format }
    }
    return cache
  }

  for (const rel of CANDIDATE_FILES) {
    try {
      const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel)
      if (!fs.existsSync(abs)) continue
      cache = toLogo(fs.readFileSync(abs), formatOf(abs))
      return cache
    } catch {
      // Berkas tidak terbaca → coba kandidat berikutnya.
    }
  }

  return cache
}

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * Cetak logo pada kop laporan (bujur sangkar).
 *
 * Area logo diberi LATAR PUTIH lebih dulu sebagai pengaman tambahan, lalu
 * gambar (yang alpha-nya sudah diratakan) ditempel di atasnya.
 *
 * @param opts.background warna latar (default putih). Isi `null` untuk
 *                        mencetak logo tanpa latar sama sekali.
 * @param opts.padding    ketebalan margin latar putih di sekeliling logo.
 * @returns true bila logo berhasil dicetak.
 */
export function drawReportLogo(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  opts?: { background?: string | null; padding?: number },
): boolean {
  const logo = getReportLogo()
  if (!logo) return false
  try {
    const background =
      opts?.background === undefined ? "#FFFFFF" : opts.background
    const padding = opts?.padding ?? 2
    if (background) {
      const [r, g, b] = hexToRGB(background)
      doc.setFillColor(r, g, b)
      doc.rect(
        x - padding,
        y - padding,
        size + padding * 2,
        size + padding * 2,
        "F",
      )
    }
    doc.addImage(logo.dataUrl, logo.format, x, y, size, size)
    return true
  } catch {
    return false
  }
}
