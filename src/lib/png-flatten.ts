// ─────────────────────────────────────────────────────────────
// Perata (flatten) alpha PNG.
//
// MASALAH: jsPDF menempelkan PNG beralpha apa adanya. Untuk sebagian berkas
// (mis. PNG dengan kanal alpha, PNG palet + tRNS, atau PNG 16-bit), area
// transparan tidak dirender transparan melainkan menjadi HITAM PEKAT, sehingga
// logo di kop laporan terlihat seperti kotak hitam.
//
// SOLUSI: sebelum gambar dikirim ke jsPDF, PNG dibaca sendiri di sisi server,
// setiap piksel dicampur (composite) dengan warna latar (default PUTIH), lalu
// ditulis ulang sebagai PNG 24-bit RGB TANPA kanal alpha. PNG hasil ini pasti
// dirender benar oleh jsPDF.
//
// Ditulis tanpa dependensi tambahan (hanya node:zlib) supaya tidak menambah
// paket baru ke proyek.
// ─────────────────────────────────────────────────────────────

import zlib from "node:zlib"

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  crcTable = table
  return table
}

function crc32(buf: Buffer): number {
  const table = getCrcTable()
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, "ascii")
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

export function isPngBuffer(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)
}

/**
 * Baca PNG, campurkan seluruh piksel dengan warna latar, lalu tulis ulang
 * sebagai PNG 24-bit RGB tanpa alpha.
 *
 * @returns Buffer PNG baru, atau `null` bila berkas tidak dikenali / memakai
 *          fitur yang tidak didukung (mis. interlace Adam7). Pemanggil harus
 *          memakai berkas aslinya bila hasilnya `null`.
 */
export function flattenPngOnBackground(
  input: Buffer,
  background: [number, number, number] = [255, 255, 255],
): Buffer | null {
  try {
    if (!isPngBuffer(input)) return null

    let width = 0
    let height = 0
    let bitDepth = 0
    let colorType = -1
    let interlace = 0
    let palette: Buffer | null = null
    let trns: Buffer | null = null
    const idatParts: Buffer[] = []

    let offset = 8
    while (offset + 8 <= input.length) {
      const len = input.readUInt32BE(offset)
      const type = input.toString("ascii", offset + 4, offset + 8)
      const dataStart = offset + 8
      const dataEnd = dataStart + len
      if (dataEnd > input.length) return null
      const data = input.subarray(dataStart, dataEnd)

      if (type === "IHDR") {
        width = data.readUInt32BE(0)
        height = data.readUInt32BE(4)
        bitDepth = data[8]
        colorType = data[9]
        interlace = data[12]
      } else if (type === "PLTE") {
        palette = Buffer.from(data)
      } else if (type === "tRNS") {
        trns = Buffer.from(data)
      } else if (type === "IDAT") {
        idatParts.push(Buffer.from(data))
      } else if (type === "IEND") {
        break
      }

      offset = dataEnd + 4
    }

    if (!width || !height || idatParts.length === 0) return null
    if (interlace !== 0) return null

    const channels = CHANNELS[colorType]
    if (!channels) return null
    if (colorType === 3 && !palette) return null
    if (bitDepth !== 8 && bitDepth !== 16 && !(colorType === 3 && [1, 2, 4].includes(bitDepth))) {
      if (!(colorType === 0 && [1, 2, 4].includes(bitDepth))) return null
    }

    const raw = zlib.inflateSync(Buffer.concat(idatParts))

    const bitsPerPixel = channels * bitDepth
    const lineBytes = Math.ceil((width * bitsPerPixel) / 8)
    const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8))
    if (raw.length < height * (lineBytes + 1)) return null

    // ─── Hapus filter tiap baris ───
    const pixels = Buffer.alloc(height * lineBytes)
    let rawPos = 0
    for (let y = 0; y < height; y++) {
      const filter = raw[rawPos]
      rawPos += 1
      const rowStart = y * lineBytes
      const prevStart = rowStart - lineBytes
      for (let i = 0; i < lineBytes; i++) {
        const x = raw[rawPos + i]
        const a = i >= bpp ? pixels[rowStart + i - bpp] : 0
        const b = y > 0 ? pixels[prevStart + i] : 0
        const c = y > 0 && i >= bpp ? pixels[prevStart + i - bpp] : 0
        let value: number
        switch (filter) {
          case 0:
            value = x
            break
          case 1:
            value = x + a
            break
          case 2:
            value = x + b
            break
          case 3:
            value = x + ((a + b) >> 1)
            break
          case 4:
            value = x + paeth(a, b, c)
            break
          default:
            return null
        }
        pixels[rowStart + i] = value & 0xff
      }
      rawPos += lineBytes
    }

    // ─── Ambil sampel per piksel ───
    const sampleBytes = bitDepth === 16 ? 2 : 1
    const maxSub = (1 << bitDepth) - 1

    function subSample(rowStart: number, index: number): number {
      // Untuk bit depth 1/2/4 (grayscale atau palet).
      const bitPos = index * bitDepth
      const byte = pixels[rowStart + (bitPos >> 3)]
      const shift = 8 - bitDepth - (bitPos & 7)
      return (byte >> shift) & maxSub
    }

    const [bgR, bgG, bgB] = background
    const out = Buffer.alloc(width * height * 3)

    for (let y = 0; y < height; y++) {
      const rowStart = y * lineBytes
      for (let x = 0; x < width; x++) {
        let r = 0
        let g = 0
        let b = 0
        let alpha = 255

        if (bitDepth < 8) {
          const s = subSample(rowStart, x)
          if (colorType === 3) {
            const pal = palette as Buffer
            const p = s * 3
            r = pal[p] ?? 0
            g = pal[p + 1] ?? 0
            b = pal[p + 2] ?? 0
            if (trns && s < trns.length) alpha = trns[s]
          } else {
            const v = Math.round((s / maxSub) * 255)
            r = v
            g = v
            b = v
            if (trns && trns.length >= 2 && trns.readUInt16BE(0) === s) alpha = 0
          }
        } else {
          const base = rowStart + x * channels * sampleBytes
          const s0 = pixels[base]
          if (colorType === 0) {
            r = s0
            g = s0
            b = s0
            if (trns && trns.length >= 2) {
              const key = bitDepth === 16 ? trns.readUInt16BE(0) >> 8 : trns.readUInt16BE(0)
              if (key === s0) alpha = 0
            }
          } else if (colorType === 2) {
            r = s0
            g = pixels[base + sampleBytes]
            b = pixels[base + sampleBytes * 2]
            if (trns && trns.length >= 6) {
              const kr = bitDepth === 16 ? trns.readUInt16BE(0) >> 8 : trns.readUInt16BE(0)
              const kg = bitDepth === 16 ? trns.readUInt16BE(2) >> 8 : trns.readUInt16BE(2)
              const kb = bitDepth === 16 ? trns.readUInt16BE(4) >> 8 : trns.readUInt16BE(4)
              if (kr === r && kg === g && kb === b) alpha = 0
            }
          } else if (colorType === 3) {
            const pal = palette as Buffer
            const p = s0 * 3
            r = pal[p] ?? 0
            g = pal[p + 1] ?? 0
            b = pal[p + 2] ?? 0
            if (trns && s0 < trns.length) alpha = trns[s0]
          } else if (colorType === 4) {
            r = s0
            g = s0
            b = s0
            alpha = pixels[base + sampleBytes]
          } else {
            r = s0
            g = pixels[base + sampleBytes]
            b = pixels[base + sampleBytes * 2]
            alpha = pixels[base + sampleBytes * 3]
          }
        }

        const o = (y * width + x) * 3
        if (alpha >= 255) {
          out[o] = r
          out[o + 1] = g
          out[o + 2] = b
        } else {
          const a = alpha / 255
          out[o] = Math.round(r * a + bgR * (1 - a))
          out[o + 1] = Math.round(g * a + bgG * (1 - a))
          out[o + 2] = Math.round(b * a + bgB * (1 - a))
        }
      }
    }

    // ─── Tulis ulang sebagai PNG 24-bit RGB tanpa alpha ───
    const rowLen = width * 3
    const encoded = Buffer.alloc(height * (rowLen + 1))
    for (let y = 0; y < height; y++) {
      encoded[y * (rowLen + 1)] = 0 // filter: none
      out.copy(encoded, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen)
    }

    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8 // bit depth
    ihdr[9] = 2 // color type: truecolor tanpa alpha
    ihdr[10] = 0
    ihdr[11] = 0
    ihdr[12] = 0

    return Buffer.concat([
      PNG_SIGNATURE,
      makeChunk("IHDR", ihdr),
      makeChunk("IDAT", zlib.deflateSync(encoded, { level: 9 })),
      makeChunk("IEND", Buffer.alloc(0)),
    ])
  } catch {
    return null
  }
}
