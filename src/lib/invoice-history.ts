// Riwayat pemasukan invoice. Disimpan hanya di browser admin (localStorage),
// tidak menyentuh database, token, hasil tes, maupun status pembayaran siswa.
import { INVOICE_TESTS, type Invoice, type InvoiceTest } from "./invoice";

export type InvoiceHistoryEntry = {
  id: string;
  number: string;
  issuedAt: string;
  customer: string;
  test: InvoiceTest;
  quantity: number;
  unitPrice: number;
  total: number;
  savedAt: string;
};

export const INVOICE_HISTORY_KEY = "invoice.riwayat.v1";
export const MAX_INVOICE_HISTORY = 200;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isEntry(value: unknown): value is InvoiceHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" && item.id.length > 0 &&
    typeof item.number === "string" &&
    typeof item.issuedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.issuedAt) &&
    typeof item.customer === "string" &&
    typeof item.test === "string" && Object.hasOwn(INVOICE_TESTS, item.test) &&
    isCount(item.quantity) && isCount(item.unitPrice) && isCount(item.total) &&
    typeof item.savedAt === "string"
  );
}

export function loadInvoiceHistory(): InvoiceHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INVOICE_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Entri rusak diabaikan, bukan membuat panel gagal dimuat.
    return parsed.filter(isEntry).slice(0, MAX_INVOICE_HISTORY);
  } catch {
    return [];
  }
}

export function saveInvoiceHistory(entries: InvoiceHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INVOICE_HISTORY_KEY,
      JSON.stringify(entries.slice(0, MAX_INVOICE_HISTORY)),
    );
  } catch {
    // Penyimpanan browser penuh atau diblokir: riwayat tetap tampil di sesi ini.
  }
}

function entryId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function invoiceHistoryEntry(invoice: Invoice, savedAt = new Date()): InvoiceHistoryEntry {
  return {
    id: entryId(),
    number: invoice.number,
    issuedAt: invoice.issuedAt,
    customer: invoice.customer,
    test: invoice.test,
    quantity: invoice.quantity,
    unitPrice: invoice.unitPrice,
    total: invoice.total,
    savedAt: savedAt.toISOString(),
  };
}

// Nomor invoice yang sama hanya tercatat sekali supaya mengunduh PDF dua kali
// tidak menggandakan pemasukan.
export function addInvoiceHistory(
  entries: InvoiceHistoryEntry[],
  invoice: Invoice,
): InvoiceHistoryEntry[] {
  const entry = invoiceHistoryEntry(invoice);
  const kept = entries.filter((item) => item.number !== entry.number);
  return [entry, ...kept].slice(0, MAX_INVOICE_HISTORY);
}

export function removeInvoiceHistory(
  entries: InvoiceHistoryEntry[],
  id: string,
): InvoiceHistoryEntry[] {
  return entries.filter((item) => item.id !== id);
}

export function invoiceHistoryTotal(entries: InvoiceHistoryEntry[]): number {
  return entries.reduce((sum, item) => sum + item.total, 0);
}
