"use client";

import { useState, type FormEvent } from "react";
import {
  INVOICE_TESTS, emptyInvoiceForm, formatInvoiceDate, formatRupiah,
  invoiceFilename, invoiceNumber, invoiceTotal, validateInvoice,
  type Invoice, type InvoiceErrors, type InvoiceForm,
} from "@/lib/invoice";
import styles from "./AdminInvoice.module.css";

export default function AdminInvoice() {
  const [form, setForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [errors, setErrors] = useState<InvoiceErrors>({});
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function change(name: keyof InvoiceForm, value: string) {
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
    setDirty(true);
    setMessage("");
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateInvoice(form);
    if (!result.ok) {
      setErrors(result.errors);
      setMessage("Periksa kolom yang ditandai sebelum membuat invoice.");
      const field = event.currentTarget.elements.namedItem(Object.keys(result.errors)[0]);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    try {
      const next = { ...result.value, number: result.value.number || invoiceNumber(result.value.issuedAt) };
      setForm((previous) => ({ ...previous, number: next.number, issuedAt: next.issuedAt }));
      setInvoice(next);
      setErrors({});
      setDirty(false);
      setMessage("");
    } catch {
      setMessage("Nomor otomatis tidak dapat dibuat. Isi nomor invoice secara manual, lalu coba lagi.");
    }
  }

  async function download() {
    if (!invoice || dirty || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { buildInvoicePDF } = await import("@/lib/invoice-pdf");
      await buildInvoicePDF(invoice).save(invoiceFilename(invoice.number), { returnPromise: true });
    } catch {
      setMessage("PDF gagal dibuat. Data isian tetap tersedia; silakan coba unduh kembali.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (!window.confirm("Buat invoice baru? Isian saat ini akan dikosongkan. Pastikan PDF sudah diunduh.")) return;
    setForm(emptyInvoiceForm());
    setInvoice(null);
    setErrors({});
    setDirty(false);
    setMessage("");
  }

  function field(name: keyof InvoiceForm, label: string, options: {
    required?: boolean; multiline?: boolean; maxLength?: number;
    type?: "text" | "number" | "date"; placeholder?: string; hint?: string;
  } = {}) {
    const common = {
      id: `invoice-${name}`, name, value: form[name],
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `invoice-${name}-error` : options.hint ? `invoice-${name}-hint` : undefined,
      required: options.required, maxLength: options.maxLength,
      placeholder: options.placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(name, event.target.value),
    };
    return (
      <div className={styles.field}>
        <label htmlFor={common.id}>{label}{options.required ? " *" : ""}</label>
        {options.multiline ? <textarea {...common} rows={3} /> : (
          <input {...common} type={options.type || "text"}
            min={options.type === "number" ? 1 : options.type === "date" ? "2000-01-01" : undefined}
            max={name === "quantity" ? 1000000 : name === "unitPrice" ? 999999999999 : options.type === "date" ? "9999-12-31" : undefined}
            step={options.type === "number" ? 1 : undefined}
            inputMode={options.type === "number" ? "numeric" : undefined} />
        )}
        {options.hint && <small id={`invoice-${name}-hint`}>{options.hint}</small>}
        {errors[name] && <small className={styles.error} id={`invoice-${name}-error`}>{errors[name]}</small>}
      </div>
    );
  }

  return (
    <section className={styles.root} aria-labelledby="invoice-heading">
      <div className={styles.intro}>
        <div>
          <h2 id="invoice-heading">Invoice pembayaran tes</h2>
          <p>Pilih layanan, isi jumlah siswa dan harga, lalu unduh tagihan PDF.</p>
        </div>
        <span className={styles.badge}>PDF A4</span>
      </div>
      <p className={styles.notice}>Invoice dibuat di browser dan tidak disimpan ke database. Unduh PDF sebelum berpindah tab atau menutup halaman. Pembuatan invoice tidak mengubah token, hasil tes, atau status pembayaran.</p>

      <form onSubmit={preview} noValidate>
        <fieldset disabled={busy} className={styles.formBody}>
          <legend className={styles.srOnly}>Data invoice</legend>
          <div className={styles.card}>
            <h3>01 / Identitas invoice</h3>
            <div className={styles.grid}>
              {field("number", "Nomor invoice", { maxLength: 48, placeholder: "Otomatis saat pratinjau dibuat", hint: "Boleh diisi manual. Pastikan nomor belum pernah dipakai." })}
              {field("issuedAt", "Tanggal invoice", { type: "date", hint: "Kosongkan untuk tanggal hari ini (WIB)." })}
              {field("dueAt", "Jatuh tempo (opsional)", { type: "date" })}
            </div>
          </div>
          <div className={styles.card}>
            <h3>02 / Penagih & penerima</h3>
            <div className={styles.grid}>
              {field("issuer", "Nama penagih", { required: true, maxLength: 100 })}
              {field("customer", "Nama penerima / sekolah", { required: true, maxLength: 100, placeholder: "Nama sekolah atau pelanggan" })}
              {field("issuerDetails", "Alamat & kontak penagih (opsional)", { multiline: true, maxLength: 240 })}
              {field("customerDetails", "Alamat & kontak penerima (opsional)", { multiline: true, maxLength: 240 })}
            </div>
          </div>
          <div className={styles.card}>
            <h3>03 / Rincian pembayaran</h3>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label htmlFor="invoice-test">Jenis tes *</label>
                <select id="invoice-test" name="test" value={form.test} onChange={(event) => change("test", event.target.value)} aria-invalid={Boolean(errors.test)} aria-describedby={errors.test ? "invoice-test-error" : undefined}>
                  {Object.entries(INVOICE_TESTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {errors.test && <small className={styles.error} id="invoice-test-error">{errors.test}</small>}
              </div>
              {field("quantity", "Jumlah siswa", { required: true, type: "number", placeholder: "Contoh: 100" })}
              {field("unitPrice", "Harga per siswa (Rp)", { required: true, type: "number", placeholder: "Contoh: 75000", hint: "Rupiah bulat, tanpa titik atau koma pemisah." })}
              <div className={styles.calculation}>
                <span>Total otomatis</span>
                <strong aria-live="polite">{(() => {
                  const total = invoiceTotal(form.quantity, form.unitPrice);
                  return total === null ? "Isi jumlah & harga valid" : formatRupiah(total);
                })()}</strong>
                <small>Jumlah siswa × harga per siswa</small>
              </div>
              {field("paymentDetails", "Informasi pembayaran (opsional)", { multiline: true, maxLength: 300, placeholder: "Bank, nomor rekening, nama pemilik rekening", hint: "Isi rekening yang benar. Tidak ada rekening bawaan." })}
              {field("notes", "Catatan (opsional)", { multiline: true, maxLength: 400, placeholder: "Ketentuan pembayaran atau keterangan layanan" })}
            </div>
          </div>
          {message && <p role="alert" className={styles.errorBox}>{message}</p>}
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>{invoice ? "Perbarui pratinjau" : "Buat pratinjau invoice"}</button>
            <button type="button" onClick={reset} className={styles.secondary}>Invoice baru</button>
          </div>
        </fieldset>
      </form>

      {invoice && (
        <div className={styles.preview}>
          <div className={styles.previewBar}>
            <div><h3>Pratinjau invoice</h3><p>{dirty ? "Isian berubah. Perbarui pratinjau sebelum mengunduh." : "Periksa rincian di bawah sebelum mengunduh PDF."}</p></div>
            <button type="button" onClick={download} disabled={dirty || busy} className={styles.primary}>{busy ? "Menyiapkan PDF..." : "Unduh PDF"}</button>
          </div>
          <article className={styles.paper} aria-label={`Pratinjau ${invoice.number}`}>
            <div className={styles.paperHeader}><h3>INVOICE</h3><div><small>TAGIHAN PEMBAYARAN TES</small><strong>{invoice.number}</strong></div></div>
            <div className={styles.parties}>
              <div><small>DITERBITKAN OLEH</small><h4>{invoice.issuer}</h4><p>{invoice.issuerDetails}</p></div>
              <div><small>DITAGIHKAN KEPADA</small><h4>{invoice.customer}</h4><p>{invoice.customerDetails}</p></div>
            </div>
            <div className={styles.dates}><span>Tanggal: {formatInvoiceDate(invoice.issuedAt)}</span><span>Jatuh tempo: {invoice.dueAt ? formatInvoiceDate(invoice.dueAt) : "Tidak ditentukan"}</span></div>
            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Rincian biaya invoice">
              <table><thead><tr><th>Layanan tes</th><th>Siswa</th><th>Harga / siswa</th><th>Jumlah</th></tr></thead><tbody><tr><td>{INVOICE_TESTS[invoice.test]}</td><td>{invoice.quantity.toLocaleString("id-ID")}</td><td>{formatRupiah(invoice.unitPrice)}</td><td>{formatRupiah(invoice.total)}</td></tr></tbody></table>
            </div>
            <div className={styles.total}><span>TOTAL TAGIHAN</span><strong>{formatRupiah(invoice.total)}</strong></div>
            {invoice.paymentDetails && <div className={styles.note}><h4>Informasi pembayaran</h4><p>{invoice.paymentDetails}</p></div>}
            {invoice.notes && <div className={styles.note}><h4>Catatan</h4><p>{invoice.notes}</p></div>}
            <footer>Cantumkan nomor invoice saat melakukan pembayaran. Invoice ini merupakan tagihan, bukan bukti pembayaran atau faktur pajak.</footer>
          </article>
        </div>
      )}
    </section>
  );
}
