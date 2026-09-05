import jsPDF from "jspdf";
import { INVOICE_TESTS, formatInvoiceDate, formatRupiah, validateInvoice, type Invoice } from "./invoice";

/** Pure client-side export: no test records, tokens or payment state are changed. */
export function buildInvoicePDF(invoice: Invoice): jsPDF {
  const checked = validateInvoice({
    ...invoice, quantity: String(invoice.quantity), unitPrice: String(invoice.unitPrice),
  });
  if (!checked.ok || !invoice.number) throw new Error("Data invoice belum valid.");
  // Always calculate the amount from the validated quantity and unit price.
  const data = checked.value;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 44;
  const right = width - margin;
  const contentWidth = width - margin * 2;
  const blue = "#175CD3";
  const ink = "#172B4D";
  const muted = "#526174";
  let y = 0;

  doc.setProperties({ title: `Invoice ${data.number}`, subject: INVOICE_TESTS[data.test], author: data.issuer });
  const font = (size: number, bold = false, color = ink) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const rule = (at: number) => {
    doc.setDrawColor("#DCE3EB");
    doc.setLineWidth(0.7);
    doc.line(margin, at, right, at);
  };
  const ensure = (needed: number) => {
    if (y + needed > height - 76) {
      doc.addPage();
      font(10, true, muted);
      doc.text(`INVOICE ${data.number} (lanjutan)`, margin, 38);
      rule(48);
      y = 72;
    }
  };
  const lines = (text: string, maxWidth: number): string[] => doc.splitTextToSize(text, maxWidth) as string[];
  const block = (label: string, text: string) => {
    if (!text) return;
    ensure(58);
    font(10, true, blue);
    doc.text(label, margin, y);
    y += 20;
    font(11);
    for (const line of lines(text, contentWidth)) {
      ensure(16);
      font(11);
      doc.text(line, margin, y);
      y += 16;
    }
    y += 20;
  };

  doc.setFillColor(blue);
  doc.rect(0, 0, width, 8, "F");
  font(30, true);
  doc.text("INVOICE", margin, 63);
  font(10, true, muted);
  doc.text("TAGIHAN PEMBAYARAN TES", right, 45, { align: "right" });
  font(10, true);
  const numberLines = lines(data.number, 250);
  doc.text(numberLines, right, 65, { align: "right", lineHeightFactor: 1.4 });
  y = Math.max(94, 65 + numberLines.length * 14 + 16);
  rule(y);
  y += 28;

  const columnWidth = (contentWidth - 32) / 2;
  const party = (x: number, label: string, name: string, details: string): number => {
    let cursor = y;
    font(9, true, blue);
    doc.text(label, x, cursor);
    cursor += 22;
    font(13, true);
    for (const line of lines(name, columnWidth)) {
      doc.text(line, x, cursor);
      cursor += 17;
    }
    if (details) {
      cursor += 5;
      font(10, false, muted);
      for (const line of lines(details, columnWidth)) {
        doc.text(line, x, cursor);
        cursor += 14;
      }
    }
    return cursor;
  };
  const issuerBottom = party(margin, "DITERBITKAN OLEH", data.issuer, data.issuerDetails);
  const customerBottom = party(margin + columnWidth + 32, "DITAGIHKAN KEPADA", data.customer, data.customerDetails);
  y = Math.max(issuerBottom, customerBottom) + 22;
  ensure(60);
  rule(y);
  y += 22;
  font(10, false, muted);
  doc.text(`Tanggal: ${formatInvoiceDate(data.issuedAt)}`, margin, y);
  doc.text(`Jatuh tempo: ${data.dueAt ? formatInvoiceDate(data.dueAt) : "Tidak ditentukan"}`, right, y, { align: "right" });
  y += 30;

  ensure(174);
  const edges = [margin, margin + 170, margin + 239, margin + 373, right];
  doc.setFillColor("#EFF4FB");
  doc.rect(margin, y, contentWidth, 32, "F");
  font(9, true, muted);
  doc.text("LAYANAN TES", margin + 12, y + 20);
  doc.text("SISWA", edges[2] - 12, y + 20, { align: "right" });
  doc.text("HARGA / SISWA", edges[3] - 12, y + 20, { align: "right" });
  doc.text("JUMLAH", right - 12, y + 20, { align: "right" });
  y += 56;
  font(11, true);
  const testLines = lines(INVOICE_TESTS[data.test], 146);
  doc.text(testLines, margin + 12, y, { lineHeightFactor: 1.4 });
  font(10);
  doc.text(new Intl.NumberFormat("id-ID").format(data.quantity), edges[2] - 12, y, { align: "right" });
  doc.text(formatRupiah(data.unitPrice), edges[3] - 12, y, { align: "right" });
  font(10, true);
  doc.text(formatRupiah(data.total), right - 12, y, { align: "right" });
  y += Math.max(30, testLines.length * 16 + 12);
  rule(y);
  y += 18;
  ensure(92);
  doc.setFillColor(blue);
  doc.roundedRect(right - 280, y, 280, 76, 6, 6, "F");
  font(10, true, "#FFFFFF");
  doc.text("TOTAL TAGIHAN", right - 262, y + 24);
  font(22, true, "#FFFFFF");
  doc.text(formatRupiah(data.total), right - 18, y + 55, { align: "right" });
  y += 106;

  block("INFORMASI PEMBAYARAN", data.paymentDetails);
  block("CATATAN", data.notes);
  ensure(48);
  font(10, false, muted);
  for (const line of lines("Cantumkan nomor invoice saat melakukan pembayaran. Invoice ini merupakan tagihan, bukan bukti pembayaran atau faktur pajak.", contentWidth)) {
    doc.text(line, margin, y);
    y += 14;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    rule(height - 52);
    font(9, false, muted);
    doc.text("Dokumen invoice elektronik", margin, height - 32);
    doc.text(`Halaman ${page} / ${pages}`, right, height - 32, { align: "right" });
  }
  return doc;
}
