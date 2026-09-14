import jsPDF from "jspdf";
import {
  INVOICE_TESTS, formatCount, formatInvoiceDate, formatRupiah, invoiceFormOf,
  validateInvoice, type Invoice,
} from "./invoice";
import { INVOICE_SIGNER_LINES, normalizeSignerName } from "./invoice-signature";

// Palet mengikuti tema panel admin: garis hitam tebal, box hijau dengan strip
// kuning, latar putih supaya dokumen tetap enak dibaca dan ramah saat dicetak.
const BLACK = "#000000";
const YELLOW = "#FACC15";
const CREAM = "#FEF9C3";
// Hijau untuk box kop, tabel rincian, dan total tagihan.
const GREEN = "#A3E635";
const GREEN_SOFT = "#F7FEE7";
const GREEN_DEEP = "#365314";
const MUTED = "#4A4A4A";
const HAIRLINE = "#BDBDBD";
const TERMS =
  "Cantumkan nomor invoice saat melakukan pembayaran. Invoice ini merupakan tagihan, bukan bukti pembayaran atau faktur pajak.";
// Skala vertikal yang dicoba berurutan sampai seluruh isi invoice muat dalam
// satu halaman A4. Skala 1 = tata letak normal.
const FIT_SCALES = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4];

/** Pure client-side export: no test records, tokens or payment state are changed. */
export function buildInvoicePDF(invoice: Invoice, signerName = ""): jsPDF {
  // Revalidate lewat pemetaan eksplisit: nominal pada PDF selalu dihitung ulang
  // dari jumlah siswa dan harga, bukan dari total yang dikirim pemanggil.
  const checked = validateInvoice(invoiceFormOf(invoice));
  if (!checked.ok || !invoice.number) throw new Error("Data invoice belum valid.");
  const data = checked.value;
  const signer = normalizeSignerName(signerName);
  // Invoice harus satu lembar: rapatkan tata letak bertahap sampai muat.
  let rendered = renderInvoice(data, signer, 1);
  for (const scale of FIT_SCALES) {
    rendered = renderInvoice(data, signer, scale);
    if (rendered.fits) return rendered.doc;
  }
  return rendered.doc;
}

function renderInvoice(
  data: Invoice,
  signer: string,
  scale: number,
): { doc: jsPDF; fits: boolean } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  // vs: ukuran vertikal, fs: ukuran huruf (huruf dikecilkan lebih pelan supaya
  // dokumen tetap terbaca walau tata letaknya dirapatkan).
  const vs = (value: number) => value * scale;
  const fs = (size: number) => size * Math.max(scale, 0.72);
  const margin = 42;
  const right = width - margin;
  const contentWidth = width - margin * 2;
  const footerTop = height - vs(56);
  const limit = footerTop - vs(16);
  let overflow = false;
  let y = vs(42);

  doc.setProperties({
    title: `Invoice ${data.number}`,
    subject: `${INVOICE_TESTS[data.test]} - ${data.customer}`,
    author: data.issuer,
    creator: data.issuer,
  });

  const font = (size: number, bold = false, color: string = BLACK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const lines = (text: string, maxWidth: number): string[] =>
    doc.splitTextToSize(text, maxWidth) as string[];
  const fill = (color: string, x: number, top: number, w: number, h: number) => {
    doc.setFillColor(color);
    doc.rect(x, top, w, h, "F");
  };
  const stroke = (x: number, top: number, w: number, h: number, lineWidth = 1.2) => {
    doc.setDrawColor(BLACK);
    doc.setLineWidth(lineWidth);
    doc.rect(x, top, w, h, "S");
  };
  const divider = (x: number, top: number, bottom: number) => {
    doc.setDrawColor(BLACK);
    doc.setLineWidth(0.8);
    doc.line(x, top, x, bottom);
  };
  // Label kuning bergaris hitam — bahasa visual yang sama dengan tag di panel.
  const chip = (label: string, x: number, baseline: number) => {
    font(fs(7.5), true, BLACK);
    const chipWidth = doc.getTextWidth(label) + 14;
    fill(YELLOW, x, baseline - vs(9.5), chipWidth, vs(14));
    stroke(x, baseline - vs(9.5), chipWidth, vs(14), 0.8);
    doc.text(label, x + 7, baseline + vs(0.5));
  };
  // Tidak ada halaman tambahan: kalau isi belum muat, hasil render ini ditandai
  // tidak layak dan dicoba ulang dengan skala yang lebih rapat.
  const ensure = (needed: number) => {
    if (y + needed > limit) overflow = true;
  };

  // ── Kop dokumen ────────────────────────────────────────────
  font(fs(11), true, BLACK);
  const numberLines = lines(data.number, 190);
  const bandHeight = Math.max(vs(64), vs(40) + numberLines.length * vs(13) + vs(10));
  fill(GREEN, margin, y, contentWidth, bandHeight);
  font(fs(26), true, BLACK);
  doc.text("INVOICE", margin + 18, y + vs(34));
  font(fs(7.5), true, GREEN_DEEP);
  doc.text("TAGIHAN PEMBAYARAN TES", margin + 19, y + vs(50));
  doc.text("NOMOR INVOICE", right - 18, y + vs(24), { align: "right" });
  font(fs(11), true, BLACK);
  doc.text(numberLines, right - 18, y + vs(40), { align: "right", lineHeightFactor: 1.2 });
  y += bandHeight;
  fill(YELLOW, margin, y, contentWidth, vs(8));
  y += vs(8);

  // ── Penagih & penerima ────────────────────────────────────
  const columnWidth = contentWidth / 2;
  const partyTop = y;
  const party = (x: number, label: string, name: string, details: string): number => {
    let cursor = partyTop + vs(26);
    chip(label, x + 14, cursor);
    cursor += vs(24);
    font(fs(13), true);
    for (const line of lines(name, columnWidth - 28)) {
      doc.text(line, x + 14, cursor);
      cursor += vs(16);
    }
    if (details) {
      cursor += vs(4);
      font(fs(9), false, MUTED);
      for (const line of lines(details, columnWidth - 28)) {
        doc.text(line, x + 14, cursor);
        cursor += vs(12.5);
      }
    }
    return cursor;
  };
  const issuerBottom = party(margin, "DITERBITKAN OLEH", data.issuer, data.issuerDetails);
  const customerBottom = party(margin + columnWidth, "DITAGIHKAN KEPADA", data.customer, data.customerDetails);
  const partyBottom = Math.max(issuerBottom, customerBottom) + vs(14);
  stroke(margin, partyTop, contentWidth, partyBottom - partyTop);
  divider(margin + columnWidth, partyTop, partyBottom);
  y = partyBottom + vs(26);

  // ── Tanggal & layanan ─────────────────────────────────────
  const metaHeight = vs(48);
  ensure(metaHeight + vs(20));
  const metaTop = y;
  const metaWidth = contentWidth / 3;
  fill(CREAM, margin, metaTop, contentWidth, metaHeight);
  stroke(margin, metaTop, contentWidth, metaHeight);
  const metaCell = (index: number, label: string, value: string) => {
    const x = margin + metaWidth * index + 14;
    if (index > 0) divider(margin + metaWidth * index, metaTop, metaTop + metaHeight);
    font(fs(7), true, MUTED);
    doc.text(label, x, metaTop + vs(18));
    font(fs(10.5), true, BLACK);
    doc.text(lines(value, metaWidth - 28)[0] || "-", x, metaTop + vs(35));
  };
  metaCell(0, "TANGGAL INVOICE", formatInvoiceDate(data.issuedAt));
  metaCell(1, "JATUH TEMPO", data.dueAt ? formatInvoiceDate(data.dueAt) : "Tidak ditentukan");
  metaCell(2, "LAYANAN TES", INVOICE_TESTS[data.test]);
  y = metaTop + metaHeight + vs(26);

  // ── Rincian tagihan ───────────────────────────────────────
  const cols = [
    margin,
    margin + contentWidth * 0.38,
    margin + contentWidth * 0.52,
    margin + contentWidth * 0.76,
    right,
  ];
  const headHeight = vs(26);
  fill(GREEN, margin, y, contentWidth, headHeight);
  stroke(margin, y, contentWidth, headHeight);
  font(fs(7.5), true, BLACK);
  doc.text("DESKRIPSI LAYANAN", cols[0] + 12, y + vs(17));
  doc.text("SISWA", cols[2] - 12, y + vs(17), { align: "right" });
  doc.text("HARGA / SISWA", cols[3] - 12, y + vs(17), { align: "right" });
  doc.text("JUMLAH", cols[4] - 12, y + vs(17), { align: "right" });
  y += headHeight;

  font(fs(11), true);
  const descLines = lines(INVOICE_TESTS[data.test], cols[1] - cols[0] - 24);
  const rowHeight = Math.max(vs(38), vs(22) + descLines.length * vs(14));
  ensure(rowHeight + vs(20));
  fill(GREEN_SOFT, margin, y, contentWidth, rowHeight);
  stroke(margin, y, contentWidth, rowHeight);
  for (const x of cols.slice(1, 4)) divider(x, y, y + rowHeight);
  font(fs(11), true);
  doc.text(descLines, cols[0] + 12, y + vs(24), { lineHeightFactor: 1.3 });
  // Nominal besar dikecilkan otomatis supaya tidak pernah keluar dari selnya.
  font(fs(9.5), false);
  const priceText = formatRupiah(data.unitPrice);
  if (doc.getTextWidth(priceText) > cols[3] - cols[2] - 24) font(fs(8.5), false);
  doc.text(formatCount(data.quantity), cols[2] - 12, y + vs(24), { align: "right" });
  doc.text(priceText, cols[3] - 12, y + vs(24), { align: "right" });
  const amountText = formatRupiah(data.total);
  font(fs(10.5), true);
  if (doc.getTextWidth(amountText) > cols[4] - cols[3] - 24) font(fs(9), true);
  doc.text(amountText, cols[4] - 12, y + vs(24), { align: "right" });
  y += rowHeight + vs(20);

  // ── Total tagihan ─────────────────────────────────────────
  const totalWidth = 268;
  const totalHeight = vs(62);
  ensure(totalHeight + vs(16));
  const totalX = right - totalWidth;
  font(fs(9), false, MUTED);
  doc.text(`${formatCount(data.quantity)} siswa \u00D7 ${priceText}`, margin, y + vs(26));
  fill(GREEN, totalX, y, totalWidth, totalHeight);
  fill(YELLOW, totalX, y, 8, totalHeight);
  font(fs(8), true, GREEN_DEEP);
  doc.text("TOTAL TAGIHAN", totalX + 24, y + vs(24));
  font(fs(20), true, BLACK);
  if (doc.getTextWidth(amountText) > totalWidth - 46) font(fs(15.5), true, BLACK);
  doc.text(amountText, right - 20, y + vs(48), { align: "right" });
  y += totalHeight + vs(28);

  // ── Keterangan tambahan ───────────────────────────────────
  const block = (label: string, text: string) => {
    if (!text) return;
    font(fs(9.5), false, "#1A1A1A");
    const body = lines(text, contentWidth - 4);
    ensure(vs(30) + body.length * vs(13));
    chip(label, margin, y);
    y += vs(22);
    for (const line of body) {
      font(fs(9.5), false, "#1A1A1A");
      doc.text(line, margin + 2, y);
      y += vs(13);
    }
    y += vs(18);
  };
  block("INFORMASI PEMBAYARAN", data.paymentDetails);
  block("CATATAN", data.notes);

  // ── Kolom tanda tangan: jabatan di atas, ruang tanda tangan, lalu nama ──
  const signWidth = 280;
  const signX = right - signWidth;
  font(fs(8.5), true, BLACK);
  const roleLines = INVOICE_SIGNER_LINES.flatMap((line) => lines(line, signWidth - 28));
  font(fs(10), true, BLACK);
  const nameLines = signer ? lines(signer, signWidth - 28) : [];
  const roleTop = vs(22);
  const ruleOffset = roleTop + roleLines.length * vs(12) + vs(48);
  const nameTop = ruleOffset + vs(16);
  const signHeight =
    (nameLines.length ? nameTop + (nameLines.length - 1) * vs(13) : ruleOffset) + vs(16);
  ensure(signHeight + vs(20));
  const signTop = y;
  stroke(signX, signTop, signWidth, signHeight);
  let signCursor = signTop + roleTop;
  for (const line of roleLines) {
    font(fs(8.5), true, BLACK);
    doc.text(line, signX + 14, signCursor);
    signCursor += vs(12);
  }
  doc.setDrawColor(BLACK);
  doc.setLineWidth(0.8);
  doc.line(signX + 14, signTop + ruleOffset, signX + signWidth - 14, signTop + ruleOffset);
  signCursor = signTop + nameTop;
  for (const line of nameLines) {
    font(fs(10), true, BLACK);
    doc.text(line, signX + 14, signCursor);
    signCursor += vs(13);
  }
  y = signTop + signHeight + vs(24);

  font(fs(8.5), false, MUTED);
  const terms = lines(TERMS, contentWidth - 4);
  ensure(vs(24) + terms.length * vs(12));
  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, right, y);
  y += vs(16);
  for (const line of terms) {
    font(fs(8.5), false, MUTED);
    doc.text(line, margin, y);
    y += vs(12);
  }

  // ── Kaki halaman ──────────────────────────────────────────
  fill(BLACK, margin, footerTop, contentWidth, Math.max(vs(3), 1.5));
  font(fs(8), true, BLACK);
  doc.text(lines(data.issuer.toUpperCase(), contentWidth - 130)[0] || "", margin, footerTop + vs(18));
  font(fs(8), false, MUTED);
  doc.text("Halaman 1 / 1", right, footerTop + vs(18), { align: "right" });

  return { doc, fits: !overflow && doc.getNumberOfPages() === 1 };
}
