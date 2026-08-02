// ─────────────────────────────────
// Logo Program Pascasarjana UM Metro untuk kop laporan PDF.
//
// Sumber gambar dicari berurutan:
//   1. env REPORT_LOGO_DATA_URL → "data:image/png;base64,..."
//   2. env REPORT_LOGO_PATH     → path file (relatif terhadap root proyek)
//   3. public/logo-pps-um-metro.png (dan beberapa nama cadangan)
//
// Bila tidak satu pun ditemukan, kop tetap tercetak TANPA logo (tidak error),
// sehingga laporan tetap bisa diunduh walau berkas logo belum dipasang.
// ─────────────────────────────────

import fs from "node:fs"
import path from "node:path"
import type jsPDF from "jspdf"

export type ReportLogo = { dataUrl: string; format: "PNG" | "JPEG" }

const CANDIDATE_FILES: string[] = [
  process.env.REPORT_LOGO_PATH,
  "public/logo-pps-um-metro.png",
  "public/logo-pps.png",
  "public/logo-pascasarjana.png",
  "public/logo-um-metro.png",
  "public/logo.png",
].filter((v): v is string => typeof v === "string" && v.trim().length > 0)

// undefined = belum pernah dicari, null = sudah dicari & memang tidak ada.
let cache: ReportLogo | null | undefined

function formatOf(source: string): "PNG" | "JPEG" {
  return /\.jpe?g$|^data:image\/jpe?g/i.test(source) ? "JPEG" : "PNG"
}

export function getReportLogo(): ReportLogo | null {
  if (cache !== undefined) return cache
  cache = null

  const inline = (process.env.REPORT_LOGO_DATA_URL ?? "").trim()
  if (inline.startsWith("data:image/")) {
    cache = { dataUrl: inline, format: formatOf(inline) }
    return cache
  }

  for (const rel of CANDIDATE_FILES) {
    try {
      const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel)
      if (!fs.existsSync(abs)) continue
      const format = formatOf(abs)
      const base64 = fs.readFileSync(abs).toString("base64")
      cache = {
        dataUrl: `data:image/${format === "JPEG" ? "jpeg" : "png"};base64,${base64}`,
        format,
      }
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
 * Sebelum gambar dicetak, area logo DIBERI LATAR PUTIH lebih dulu. Ini penting
 * karena PNG beralpha kadang dirender jsPDF dengan latar gelap; dengan latar
 * putih di bawahnya, logo tetap tampil bersih di atas kertas.
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
