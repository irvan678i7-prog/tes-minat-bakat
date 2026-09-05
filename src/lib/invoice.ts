// Invoice-only data and validation. Does not read or mutate test/student data.
export const INVOICE_TESTS = {
  BAKAT: "Tes Bakat",
  MINAT: "Tes Minat",
  BAKAT_MINAT: "Tes Bakat & Minat",
  IQ: "Tes IQ (CFIT)",
} as const;

export type InvoiceTest = keyof typeof INVOICE_TESTS;
export type InvoiceForm = {
  number: string;
  issuedAt: string;
  dueAt: string;
  issuer: string;
  issuerDetails: string;
  customer: string;
  customerDetails: string;
  test: string;
  quantity: string;
  unitPrice: string;
  paymentDetails: string;
  notes: string;
};
export type Invoice = Omit<InvoiceForm, "test" | "quantity" | "unitPrice"> & {
  test: InvoiceTest;
  quantity: number;
  unitPrice: number;
  total: number;
};
export type InvoiceErrors = Partial<Record<keyof InvoiceForm, string>>;
export const MAX_INVOICE_TOTAL = 999_999_999_999;

export function emptyInvoiceForm(): InvoiceForm {
  return {
    number: "", issuedAt: "", dueAt: "", issuer: "EKIU", issuerDetails: "",
    customer: "", customerDetails: "", test: "BAKAT_MINAT", quantity: "",
    unitPrice: "", paymentDetails: "", notes: "",
  };
}

const FORM_FIELDS = Object.keys(emptyInvoiceForm()) as Array<keyof InvoiceForm>;

export function jakartaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function invoiceNumber(date: string): string {
  // Random suffix avoids a shared counter or database migration. Admin can edit it.
  return `INV-${date.replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function invoiceTotal(quantity: string, unitPrice: string): number | null {
  if (!/^\d+$/.test(quantity) || !/^\d+$/.test(unitPrice)) return null;
  const count = Number(quantity);
  const price = Number(unitPrice);
  const total = count * price;
  return Number.isSafeInteger(count) && count >= 1 && count <= 1_000_000 &&
    Number.isSafeInteger(price) && price >= 1 && Number.isSafeInteger(total) &&
    total <= MAX_INVOICE_TOTAL ? total : null;
}

export function formatRupiah(value: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatInvoiceDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "9999-12-31") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateInvoice(form: InvoiceForm, today = jakartaDate()):
  { ok: true; value: Invoice } |
  { ok: false; errors: InvoiceErrors } {
  const errors: InvoiceErrors = {};
  // Only the known text fields are normalised. A built invoice also carries
  // numbers (quantity, unitPrice, total), so extra or non-string values are
  // ignored instead of trimmed: the PDF export revalidates its input and must
  // never crash on a numeric value.
  const clean = {} as InvoiceForm;
  for (const key of FORM_FIELDS) {
    const value = form[key];
    clean[key] = typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
  }
  const limits: Partial<Record<keyof InvoiceForm, number>> = {
    number: 48, issuer: 100, issuerDetails: 240, customer: 100,
    customerDetails: 240, paymentDetails: 300, notes: 400,
  };
  for (const [key, limit] of Object.entries(limits)) {
    const field = key as keyof InvoiceForm;
    if (clean[field].length > limit) errors[field] = `Maksimal ${limit} karakter.`;
    // Built-in PDF font supports Latin-1. Reject unsupported glyphs rather than
    // silently producing unreadable names, symbols or emoji in financial PDFs.
    if (/[^\x20-\x7E\u00A0-\u00FF\n]/.test(clean[field])) {
      errors[field] = "Gunakan huruf Latin, angka, dan tanda baca standar (tanpa emoji).";
    }
    if (clean[field].split("\n").length > 5) errors[field] = "Maksimal 5 baris.";
  }
  if (!clean.issuer) errors.issuer = "Nama penagih wajib diisi.";
  if (!clean.customer) errors.customer = "Nama penerima/sekolah wajib diisi.";
  if (clean.number && !/^[A-Za-z0-9/._-]+$/.test(clean.number)) {
    errors.number = "Gunakan huruf, angka, garis miring, titik, - atau _.";
  }
  if (!Object.hasOwn(INVOICE_TESTS, clean.test)) errors.test = "Pilih jenis tes yang tersedia.";
  const quantity = Number(clean.quantity);
  const unitPrice = Number(clean.unitPrice);
  if (!/^\d+$/.test(clean.quantity) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    errors.quantity = "Jumlah siswa harus bilangan bulat 1 sampai 1.000.000.";
  }
  if (!/^\d+$/.test(clean.unitPrice) || !Number.isSafeInteger(unitPrice) || unitPrice < 1 || unitPrice > MAX_INVOICE_TOTAL) {
    errors.unitPrice = "Harga harus rupiah bulat positif, tanpa titik/koma pemisah.";
  }
  const total = quantity * unitPrice;
  if (!errors.quantity && !errors.unitPrice && (!Number.isSafeInteger(total) || total > MAX_INVOICE_TOTAL)) {
    errors.unitPrice = `Total invoice maksimal ${formatRupiah(MAX_INVOICE_TOTAL)}.`;
  }
  const issuedAt = clean.issuedAt || today;
  if (!isDate(issuedAt)) errors.issuedAt = "Tanggal invoice tidak valid (minimal tahun 2000).";
  if (clean.dueAt && (!isDate(clean.dueAt) || clean.dueAt < issuedAt)) {
    errors.dueAt = "Jatuh tempo harus valid dan tidak sebelum tanggal invoice.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...clean, issuedAt, test: clean.test as InvoiceTest, quantity, unitPrice, total } };
}

export function invoiceFormOf(invoice: Invoice): InvoiceForm {
  // Explicit mapping keeps numbers out of the text fields when the PDF export
  // revalidates an invoice that was already built.
  return {
    number: invoice.number,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    issuer: invoice.issuer,
    issuerDetails: invoice.issuerDetails,
    customer: invoice.customer,
    customerDetails: invoice.customerDetails,
    test: invoice.test,
    quantity: String(invoice.quantity),
    unitPrice: String(invoice.unitPrice),
    paymentDetails: invoice.paymentDetails,
    notes: invoice.notes,
  };
}

export function invoiceFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "").slice(0, 64) || "invoice"}.pdf`;
}
