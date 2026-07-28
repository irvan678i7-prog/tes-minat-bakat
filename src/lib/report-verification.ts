// ─────────────────────────────────────────────────────────────────────────────
// VALIDASI KEASLIAN LAPORAN
//
// Setiap laporan (Tes Minat, Tes Bakat, Tes IQ/CFIT) mendapat KODE LAPORAN
// yang bisa:
//   1. dipindai lewat QR code di laporan PDF, atau
//   2. diketik manual di halaman /verifikasi
//
// Kode bersifat DETERMINISTIK (diturunkan dari id submission), jadi tidak
// perlu kolom baru di database dan laporan lama tetap bisa diverifikasi.
//
// Format kode:  UMM-<JENIS>-<8 KARAKTER ID>-<4 KARAKTER TANDA TANGAN>
//   contoh   :  UMM-BKT-9F2A7C31-K4TQ
//
// Tanda tangan = HMAC-SHA256(secret, "<JENIS>:<ID>") sehingga kode tidak bisa
// dikarang sendiri tanpa mengetahui secret server.
//
// CATATAN: modul ini memakai `node:crypto` → hanya boleh di-import dari kode
// server (route handler, server component, pembuat PDF). Jangan di-import dari
// komponen client.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import QRCode from "qrcode";
import type jsPDF from "jspdf";

// ── Identitas penyelenggara ──────────────────────────────────────────────────
export const LEMBAGA_PRODI =
	"Program Studi Magister Bimbingan dan Konseling";
export const LEMBAGA_UNIT =
	"Program Pascasarjana Universitas Muhammadiyah Metro";
export const LEMBAGA_FULL = `${LEMBAGA_PRODI}, ${LEMBAGA_UNIT}`;
export const LEMBAGA_SINGKAT = "Magister BK \u2014 Pascasarjana UM Metro";

// ── Jenis laporan ────────────────────────────────────────────────────────────
export type ReportKind = "BAKAT" | "MINAT" | "IQ";

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
	BAKAT: "Tes Bakat",
	MINAT: "Tes Minat",
	IQ: "Tes IQ (CFIT Skala 3)",
};

const KIND_PREFIX: Record<ReportKind, string> = {
	BAKAT: "BKT",
	MINAT: "MNT",
	IQ: "IQ",
};

// Alfabet tanda tangan tanpa huruf ambigu (I dan O) supaya kode mudah diketik.
const SIG_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SIG_LENGTH = 4;
const ID_LENGTH = 8;
const CODE_ROOT = "UMM";

function signingSecret(): string {
	return (
		process.env.REPORT_SIGNING_SECRET ||
		process.env.JWT_SECRET ||
		"dev-only-report-signing-secret-change-me"
	);
}

function signature(kind: ReportKind, idPart: string): string {
	const digest = crypto
		.createHmac("sha256", signingSecret())
		.update(`${kind}:${idPart}`)
		.digest();
	let out = "";
	for (let i = 0; i < SIG_LENGTH; i++) {
		out += SIG_ALPHABET[digest[i] % SIG_ALPHABET.length];
	}
	return out;
}

/** Kode laporan resmi untuk sebuah submission. */
export function buildReportCode(kind: ReportKind, submissionId: string): string {
	const idPart = String(submissionId).slice(0, ID_LENGTH).toUpperCase();
	return `${CODE_ROOT}-${KIND_PREFIX[kind]}-${idPart}-${signature(kind, idPart)}`;
}

export type ParsedReportCode = {
	code: string; // bentuk kanonik (dengan tanda hubung)
	kind: ReportKind;
	idPrefix: string; // 8 karakter pertama id submission (huruf besar)
	idPrefixDb: string; // versi huruf kecil untuk query Prisma
};

/**
 * Membaca kode yang diketik pengguna. Toleran terhadap spasi, tanda hubung,
 * dan huruf kecil. Mengembalikan null bila format/tanda tangan tidak sah.
 */
export function parseReportCode(input: string): ParsedReportCode | null {
	const cleaned = String(input ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");
	if (!cleaned.startsWith(CODE_ROOT)) return null;

	const rest = cleaned.slice(CODE_ROOT.length);
	const entry = (Object.entries(KIND_PREFIX) as Array<[ReportKind, string]>).find(
		([, prefix]) => rest.startsWith(prefix),
	);
	if (!entry) return null;

	const [kind, prefix] = entry;
	const body = rest.slice(prefix.length);
	if (body.length !== ID_LENGTH + SIG_LENGTH) return null;

	const idPrefix = body.slice(0, ID_LENGTH);
	const sig = body.slice(ID_LENGTH);
	// Perbandingan tanda tangan waktu-tetap.
	const expected = signature(kind, idPrefix);
	const ok =
		sig.length === expected.length &&
		crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
	if (!ok) return null;

	return {
		code: `${CODE_ROOT}-${prefix}-${idPrefix}-${sig}`,
		kind,
		idPrefix,
		idPrefixDb: idPrefix.toLowerCase(),
	};
}

// ── URL verifikasi ───────────────────────────────────────────────────────────

/**
 * Base URL publik aplikasi (tanpa garis miring di akhir). Boleh kosong — kalau
 * kosong, QR akan berisi kode laporannya saja.
 *
 * Set salah satu di environment: REPORT_VERIFY_BASE_URL, NEXT_PUBLIC_APP_URL,
 * atau NEXT_PUBLIC_SITE_URL. Di Vercel, VERCEL_PROJECT_PRODUCTION_URL dipakai
 * sebagai cadangan otomatis.
 */
export function reportBaseUrl(): string {
	const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
	const raw =
		process.env.REPORT_VERIFY_BASE_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		process.env.NEXT_PUBLIC_SITE_URL ||
		(vercelHost ? `https://${vercelHost}` : "");
	return raw.replace(/\/+$/, "");
}

export const VERIFY_PATH = "/verifikasi";

/** Alamat halaman verifikasi untuk sebuah kode. */
export function verificationUrl(code: string): string {
	const path = `${VERIFY_PATH}?kode=${encodeURIComponent(code)}`;
	const base = reportBaseUrl();
	return base ? `${base}${path}` : path;
}

/** Teks yang ditanam di QR: URL bila base URL diketahui, jika tidak kodenya. */
export function qrPayload(code: string): string {
	const base = reportBaseUrl();
	return base ? verificationUrl(code) : code;
}

/** Teks pendek untuk footer laporan. */
export function verificationFooterText(code: string): string {
	const base = reportBaseUrl();
	const where = base ? `${base}${VERIFY_PATH}` : `halaman ${VERIFY_PATH}`;
	return `Pindai QR atau masukkan kode ${code} di ${where} untuk memverifikasi keaslian laporan.`;
}

// ── Penggambar QR di jsPDF ───────────────────────────────────────────────────

/**
 * Menggambar QR code sebagai kotak-kotak vektor (tanpa gambar raster) sehingga
 * tetap tajam saat dicetak dan prosesnya sinkron.
 *
 * @param size sisi luar QR dalam satuan pt, sudah termasuk quiet zone.
 */
export function drawQrCode(
	doc: jsPDF,
	text: string,
	x: number,
	y: number,
	size: number,
	opts?: { dark?: [number, number, number]; light?: [number, number, number] | null },
): void {
	const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
	const count = qr.modules.size;
	const data = qr.modules.data;

	const quiet = 2; // modul kosong di tiap sisi
	const cell = size / (count + quiet * 2);
	const originX = x + quiet * cell;
	const originY = y + quiet * cell;

	const light =
		opts?.light === undefined
			? ([255, 255, 255] as [number, number, number])
			: opts.light;
	if (light) {
		doc.setFillColor(light[0], light[1], light[2]);
		doc.rect(x, y, size, size, "F");
	}

	const dark = opts?.dark ?? ([0, 0, 0] as [number, number, number]);
	doc.setFillColor(dark[0], dark[1], dark[2]);
	for (let row = 0; row < count; row++) {
		for (let col = 0; col < count; col++) {
			if (!data[row * count + col]) continue;
			// +0.02 menutup celah antar kotak saat dirender printer.
			doc.rect(
				originX + col * cell,
				originY + row * cell,
				cell + 0.02,
				cell + 0.02,
				"F",
			);
		}
	}
}
