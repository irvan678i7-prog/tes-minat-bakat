import jsPDF from "jspdf";
import {
  INVOICE_TESTS, formatCount, formatInvoiceDate, formatRupiah, invoiceFormOf,
  validateInvoice, type Invoice,
} from "./invoice";

// Palet mengikuti tema panel admin: hitam tebal + aksen kuning, latar putih
// supaya dokumen tetap enak dibaca dan ramah saat dicetak hitam-putih.
const BLACK = "#000000";
const WHITE = "#FFFFFF";
const YELLOW = "#FACC15";
const CREAM = "#FEF9C3";
const MUTED = "#4A4A4A";
const HAIRLINE = "#BDBDBD";
const TERMS =
  "Cantumkan nomor invoice saat melakukan pembayaran. Invoice ini merupakan tagihan, bukan bukti pembayaran atau faktur pajak.";

/** Pure client-side export: no test records, tokens or payment state are changed. */
export function buildInvoicePDF(invoice: Invoice): jsPDF {
  // Revalidate lewat pemetaan eksplisit: nominal pada PDF selalu dihitung ulang
  // dari jumlah siswa dan harga, bukan dari total yang dikirim pemanggil.
  const checked = validateInvoice(invoiceFormOf(invoice));
  if (!checked.ok || !invoice.number) throw new Error("Data invoice belum valid.");
  const data = checked.value;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 42;
  const right = width - margin;
  const contentWidth = width - margin * 2;
  const footerTop = height - 56;
  let y = margin;

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
    font(7.5, true, BLACK);
    const chipWidth = doc.getTextWidth(label) + 14;
    fill(YELLOW, x, baseline - 9.5, chipWidth, 14);
    stroke(x, baseline - 9.5, chipWidth, 14, 0.8);
    doc.text(label, x + 7, baseline + 0.5);
  };
  const ensure = (needed: number) => {
    if (y + needed <= footerTop - 16) return;
    doc.addPage();
    y = margin;
    fill(BLACK, margin, y, contentWidth, 24);
    font(8, true, WHITE);
    doc.text(lines(`INVOICE ${data.number}`, contentWidth - 100)[0] || "INVOICE", margin + 10, y + 16);
    font(8, true, YELLOW);
    doc.text("LANJUTAN", right - 10, y + 16, { align: "right" });
    y += 50;
  };

  // ── Kop dokumen ────────────────────────────────────────────────
  font(11, true, WHITE);
  const numberLines = lines(data.number, 190);
  const bandHeight = Math.max(64, 40 + numberLines.length * 13 + 10);
  fill(BLACK, margin, y, contentWidth, bandHeight);
  font(26, true, WHITE);
  doc.text("INVOICE", margin + 18, y + 34);
  font(7.5, true, YELLOW);
  doc.text("TAGIHAN PEMBAYARAN TES", margin + 19, y + 50);
  doc.text("NOMOR INVOICE", right - 18, y + 24, { align: "right" });
  font(11, true, WHITE);
  doc.text(numberLines, right - 18, y + 40, { align: "right", lineHeightFactor: 1.2 });
  y += bandHeight;
  fill(YELLOW, margin, y, contentWidth, 8);
  y += 8;

  // ── Penagih & penerima ─────────────────────────────────────────
  const columnWidth = contentWidth / 2;
  const partyTop = y;
  const party = (x: number, label: string, name: string, details: string): number => {
    let cursor = partyTop + 26;
    chip(label, x + 14, cursor);
    cursor += 24;
    font(13, true);
    for (const line of lines(name, columnWidth - 28)) {
      doc.text(line, x + 14, cursor);
      cursor += 16;
    }
    if (details) {
      cursor += 4;
      font(9, false, MUTED);
      for (const line of lines(details, columnWidth - 28)) {
        doc.text(line, x + 14, cursor);
        cursor += 12.5;
      }
    }
    return cursor;
  };
  const issuerBottom = party(margin, "DITERBITKAN OLEH", data.issuer, data.issuerDetails);
  const customerBottom = party(margin + columnWidth, "DITAGIHKAN KEPADA", data.customer, data.customerDetails);
  const partyBottom = Math.max(issuerBottom, customerBottom) + 14;
  stroke(margin, partyTop, contentWidth, partyBottom - partyTop);
  divider(margin + columnWidth, partyTop, partyBottom);
  y = partyBottom + 26;

  // ── Tanggal & layanan ──────────────────────────────────────────
  const metaHeight = 48;
  ensure(metaHeight + 20);
  const metaTop = y;
  const metaWidth = contentWidth / 3;
  fill(CREAM, margin, metaTop, contentWidth, metaHeight);
  stroke(margin, metaTop, contentWidth, metaHeight);
  const metaCell = (index: number, label: string, value: string) => {
    const x = margin + metaWidth * index + 14;
    if (index > 0) divider(margin + metaWidth * index, metaTop, metaTop + metaHeight);
    font(7, true, MUTED);
    doc.text(label, x, metaTop + 18);
    font(10.5, true, BLACK);
    doc.text(lines(value, metaWidth - 28)[0] || "-", x, metaTop + 35);
  };
  metaCell(0, "TANGGAL INVOICE", formatInvoiceDate(data.issuedAt));
  metaCell(1, "JATUH TEMPO", data.dueAt ? formatInvoiceDate(data.dueAt) : "Tidak ditentukan");
  metaCell(2, "LAYANAN TES", INVOICE_TESTS[data.test]);
  y = metaTop + metaHeight + 26;

  // ── Rincian tagihan ────────────────────────────────────────────
  const cols = [
    margin,
    margin + contentWidth * 0.38,
    margin + contentWidth * 0.52,
    margin + contentWidth * 0.76,
    right,
  ];
  const headHeight = 26;
  ensure(headHeight + 120);
  fill(BLACK, margin, y, contentWidth, headHeight);
  font(7.5, true, WHITE);
  doc.text("DESKRIPSI LAYANAN", cols[0] + 12, y + 17);
  doc.text("SISWA", cols[2] - 12, y + 17, { align: "right" });
  doc.text("HARGA / SISWA", cols[3] - 12, y + 17, { align: "right" });
  doc.text("JUMLAH", cols[4] - 12, y + 17, { align: "right" });
  y += headHeight;

  font(11, true);
  const descLines = lines(INVOICE_TESTS[data.test], cols[1] - cols[0] - 24);
  const rowHeight = Math.max(38, 22 + descLines.length * 14);
  stroke(margin, y, contentWidth, rowHeight);
  for (const x of cols.slice(1, 4)) divider(x, y, y + rowHeight);
  font(11, true);
  doc.text(descLines, cols[0] + 12, y + 24, { lineHeightFactor: 1.3 });
  // Nominal besar dikecilkan otomatis supaya tidak pernah keluar dari selnya.
  font(9.5, false);
  const priceText = formatRupiah(data.unitPrice);
  if (doc.getTextWidth(priceText) > cols[3] - cols[2] - 24) font(8.5, false);
  doc.text(formatCount(data.quantity), cols[2] - 12, y + 24, { align: "right" });
  doc.text(priceText, cols[3] - 12, y + 24, { align: "right" });
  const amountText = formatRupiah(data.total);
  font(10.5, true);
  if (doc.getTextWidth(amountText) > cols[4] - cols[3] - 24) font(9, true);
  doc.text(amountText, cols[4] - 12, y + 24, { align: "right" });
  y += rowHeight + 20;

  // ── Total tagihan ──────────────────────────────────────────────
  const totalWidth = 268;
  const totalHeight = 62;
  ensure(totalHeight + 16);
  const totalX = right - totalWidth;
  font(9, false, MUTED);
  doc.text(`${formatCount(data.quantity)} siswa \u00D7 ${priceText}`, margin, y + 26);
  fill(BLACK, totalX, y, totalWidth, totalHeight);
  fill(YELLOW, totalX, y, 8, totalHeight);
  font(8, true, YELLOW);
  doc.text("TOTAL TAGIHAN", totalX + 24, y + 24);
  font(20, true, WHITE);
  if (doc.getTextWidth(amountText) > totalWidth - 46) font(15.5, true, WHITE);
  doc.text(amountText, right - 20, y + 48, { align: "right" });
  y += totalHeight + 28;

  // ── Keterangan tambahan ────────────────────────────────────────
  const block = (label: string, text: string) => {
    if (!text) return;
    font(9.5, false, "#1A1A1A");
    const body = lines(text, contentWidth - 4);
    ensure(30 + body.length * 13);
    chip(label, margin, y);
    y += 22;
    for (const line of body) {
      ensure(14);
      font(9.5, false, "#1A1A1A");
      doc.text(line, margin + 2, y);
      y += 13;
    }
    y += 18;
  };
  block("INFORMASI PEMBAYARAN", data.paymentDetails);
  block("CATATAN", data.notes);

  font(8.5, false, MUTED);
  const terms = lines(TERMS, contentWidth - 4);
  ensure(24 + terms.length * 12);
  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, right, y);
  y += 16;
  for (const line of terms) {
    ensure(13);
    font(8.5, false, MUTED);
    doc.text(line, margin, y);
    y += 12;
  }

  // ── Kaki halaman ───────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    fill(BLACK, margin, footerTop, contentWidth, 3);
    font(8, true, BLACK);
    doc.text(lines(data.issuer.toUpperCase(), contentWidth - 130)[0] || "", margin, footerTop + 18);
    font(8, false, MUTED);
    doc.text(`Halaman ${page} / ${pages}`, right, footerTop + 18, { align: "right" });
  }
  return doc;
}
