// Node >= 22.13: node --experimental-vm-modules --test tests/invoice.test.mjs
// No database, credentials, production requests or test records are used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";

const context = createContext({ Intl, Date, crypto });
const invoiceModule = new SourceTextModule(stripTypeScriptTypes(readFileSync(new URL("../src/lib/invoice.ts", import.meta.url), "utf8")), { context });
await invoiceModule.link(() => { throw new Error("Invoice data module must not import services."); });
await invoiceModule.evaluate();
const api = invoiceModule.namespace;
const valid = () => ({ ...api.emptyInvoiceForm(), number: "INV/2026/001", customer: "SMA Contoh", issuedAt: "2026-09-05", quantity: "100", unitPrice: "75000" });

for (const testKind of Object.keys(api.INVOICE_TESTS)) {
  test(`${testKind}: jumlah dan harga menghasilkan total yang benar`, () => {
    const result = api.validateInvoice({ ...valid(), test: testKind });
    assert.equal(result.ok, true);
    assert.equal(result.value.test, testKind);
    assert.equal(result.value.quantity, 100);
    assert.equal(result.value.unitPrice, 75000);
    assert.equal(result.value.total, 7500000);
    assert.equal(api.formatRupiah(result.value.total), "Rp 7.500.000");
  });
}

for (const [field, value] of [
  ["quantity", ""], ["quantity", "0"], ["quantity", "-2"], ["quantity", "1.5"], ["quantity", "1e3"], ["quantity", "1000001"],
  ["unitPrice", ""], ["unitPrice", "0"], ["unitPrice", "-1"], ["unitPrice", "75.000"], ["unitPrice", "75,000"],
  ["unitPrice", "Infinity"], ["unitPrice", "NaN"], ["unitPrice", "9007199254740992"],
  ["issuer", "  "], ["customer", ""], ["test", "UNKNOWN"], ["test", "__proto__"],
  ["issuedAt", "2026-02-30"], ["issuedAt", "2025-02-29"], ["issuedAt", "1999-12-31"],
  ["dueAt", "2026-09-04"], ["dueAt", "not-a-date"], ["number", "../file\nunsafe"],
  ["customer", "a".repeat(101)], ["notes", "a".repeat(401)], ["notes", "1\n2\n3\n4\n5\n6"], ["customer", "School \ud83d\ude80"],
]) {
  test(`Menolak ${field} tidak valid: ${JSON.stringify(value).slice(0, 45)}`, () => {
    const result = api.validateInvoice({ ...valid(), [field]: value });
    assert.equal(result.ok, false);
    assert.ok(result.errors[field]);
  });
}

test("Total melebihi batas ditolak, termasuk perkalian tidak aman", () => {
  assert.equal(api.validateInvoice({ ...valid(), quantity: "1000000", unitPrice: "999999999999" }).ok, false);
  assert.equal(api.invoiceTotal("1000000", "999999999999"), null);
  assert.equal(api.invoiceTotal("1.2", "100"), null);
  assert.equal(api.invoiceTotal("0", "100"), null);
  assert.equal(api.invoiceTotal("1", "999999999999"), 999999999999);
});

test("Nomor otomatis dan tanggal WIB, termasuk pergantian hari", () => {
  assert.equal(api.jakartaDate(new Date("2026-09-04T17:01:00Z")), "2026-09-05");
  const result = api.validateInvoice({ ...valid(), issuedAt: "", number: "" }, "2026-09-05");
  assert.equal(result.ok, true);
  assert.equal(result.value.issuedAt, "2026-09-05");
  const first = api.invoiceNumber(result.value.issuedAt);
  assert.match(first, /^INV-20260905-[A-F0-9]{12}$/);
  assert.notEqual(first, api.invoiceNumber(result.value.issuedAt));
  assert.match(api.formatInvoiceDate("2026-09-05"), /05 September 2026/);
});

test("Normalisasi spasi, Latin-1, tanggal kabisat dan jatuh tempo sama hari", () => {
  const result = api.validateInvoice({ ...valid(), customer: "  SMA Caf\u00e9  ", issuedAt: "2028-02-29", dueAt: "2028-02-29", notes: "Baris satu\r\nBaris dua" });
  assert.equal(result.ok, true);
  assert.equal(result.value.customer, "SMA Caf\u00e9");
  assert.equal(result.value.notes, "Baris satu\nBaris dua");
});

test("Nama berkas aman dan data input tidak dimutasi", () => {
  assert.equal(api.invoiceFilename("INV/2026/001"), "INV-2026-001.pdf");
  assert.equal(api.invoiceFilename("../../test"), "-..-test.pdf");
  const form = valid();
  const before = JSON.stringify(form);
  api.validateInvoice(form);
  assert.equal(JSON.stringify(form), before);
  assert.equal(api.emptyInvoiceForm().paymentDetails, "");
});

test("Invoice jadi bisa divalidasi ulang lewat invoiceFormOf tanpa galat", () => {
  const built = api.validateInvoice(valid()).value;
  const form = api.invoiceFormOf(built);
  assert.equal(form.quantity, "100");
  assert.equal(form.unitPrice, "75000");
  assert.equal(form.total, undefined);
  const again = api.validateInvoice(form);
  assert.equal(again.ok, true);
  assert.equal(again.value.quantity, 100);
  assert.equal(again.value.total, 7500000);
  // Nilai numerik mentah harus ditolak dengan rapi, bukan melempar TypeError.
  let raw;
  assert.doesNotThrow(() => { raw = api.validateInvoice(built); });
  assert.equal(raw.ok, false);
  assert.equal(api.formatCount(1000000), "1.000.000");
  assert.equal(api.formatCount(100), "100");
});

test("Objek tidak lengkap ditolak tanpa melempar galat", () => {
  let result;
  assert.doesNotThrow(() => { result = api.validateInvoice({}); });
  assert.equal(result.ok, false);
  assert.ok(result.errors.issuer);
  assert.ok(result.errors.customer);
  assert.ok(result.errors.quantity);
  assert.ok(result.errors.unitPrice);
  assert.ok(result.errors.test);
});

let jsPDF;
try { jsPDF = (await import("jspdf")).jsPDF; } catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
const pdfSource = stripTypeScriptTypes(readFileSync(new URL("../src/lib/invoice-pdf.ts", import.meta.url), "utf8"));
async function pdfModule() {
  const module = new SourceTextModule(pdfSource, { context });
  await module.link((specifier) => {
    const exports = specifier === "jspdf" ? { default: jsPDF } : specifier === "./invoice" ? api : null;
    assert.ok(exports, `Unexpected dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

test("PDF asli: semua jenis tes, total dihitung ulang, data panjang dan penolakan input invalid", { skip: !jsPDF && "Jalankan npm ci agar jsPDF proyek tersedia." }, async () => {
  const { buildInvoicePDF } = await pdfModule();
  for (const kind of Object.keys(api.INVOICE_TESTS)) {
    const invoice = api.validateInvoice({ ...valid(), test: kind }).value;
    const doc = buildInvoicePDF({ ...invoice, total: 1 });
    const output = doc.output();
    assert.match(output, /^%PDF-/);
    assert.ok(output.includes("Rp 7.500.000"));
    assert.equal(doc.getNumberOfPages(), 1);
  }
  const max = api.validateInvoice({ ...valid(), quantity: "1000000", unitPrice: "999999" }).value;
  assert.ok(buildInvoicePDF(max).output().includes("Rp 999.999.000.000"));
  const long = api.validateInvoice({ ...valid(), issuer: "W".repeat(100), customer: "W".repeat(100), issuerDetails: "W".repeat(240), customerDetails: "W".repeat(240), paymentDetails: "W".repeat(300), notes: "W".repeat(400) }).value;
  assert.ok(buildInvoicePDF(long).getNumberOfPages() >= 2);
  assert.throws(() => buildInvoicePDF({ ...long, quantity: 0 }), /valid/);
});
