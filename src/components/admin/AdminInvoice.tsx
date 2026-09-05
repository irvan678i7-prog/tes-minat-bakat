"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useBrutConfirm } from "@/components/BrutConfirm";
import {
  INVOICE_TESTS,
  emptyInvoiceForm,
  formatCount,
  formatInvoiceDate,
  formatRupiah,
  invoiceFilename,
  invoiceNumber,
  invoiceTotal,
  jakartaDate,
  validateInvoice,
  type Invoice,
  type InvoiceErrors,
  type InvoiceForm,
} from "@/lib/invoice";
import styles from "./AdminInvoice.module.css";

type FieldOptions = {
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  type?: "text" | "number" | "date";
  placeholder?: string;
  hint?: string;
};

const ERROR_COLOR = "#b3261e";
const INVALID_STYLE = { borderColor: "#ff4d8d", background: "#ffe4e6" };

export default function AdminInvoice() {
  const { confirm, ConfirmModal } = useBrutConfirm();
  const [form, setForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [errors, setErrors] = useState<InvoiceErrors>({});
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Nomor acak dan tanggal WIB dibuat di browser supaya hasil render server
    // dan klien tidak berbeda.
    setForm((current) => {
      if (current.number || current.issuedAt) return current;
      const today = jakartaDate();
      return { ...current, number: invoiceNumber(today), issuedAt: today };
    });
  }, []);

  const quantityText = form.quantity.trim();
  const priceText = form.unitPrice.trim();
  const liveQuantity = /^\d+$/.test(quantityText) ? Number(quantityText) : null;
  const livePrice = /^\d+$/.test(priceText) ? Number(priceText) : null;
  const liveTotal = invoiceTotal(quantityText, priceText);

  function change(name: keyof InvoiceForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
    setDirty(true);
    setMessage("");
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = event.currentTarget.elements;
    // Nomor selalu tercetak di PDF, jadi isi ulang otomatis bila dikosongkan.
    const data = form.number.trim() ? form : { ...form, number: invoiceNumber(jakartaDate()) };
    if (data !== form) setForm(data);
    const result = validateInvoice(data);
    if (!result.ok) {
      setErrors(result.errors);
      setMessage("Periksa kembali isian yang ditandai. Pratinjau belum diperbarui.");
      const first = Object.keys(result.errors)[0];
      const target = first ? fields.namedItem(first) : null;
      if (target instanceof HTMLElement) target.focus();
      return;
    }
    setErrors({});
    setInvoice(result.value);
    setDirty(false);
    setMessage("");
  }

  async function download() {
    if (!invoice || dirty || busy) return;
    setBusy(true);
    setMessage("");
    try {
      // Dimuat saat dibutuhkan agar pustaka PDF tidak menambah beban halaman panel.
      const { buildInvoicePDF } = await import("@/lib/invoice-pdf");
      buildInvoicePDF(invoice).save(invoiceFilename(invoice.number));
    } catch {
      setMessage("Gagal membuat PDF. Muat ulang halaman, lalu buat pratinjau invoice lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const ok = await confirm({
      title: "Invoice baru",
      message:
        "Kosongkan semua isian dan mulai invoice baru? Pastikan PDF invoice saat ini sudah diunduh karena data invoice tidak disimpan.",
      confirmLabel: "KOSONGKAN",
      cancelLabel: "Batal",
      tone: "warning",
    });
    if (!ok) return;
    const today = jakartaDate();
    setForm({ ...emptyInvoiceForm(), number: invoiceNumber(today), issuedAt: today });
    setErrors({});
    setInvoice(null);
    setDirty(false);
    setMessage("");
  }

  function field(name: keyof InvoiceForm, label: string, options: FieldOptions = {}) {
    const invalid = Boolean(errors[name]);
    const id = `invoice-${name}`;
    const shared = {
      id,
      name,
      value: form[name],
      required: options.required,
      maxLength: options.maxLength,
      placeholder: options.placeholder,
      className: "brut-input w-full text-sm",
      style: invalid ? INVALID_STYLE : undefined,
      "aria-invalid": invalid,
      "aria-describedby": invalid ? `${id}-error` : options.hint ? `${id}-hint` : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        change(name, event.target.value),
    };
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="mb-1 block text-xs font-black uppercase">
          {label}
          {options.required ? " *" : ""}
        </label>
        {options.multiline ? (
          <textarea {...shared} rows={3} />
        ) : (
          <input
            {...shared}
            type={options.type ?? "text"}
            inputMode={options.type === "number" ? "numeric" : undefined}
            step={options.type === "number" ? 1 : undefined}
            min={options.type === "number" ? 1 : options.type === "date" ? "2000-01-01" : undefined}
            max={
              name === "quantity"
                ? 1000000
                : name === "unitPrice"
                  ? 999999999999
                  : options.type === "date"
                    ? "9999-12-31"
                    : undefined
            }
          />
        )}
        {options.hint ? (
          <p id={`${id}-hint`} className="mt-1 text-xs font-bold opacity-70">
            {options.hint}
          </p>
        ) : null}
        {invalid ? (
          <p id={`${id}-error`} className="mt-1 text-xs font-black" style={{ color: ERROR_COLOR }}>
            {errors[name]}
          </p>
        ) : null}
      </div>
    );
  }

  function sectionHead(step: string, title: string, subtitle: string) {
    return (
      <div className="flex items-center gap-3 border-b-4 border-black pb-3">
        <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-black uppercase leading-tight">{title}</h3>
          <p className="text-xs font-bold opacity-70">{subtitle}</p>
        </div>
      </div>
    );
  }

  const testInvalid = Boolean(errors.test);

  return (
    <div className="space-y-6">
      {ConfirmModal}

      <div className="brut-card" style={{ background: "#facc15" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-black uppercase leading-tight">Invoice Pembayaran Tes</h2>
            <p className="mt-1 text-xs font-bold opacity-80">
              Pilih layanan tes, isi jumlah siswa dan harga per siswa, lalu unduh tagihan PDF siap kirim.
            </p>
          </div>
          <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
            PDF A4
          </span>
        </div>
      </div>

      <div className="brut-card" style={{ background: "#fef9c3" }}>
        <p className="text-sm font-semibold">
          Invoice dibuat di browser dan tidak disimpan ke database. Unduh PDF sebelum berpindah tab
          atau menutup halaman. Membuat invoice tidak mengubah token, hasil tes, maupun status
          pembayaran siswa.
        </p>
      </div>

      {message ? (
        <div className="brut-card" role="alert" style={{ background: "#ffe4e6", borderColor: "#ff4d8d" }}>
          <p className="text-sm font-black">{message}</p>
        </div>
      ) : null}

      <form onSubmit={preview} noValidate>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <legend className="sr-only">Data invoice</legend>

          <section className="brut-card space-y-4">
            {sectionHead("01", "Identitas invoice", "Nomor dan tanggal yang tercetak pada kop invoice.")}
            <div className="grid gap-4 md:grid-cols-3">
              {field("number", "Nomor invoice", {
                required: true,
                maxLength: 48,
                placeholder: "INV-20260101-XXXXXXXXXXXX",
                hint: "Dibuat otomatis, boleh diubah.",
              })}
              {field("issuedAt", "Tanggal invoice", { required: true, type: "date" })}
              {field("dueAt", "Jatuh tempo", { type: "date", hint: "Kosongkan bila tanpa batas waktu." })}
            </div>
          </section>

          <section className="brut-card space-y-4">
            {sectionHead("02", "Penagih & penerima", "Identitas pengirim tagihan dan pihak yang ditagih.")}
            <div className="grid gap-4 md:grid-cols-2">
              {field("issuer", "Nama penagih", { required: true, maxLength: 100 })}
              {field("customer", "Ditagihkan kepada", {
                required: true,
                maxLength: 100,
                placeholder: "Nama sekolah / instansi",
              })}
              {field("issuerDetails", "Detail penagih", {
                multiline: true,
                maxLength: 240,
                placeholder: "Alamat, telepon, email",
                hint: "Maksimal 5 baris.",
              })}
              {field("customerDetails", "Detail penerima", {
                multiline: true,
                maxLength: 240,
                placeholder: "Alamat, narahubung, telepon",
                hint: "Maksimal 5 baris.",
              })}
            </div>
          </section>

          <section className="brut-card space-y-4">
            {sectionHead("03", "Rincian tagihan", "Jenis tes, jumlah siswa, dan harga per siswa.")}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="min-w-0">
                <label htmlFor="invoice-test" className="mb-1 block text-xs font-black uppercase">
                  Jenis tes *
                </label>
                <select
                  id="invoice-test"
                  name="test"
                  value={form.test}
                  className="brut-input w-full text-sm"
                  style={testInvalid ? INVALID_STYLE : undefined}
                  aria-invalid={testInvalid}
                  aria-describedby={testInvalid ? "invoice-test-error" : undefined}
                  onChange={(event) => change("test", event.target.value)}
                >
                  {Object.entries(INVOICE_TESTS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {testInvalid ? (
                  <p id="invoice-test-error" className="mt-1 text-xs font-black" style={{ color: ERROR_COLOR }}>
                    {errors.test}
                  </p>
                ) : null}
              </div>
              {field("quantity", "Jumlah siswa", {
                required: true,
                type: "number",
                placeholder: "100",
                hint: "1 sampai 1.000.000 siswa.",
              })}
              {field("unitPrice", "Harga per siswa (Rp)", {
                required: true,
                type: "number",
                placeholder: "75000",
                hint: "Angka bulat tanpa titik, contoh: 75000.",
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="border-4 border-black p-3" style={{ background: "#fef9c3" }}>
                <p className="text-xs font-black uppercase">Jumlah siswa</p>
                <p className="text-xl font-black leading-tight md:text-2xl">
                  {liveQuantity === null ? "\u2014" : formatCount(liveQuantity)}
                </p>
                <p className="text-xs font-bold opacity-70">siswa ditagih</p>
              </div>
              <div className="border-4 border-black p-3" style={{ background: "#fff" }}>
                <p className="text-xs font-black uppercase">Harga / siswa</p>
                <p className="text-xl font-black leading-tight md:text-2xl">
                  {livePrice === null ? "\u2014" : formatRupiah(livePrice)}
                </p>
                <p className="text-xs font-bold opacity-70">rupiah per siswa</p>
              </div>
              <div className="border-4 border-black p-3" style={{ background: "#000", color: "#fff" }}>
                <p className="text-xs font-black uppercase" style={{ color: "#facc15" }}>
                  Total tagihan
                </p>
                <p className="text-xl font-black leading-tight md:text-2xl" aria-live="polite">
                  {liveTotal === null ? "\u2014" : formatRupiah(liveTotal)}
                </p>
                <p className="text-xs font-bold" style={{ opacity: 0.8 }}>
                  jumlah siswa × harga
                </p>
              </div>
            </div>
          </section>

          <section className="brut-card space-y-4">
            {sectionHead("04", "Pembayaran & catatan", "Instruksi transfer dan keterangan tambahan pada invoice.")}
            <div className="grid gap-4 md:grid-cols-2">
              {field("paymentDetails", "Informasi pembayaran", {
                multiline: true,
                maxLength: 300,
                placeholder: "Transfer ke Bank ... a.n. ... No. rek ...",
                hint: "Opsional. Maksimal 5 baris.",
              })}
              {field("notes", "Catatan", {
                multiline: true,
                maxLength: 400,
                placeholder: "Jadwal pelaksanaan tes, termin pembayaran, dll.",
                hint: "Opsional. Maksimal 5 baris.",
              })}
            </div>
          </section>

          <div className="brut-card">
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="brut-btn brut-btn-cyan">
                BUAT PRATINJAU
              </button>
              <button type="button" className="brut-btn brut-btn-white" onClick={reset}>
                INVOICE BARU
              </button>
              <p className="text-xs font-bold opacity-70">
                Perbarui pratinjau setiap kali isian berubah agar PDF ikut berubah.
              </p>
            </div>
          </div>
        </fieldset>
      </form>

      {invoice ? (
        <section className="space-y-4" aria-label="Pratinjau invoice">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-2xl font-black uppercase leading-tight">Pratinjau invoice</h3>
              <p className="text-xs font-bold opacity-70">
                {dirty
                  ? "Isian sudah berubah. Buat pratinjau lagi sebelum mengunduh PDF."
                  : "Tampilan ini sama dengan PDF yang akan diunduh."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="brut-tag" style={{ background: dirty ? "#fb923c" : "#a3e635" }}>
                {dirty ? "PERBARUI DULU" : "SIAP UNDUH"}
              </span>
              <button
                type="button"
                className="brut-btn brut-btn-black"
                onClick={download}
                disabled={dirty || busy}
              >
                {busy ? "MENYIAPKAN PDF..." : "UNDUH PDF"}
              </button>
            </div>
          </div>

          <article className={styles.paper} aria-label={`Invoice ${invoice.number}`}>
            <header className={styles.head}>
              <div className="min-w-0">
                <h4>INVOICE</h4>
                <p>Tagihan pembayaran tes</p>
              </div>
              <div className={styles.headNumber}>
                <span>Nomor invoice</span>
                <strong>{invoice.number}</strong>
              </div>
            </header>
            <div className={styles.accent} />
            <div className={styles.parties}>
              <div>
                <span className={styles.chip}>Diterbitkan oleh</span>
                <h5>{invoice.issuer}</h5>
                {invoice.issuerDetails ? <p>{invoice.issuerDetails}</p> : null}
              </div>
              <div>
                <span className={styles.chip}>Ditagihkan kepada</span>
                <h5>{invoice.customer}</h5>
                {invoice.customerDetails ? <p>{invoice.customerDetails}</p> : null}
              </div>
            </div>
            <div className={styles.meta}>
              <div>
                <span>Tanggal invoice</span>
                <strong>{formatInvoiceDate(invoice.issuedAt)}</strong>
              </div>
              <div>
                <span>Jatuh tempo</span>
                <strong>{invoice.dueAt ? formatInvoiceDate(invoice.dueAt) : "Tidak ditentukan"}</strong>
              </div>
              <div>
                <span>Layanan tes</span>
                <strong>{INVOICE_TESTS[invoice.test]}</strong>
              </div>
            </div>
            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Rincian biaya invoice">
              <table className={styles.items}>
                <thead>
                  <tr>
                    <th scope="col">Deskripsi layanan</th>
                    <th scope="col">Siswa</th>
                    <th scope="col">Harga / siswa</th>
                    <th scope="col">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{INVOICE_TESTS[invoice.test]}</td>
                    <td>{formatCount(invoice.quantity)}</td>
                    <td>{formatRupiah(invoice.unitPrice)}</td>
                    <td>{formatRupiah(invoice.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={styles.summary}>
              <p>
                {formatCount(invoice.quantity)} siswa × {formatRupiah(invoice.unitPrice)}
              </p>
              <div className={styles.total}>
                <span>Total tagihan</span>
                <strong>{formatRupiah(invoice.total)}</strong>
              </div>
            </div>
            {invoice.paymentDetails ? (
              <section className={styles.block}>
                <span className={styles.chip}>Informasi pembayaran</span>
                <p>{invoice.paymentDetails}</p>
              </section>
            ) : null}
            {invoice.notes ? (
              <section className={styles.block}>
                <span className={styles.chip}>Catatan</span>
                <p>{invoice.notes}</p>
              </section>
            ) : null}
            <p className={styles.foot}>
              Cantumkan nomor invoice saat melakukan pembayaran. Invoice ini merupakan tagihan, bukan
              bukti pembayaran atau faktur pajak.
            </p>
          </article>
        </section>
      ) : null}
    </div>
  );
}
