/** Jabatan penanda tangan invoice, dicetak di atas ruang tanda tangan. */
export const INVOICE_SIGNER_LINES = [
  "Kaprodi S2 Bimbingan dan Konseling",
  "Program Pascasarjana Universitas Muhammadiyah Metro",
] as const;

/** Batas panjang nama penanda tangan supaya tetap rapi di kotak tanda tangan. */
export const MAX_SIGNER_NAME = 80;

/** Rapikan spasi berlebih lalu potong bila melebihi batas. */
export function normalizeSignerName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_SIGNER_NAME);
}

/**
 * Pesan galat bila nama memuat karakter yang tidak bisa dicetak jsPDF
 * (font standar hanya mendukung Latin-1). Nama kosong dianggap sah karena
 * kolom ini opsional.
 */
export function signerNameError(value: string): string | null {
  const name = normalizeSignerName(value);
  if (!name) return null;
  if (!/^[\u0020-\u00FF]+$/.test(name)) {
    return "Nama hanya boleh memakai huruf, angka, dan tanda baca umum.";
  }
  return null;
}
