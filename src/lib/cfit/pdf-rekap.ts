// ─────────────────────────────────────────────────────────────
// Rekap hasil Tes IQ — CFIT Skala 3. A4 POTRET, MULTI-HALAMAN.
// TERPISAH sepenuhnya dari rekap minat-bakat (src/lib/pdf-rekap.ts).
// Palet dokumen: DOMINAN HIJAU (permintaan pembimbing).
//
// Susunan dokumen:
//   Hal. 1  Ringkasan eksekutif  — KPI, grafik sebaran klasifikasi, narasi
//   Hal. 2  Daftar peserta       — tabel lengkap + peringkat + warna klasifikasi
//   Hal. 3  Analisis kelompok    — distribusi, per kelas, per jenis kelamin, usia
//   Hal. 4  Sorotan & penutup    — capaian tertinggi, perlu perhatian, metodologi,
//                                  tanda tangan
// ─────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawReportLogo } from "../report-logo";

export type CfitRekapRow = {
	id: string;
	fullName: string | null;
	gender: string | null;
	age: number | null;
	grade: string | null;
	school: string | null;
	form: string;
	finishedAt: Date | null;
	rawScoreA: number | null;
	rawScoreB: number | null;
	rawScoreTotal: number | null;
	iq: number | null;
	classification: string | null;
};

// ─── Palet (dominan hijau) ───
const INK = "#14532D";
const SOFT_INK = "#4B6E5A";
const HAIRLINE = "#BBDFC8";
const STRIPE = "#F4FBF6";
const PANEL = "#E8F6ED";
const WHITE = "#FFFFFF";
const GREEN = "#22C55E";
const GREEN_SOFT = "#DCFCE7";
const GREEN_DEEP = "#15803D";
const MINT = "#86EFAC";
const AMBER = "#FDE68A";

// ─── Identitas penanda tangan (sama dengan laporan individu) ───
const KOP_KOTA = (process.env.REPORT_KOTA ?? "Metro").trim();
const KAPRODI_NAMA = (
	process.env.REPORT_KAPRODI_NAMA ?? "Dr. Eko Susanto, M.Pd., Kons."
).trim();
const KAPRODI_NIDN = (process.env.REPORT_KAPRODI_NIDN ?? "0213068302").trim();
const TESTER_NAMA = (
	process.env.REPORT_TESTER_NAMA ?? "Dr. Agus Wibowo, M.Pd."
).trim();
const TESTER_NA = (process.env.REPORT_TESTER_NA ?? "").trim();

// ─── SANITASI KARAKTER ───
// Font bawaan jsPDF (helvetica) memakai encoding WinAnsi. Karakter di luar
// himpunan itu (mis. "≥", blok penuh, centang) TIDAK punya glyph: hasil
// cetaknya jadi huruf acak DAN lebar teksnya salah dihitung, sehingga baris
// bisa meluber keluar kotak. Semua teks dilewatkan ke safeText() dulu.
const CHAR_FALLBACK: Array<[RegExp, string]> = [
	[/\u2265/g, ">="],
	[/\u2264/g, "<="],
	[/\u2260/g, "!="],
	[/\u00B1/g, "+/-"],
	[/\u00D7/g, "x"],
	[/[\u2588\u2589\u258A\u258B\u258C\u258D\u258E\u258F\u25A0\u25AA\u25AE]/g, "|"],
	[/[\u2713\u2714\u2717\u2718]/g, ""],
	[/[\u2192\u21D2\u2794]/g, "->"],
	[/[\u2190\u21D0]/g, "<-"],
	[/[\u2018\u2019\u201A\u2032]/g, "'"],
	[/[\u201C\u201D\u201E\u2033]/g, '"'],
	[/\u2026/g, "..."],
	[/[\u00A0\u2007\u202F]/g, " "],
	[/[\u2010\u2011\u2212]/g, "-"],
];

function safeText(s: string): string {
	let out = s;
	for (const [re, rep] of CHAR_FALLBACK) out = out.replace(re, rep);
	// Sisa karakter di luar Latin-1 diganti spasi agar tidak merusak layout.
	return out.replace(/[^\u0000-\u00FF\u2013\u2014\u2022]/g, " ");
}

/** doc.text() versi aman — selalu melewati safeText(). */
function txt(
	doc: jsPDF,
	s: string,
	x: number,
	y: number,
	opts?: { align: "left" | "center" | "right" },
) {
	if (opts) doc.text(safeText(s), x, y, opts);
	else doc.text(safeText(s), x, y);
}

/** Pembungkusan baris yang aman (sanitasi dulu, baru diukur). */
function wrapText(doc: jsPDF, s: string, width: number): string[] {
	return doc.splitTextToSize(safeText(s), width) as string[];
}

/** Sanitasi isi sel tabel. */
function cellText(v: string): string {
	return safeText(v);
}

const FORM_LABEL: Record<string, string> = {
	FORM_3A: "3A",
	FORM_3B: "3B",
	FORM_3AB: "3A+3B",
};

type Band = {
	range: string;
	short: string;
	label: string;
	min: number;
	max: number;
	color: string;
	/** true bila warna latarnya gelap → teks di atasnya harus putih. */
	onDark: boolean;
};

// Gradasi hijau untuk kategori atas → kuning/oranye/merah lembut untuk kategori
// bawah, tetap dengan nuansa dokumen yang dominan hijau.
const CFIT_BANDS: Band[] = [
	{ range: "170+", short: "JENIUS", label: "Jenius (Genius)", min: 170, max: 9999, color: "#14532D", onDark: true },
	{ range: "140-169", short: "SGT SUP", label: "Sangat Superior (Very Superior)", min: 140, max: 169, color: "#166534", onDark: true },
	{ range: "120-139", short: "SUPERIOR", label: "Superior", min: 120, max: 139, color: "#15803D", onDark: true },
	{ range: "110-119", short: "DI ATAS", label: "Di Atas Rata-rata (High Average)", min: 110, max: 119, color: "#22C55E", onDark: false },
	{ range: "90-109", short: "RATA2", label: "Rata-rata (Average)", min: 90, max: 109, color: "#86EFAC", onDark: false },
	{ range: "80-89", short: "DI BAWAH", label: "Di Bawah Rata-rata (Low Average)", min: 80, max: 89, color: "#FDE68A", onDark: false },
	{ range: "70-79", short: "BORDER", label: "Borderline", min: 70, max: 79, color: "#FDBA74", onDark: false },
	{ range: "< 70", short: "TERHAMBAT", label: "Terhambat (Mentally Defective)", min: -9999, max: 69, color: "#FCA5A5", onDark: false },
];

function bandFor(iq: number): Band {
	return CFIT_BANDS.find((b) => iq >= b.min && iq <= b.max) ?? CFIT_BANDS[CFIT_BANDS.length - 1];
}

// ─── Helper warna ───
function hexToRGB(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16),
	];
}

function fillHex(doc: jsPDF, hex: string) {
	const [r, g, b] = hexToRGB(hex);
	doc.setFillColor(r, g, b);
}

function drawHex(doc: jsPDF, hex: string) {
	const [r, g, b] = hexToRGB(hex);
	doc.setDrawColor(r, g, b);
}

function textHex(doc: jsPDF, hex: string) {
	const [r, g, b] = hexToRGB(hex);
	doc.setTextColor(r, g, b);
}

/** Kotak brutalism: bayangan pekat + garis tebal. */
function brutBox(
	doc: jsPDF,
	x: number,
	y: number,
	w: number,
	h: number,
	fill: string,
	shadow = 4,
) {
	fillHex(doc, INK);
	doc.rect(x + shadow, y + shadow, w, h, "F");
	fillHex(doc, fill);
	drawHex(doc, INK);
	doc.setLineWidth(1.2);
	doc.rect(x, y, w, h, "FD");
}

/** Tulis teks di tengah kotak, mengecil otomatis bila melebihi lebar. */
function fittedCenterText(
	doc: jsPDF,
	s: string,
	cx: number,
	y: number,
	maxW: number,
	startSize: number,
	minSize: number,
) {
	const clean = safeText(s);
	let size = startSize;
	doc.setFontSize(size);
	while (size > minSize && doc.getTextWidth(clean) > maxW) {
		size -= 0.2;
		doc.setFontSize(size);
	}
	doc.text(clean, cx, y, { align: "center" });
}

/** Tulis teks rata kiri, mengecil otomatis bila melebihi lebar. */
function fittedLeftText(
	doc: jsPDF,
	s: string,
	x: number,
	y: number,
	maxW: number,
	startSize: number,
	minSize: number,
) {
	const clean = safeText(s);
	let size = startSize;
	doc.setFontSize(size);
	while (size > minSize && doc.getTextWidth(clean) > maxW) {
		size -= 0.2;
		doc.setFontSize(size);
	}
	doc.text(clean, x, y);
}

// ─── Helper teks & angka ───
function pctText(n: number, d: number): string {
	if (!d) return "0%";
	return `${Math.round((n / d) * 100)}%`;
}

function fmtDate(d: Date | null): string {
	if (!d) return "-";
	return new Date(d).toLocaleString("id-ID", {
		day: "2-digit",
		month: "2-digit",
		year: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Jakarta",
	});
}

function fmtDateLong(d: Date): string {
	return d.toLocaleDateString("id-ID", { dateStyle: "long" });
}

function nextY(doc: jsPDF, fallback: number): number {
	const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
	return last?.finalY ? last.finalY : fallback;
}

function ensureSpace(doc: jsPDF, y: number, needed: number, top: number): number {
	const pageH = doc.internal.pageSize.getHeight();
	if (y + needed > pageH - 46) {
		doc.addPage();
		return top;
	}
	return y;
}

// ─── Statistik ───
type Stats = {
	n: number;
	avg: number;
	median: number;
	min: number;
	max: number;
	sd: number;
};

function computeStats(iqs: number[]): Stats {
	const sorted = [...iqs].sort((a, b) => a - b);
	const n = sorted.length;
	const mean = sorted.reduce((a, b) => a + b, 0) / n;
	const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
	const mid = Math.floor(n / 2);
	const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
	return {
		n,
		avg: Math.round(mean),
		median: Math.round(median),
		min: sorted[0],
		max: sorted[n - 1],
		sd: Math.round(Math.sqrt(variance) * 10) / 10,
	};
}

// ─── Kop resmi (dengan logo Pascasarjana UM Metro) ───
function drawKop(doc: jsPDF, margin: number, pageW: number): number {
	fillHex(doc, INK);
	doc.rect(0, 0, pageW, 5, "F");

	// Logo diletakkan agak ke kanan supaya berdekatan dengan teks kop, dengan
	// latar putih agar tidak terlihat berlatar gelap. Bila berkas logo belum
	// dipasang, kop tetap tercetak normal tanpa logo.
	drawReportLogo(doc, margin + 40, 13, 46);

	textHex(doc, INK);
	doc.setFont("helvetica", "bold");
	fittedCenterText(doc, "UNIVERSITAS MUHAMMADIYAH METRO", pageW / 2, 28, pageW - margin * 2 - 190, 13, 9);
	doc.setFont("helvetica", "bold");
	fittedCenterText(doc, "PROGRAM PASCASARJANA", pageW / 2, 41, pageW - margin * 2 - 190, 10.5, 8);
	fittedCenterText(
		doc,
		"PROGRAM STUDI MAGISTER BIMBINGAN DAN KONSELING",
		pageW / 2,
		53,
		pageW - margin * 2 - 170,
		9.2,
		7,
	);

	drawHex(doc, INK);
	doc.setLineWidth(1.6);
	doc.line(margin, 60, pageW - margin, 60);
	doc.setLineWidth(0.5);
	doc.line(margin, 63, pageW - margin, 63);
	return 63;
}

function drawRahasiaBadge(doc: jsPDF, pageW: number, margin: number) {
	const w = 72;
	const h = 19;
	const x = pageW - margin - w;
	fillHex(doc, INK);
	doc.rect(x, 12, w, h, "F");
	textHex(doc, WHITE);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9.4);
	txt(doc, "RAHASIA", x + w / 2, 25, { align: "center" });
	textHex(doc, INK);
}

/** Judul bagian: bilah hijau tua dengan teks putih + keterangan kanan. */
function sectionTitle(
	doc: jsPDF,
	title: string,
	hint: string,
	margin: number,
	y: number,
	pageW: number,
): number {
	const innerW = pageW - margin * 2;
	fillHex(doc, INK);
	doc.rect(margin, y, innerW, 19, "F");
	textHex(doc, WHITE);
	doc.setFont("helvetica", "bold");
	fittedLeftText(doc, title, margin + 8, y + 13.5, innerW * 0.55, 10, 7.4);
	if (hint) {
		textHex(doc, MINT);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(6.6);
		txt(doc, hint.toUpperCase(), pageW - margin - 8, y + 13, { align: "right" });
	}
	textHex(doc, INK);
	return y + 19 + 10;
}

// ──────────────────────────────────────────────────────
// HALAMAN 1 — RINGKASAN EKSEKUTIF
// ──────────────────────────────────────────────────────

function drawKpiCard(
	doc: jsPDF,
	x: number,
	y: number,
	w: number,
	h: number,
	label: string,
	value: string,
	sub: string,
	fill: string,
) {
	brutBox(doc, x, y, w, h, fill, 3.5);
	textHex(doc, GREEN_DEEP);
	doc.setFont("helvetica", "bold");
	fittedCenterText(doc, label.toUpperCase(), x + w / 2, y + 15, w - 14, 7.6, 5.2);
	textHex(doc, INK);
	fittedCenterText(doc, value, x + w / 2, y + 41, w - 16, 23, 12);
	textHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	fittedCenterText(doc, sub, x + w / 2, y + 53, w - 12, 6.8, 4.8);
	textHex(doc, INK);
}

/** Grafik batang sebaran klasifikasi (8 kategori). */
function drawBandChart(
	doc: jsPDF,
	iqs: number[],
	margin: number,
	yIn: number,
	pageW: number,
): number {
	const innerW = pageW - margin * 2;
	const headerH = 18;
	const headroom = 18;
	const plotH = 74;
	const panelH = 148;
	const baseY = yIn + headerH + headroom + plotH;

	brutBox(doc, margin, yIn, innerW, panelH, WHITE);

	fillHex(doc, INK);
	doc.rect(margin, yIn, innerW, headerH, "F");
	textHex(doc, WHITE);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(8.6);
	txt(doc, "SEBARAN KLASIFIKASI IQ KELOMPOK", margin + 8, yIn + 12.5);
	textHex(doc, MINT);
	doc.setFontSize(6.6);
	txt(doc, "JUMLAH PESERTA PER KATEGORI", pageW - margin - 8, yIn + 12, { align: "right" });

	const counts = CFIT_BANDS.map((b) => iqs.filter((iq) => iq >= b.min && iq <= b.max).length);
	const maxCount = Math.max(1, ...counts);

	const plotX = margin + 30;
	const plotW = innerW - 30 - 14;

	// Garis skala
	for (const p of [0, 0.5, 1]) {
		const gy = baseY - plotH * p;
		drawHex(doc, p === 0 ? INK : HAIRLINE);
		doc.setLineWidth(p === 0 ? 1.2 : 0.4);
		doc.line(plotX, gy, plotX + plotW, gy);
		textHex(doc, SOFT_INK);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(6);
		txt(doc, String(Math.round(maxCount * p)), plotX - 5, gy + 2, { align: "right" });
	}

	const slotW = plotW / CFIT_BANDS.length;
	const barW = Math.min(40, slotW * 0.56);
	const labelTopLimit = yIn + headerH + 12;

	CFIT_BANDS.forEach((b, i) => {
		const c = counts[i];
		const cx = plotX + slotW * i + slotW / 2;
		const bx = cx - barW / 2;
		const h = plotH * (c / maxCount);

		fillHex(doc, STRIPE);
		doc.rect(bx, baseY - plotH, barW, plotH, "F");
		drawHex(doc, HAIRLINE);
		doc.setLineWidth(0.4);
		doc.rect(bx, baseY - plotH, barW, plotH);

		if (h > 0) {
			fillHex(doc, INK);
			doc.rect(bx + 2.5, baseY - h + 2.5, barW, h, "F");
			fillHex(doc, b.color);
			drawHex(doc, INK);
			doc.setLineWidth(1.2);
			doc.rect(bx, baseY - h, barW, h, "FD");
		}

		const labelY = Math.max(baseY - Math.max(h, 6) - 5, labelTopLimit);
		textHex(doc, INK);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8);
		txt(doc, `${c}`, cx, labelY, { align: "center" });

		fittedCenterText(doc, b.short, cx, baseY + 11, slotW - 2, 6, 4.4);
		textHex(doc, SOFT_INK);
		doc.setFont("helvetica", "normal");
		fittedCenterText(doc, b.range, cx, baseY + 20, slotW - 2, 5.6, 4.2);
		fittedCenterText(doc, pctText(c, iqs.length), cx, baseY + 29, slotW - 2, 5.6, 4.2);
	});

	textHex(doc, INK);
	return yIn + panelH;
}

/** Narasi otomatis: menerjemahkan angka jadi kalimat siap pakai konselor. */
function buildNarrative(rows: CfitRekapRow[], iqs: number[], s: Stats): string[] {
	const band = bandFor(s.avg);
	const above = iqs.filter((v) => v >= 110).length;
	const average = iqs.filter((v) => v >= 90 && v <= 109).length;
	const below = iqs.filter((v) => v < 90).length;
	const spread =
		s.sd < 8
			? "sangat homogen - kemampuan peserta relatif setara, sehingga materi klasikal dapat diberikan dengan tempo yang seragam"
			: s.sd < 14
				? "cukup homogen - masih memungkinkan pembelajaran klasikal, dengan sedikit pengayaan bagi kelompok atas"
				: "cukup beragam - disarankan pengelompokan/diferensiasi layanan agar peserta kelompok atas tidak jenuh dan kelompok bawah tidak tertinggal";

	const lines: string[] = [];
	lines.push(
		`Dari ${rows.length} peserta yang menuntaskan tes, ${s.n} peserta memperoleh skor IQ yang dapat diolah. Rata-rata kelompok berada pada angka ${s.avg} yang termasuk kategori "${band.label}", dengan median ${s.median}, rentang ${s.min}-${s.max}, dan simpangan baku ${s.sd}.`,
	);
	lines.push(
		`Sebaran kemampuan kelompok tergolong ${spread}. Sebanyak ${above} peserta (${pctText(above, s.n)}) berada pada kategori Di Atas Rata-rata ke atas, ${average} peserta (${pctText(average, s.n)}) pada kategori Rata-rata, dan ${below} peserta (${pctText(below, s.n)}) berada di bawah kategori Rata-rata.`,
	);
	lines.push(
		below > 0
			? `Peserta pada kelompok di bawah rata-rata perlu ditindaklanjuti melalui layanan bimbingan belajar individual maupun kelompok kecil, serta ditelusuri faktor non-kognitifnya (motivasi, kondisi kesehatan saat tes, dan kesiapan mengerjakan soal bergambar). Skor CFIT adalah estimasi kemampuan penalaran umum pada saat pengukuran, bukan vonis permanen atas potensi peserta didik.`
			: `Tidak ada peserta yang berada di bawah kategori Rata-rata pada pengukuran ini. Layanan selanjutnya dapat difokuskan pada pengayaan, penguatan minat, serta pendampingan perencanaan studi lanjut sesuai profil kemampuan masing-masing peserta.`,
	);
	return lines;
}

function drawNarrative(
	doc: jsPDF,
	lines: string[],
	margin: number,
	yIn: number,
	pageW: number,
): number {
	const innerW = pageW - margin * 2;
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7.8);
	const wrapped: string[] = [];
	lines.forEach((l, i) => {
		wrapped.push(...wrapText(doc, l, innerW - 24));
		if (i < lines.length - 1) wrapped.push("");
	});
	const boxH = 24 + wrapped.length * 9.8;

	brutBox(doc, margin, yIn, innerW, boxH, GREEN_SOFT, 3.5);
	textHex(doc, GREEN_DEEP);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7.4);
	txt(doc, "BACAAN SINGKAT HASIL KELOMPOK", margin + 12, yIn + 15);
	textHex(doc, INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7.8);
	wrapped.forEach((line, i) => {
		txt(doc, line, margin + 12, yIn + 28 + i * 9.8);
	});
	return yIn + boxH;
}

// ──────────────────────────────────────────────────────
// HALAMAN 2 — DAFTAR PESERTA
// ──────────────────────────────────────────────────────

type StyledCell = {
	content: string;
	styles: {
		fillColor?: [number, number, number];
		textColor?: [number, number, number];
		fontStyle?: "normal" | "bold";
	};
};

function drawParticipantTable(
	doc: jsPDF,
	rows: CfitRekapRow[],
	margin: number,
	yIn: number,
): number {
	// Peringkat berdasarkan IQ (tertinggi = 1); peserta tanpa IQ tidak diberi peringkat.
	const ranked = [...rows]
		.filter((r) => typeof r.iq === "number")
		.sort((a, b) => (b.iq as number) - (a.iq as number));
	const rankOf = new Map<string, number>();
	ranked.forEach((r, i) => rankOf.set(r.id, i + 1));

	const head = [[
		"No", "Nama Peserta", "JK", "Usia", "Kelas", "Sekolah", "Ben-\ntuk",
		"RS\nA", "RS\nB", "RS\nTotal", "IQ", "Klasifikasi", "Pe-\nring-\nkat", "Selesai",
	]];

	const body: Array<Array<string | StyledCell>> = rows.map((r, i) => {
		const iqCell: string | StyledCell =
			typeof r.iq === "number"
				? {
						content: String(r.iq),
						styles: {
							fillColor: hexToRGB(bandFor(r.iq).color),
							textColor: hexToRGB(bandFor(r.iq).onDark ? WHITE : INK),
							fontStyle: "bold",
						},
					}
				: "-";
		const rank = rankOf.get(r.id);
		return [
			String(i + 1),
			cellText(r.fullName || "-"),
			cellText(r.gender || "-"),
			r.age != null ? String(r.age) : "-",
			cellText(r.grade || "-"),
			cellText(r.school || "-"),
			FORM_LABEL[r.form] ?? cellText(r.form),
			r.rawScoreA != null ? String(r.rawScoreA) : "-",
			r.rawScoreB != null ? String(r.rawScoreB) : "-",
			r.rawScoreTotal != null ? String(r.rawScoreTotal) : "-",
			iqCell,
			cellText(r.classification || "-"),
			rank ? String(rank) : "-",
			cellText(fmtDate(r.finishedAt)),
		];
	});

	autoTable(doc, {
		startY: yIn,
		head,
		body,
		theme: "grid",
		styles: {
			font: "helvetica",
			fontSize: 6.2,
			lineWidth: 0.4,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: 2.2,
			overflow: "linebreak",
			valign: "middle",
		},
		headStyles: {
			fillColor: hexToRGB(INK),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 6,
			lineWidth: 0.4,
			lineColor: hexToRGB(INK),
			halign: "center",
			valign: "middle",
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		columnStyles: {
			0: { cellWidth: 17, halign: "center" },
			1: { fontStyle: "bold" },
			2: { cellWidth: 16, halign: "center" },
			3: { cellWidth: 20, halign: "center" },
			4: { cellWidth: 34, halign: "center" },
			5: { cellWidth: 62 },
			6: { cellWidth: 28, halign: "center" },
			7: { cellWidth: 21, halign: "center" },
			8: { cellWidth: 21, halign: "center" },
			9: { cellWidth: 27, halign: "center" },
			10: { cellWidth: 23, halign: "center", fontStyle: "bold" },
			11: { cellWidth: 66 },
			12: { cellWidth: 22, halign: "center" },
			13: { cellWidth: 50, halign: "center" },
		},
		margin: { left: margin, right: margin, top: 40 },
	});
	return nextY(doc, yIn) + 14;
}

// ──────────────────────────────────────────────────────
// HALAMAN 3 — ANALISIS KELOMPOK
// ──────────────────────────────────────────────────────

/** Tabel distribusi + bilah proporsi visual pada kolom terakhir. */
function drawDistributionTable(
	doc: jsPDF,
	iqs: number[],
	margin: number,
	yIn: number,
): number {
	const body: Array<Array<string | StyledCell>> = CFIT_BANDS.map((b) => {
		const c = iqs.filter((iq) => iq >= b.min && iq <= b.max).length;
		return [
			{
				content: b.range,
				styles: {
					fillColor: hexToRGB(b.color),
					textColor: hexToRGB(b.onDark ? WHITE : INK),
					fontStyle: "bold" as const,
				},
			},
			cellText(b.label),
			String(c),
			pctText(c, iqs.length),
			// Bilah proporsi memakai karakter ASCII agar pasti punya glyph.
			"|".repeat(Math.round((c / Math.max(1, iqs.length)) * 30)),
		];
	});

	autoTable(doc, {
		startY: yIn,
		head: [["Rentang IQ", "Klasifikasi", "Jumlah", "%", "Proporsi"]],
		body,
		theme: "grid",
		styles: {
			font: "helvetica",
			fontSize: 7.8,
			lineWidth: 0.5,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: 3,
			overflow: "linebreak",
		},
		headStyles: {
			fillColor: hexToRGB(INK),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 7.6,
		},
		columnStyles: {
			0: { cellWidth: 64, halign: "center" },
			1: { cellWidth: 168, fontStyle: "bold" },
			2: { cellWidth: 44, halign: "center" },
			3: { cellWidth: 38, halign: "center" },
			4: { textColor: hexToRGB(GREEN_DEEP), fontStyle: "bold" },
		},
		margin: { left: margin, right: margin },
	});
	return nextY(doc, yIn) + 14;
}

/** Rekap agregat per kelompok (kelas / jenis kelamin / usia). */
function drawGroupTable(
	doc: jsPDF,
	labelHead: string,
	groups: Array<{ key: string; iqs: number[] }>,
	margin: number,
	yIn: number,
): number {
	const body = groups.map((g) => {
		if (g.iqs.length === 0) {
			return [cellText(g.key), "0", "-", "-", "-", "-", "-"];
		}
		const s = computeStats(g.iqs);
		const above = g.iqs.filter((v) => v >= 110).length;
		const below = g.iqs.filter((v) => v < 90).length;
		return [
			cellText(g.key),
			String(s.n),
			String(s.avg),
			String(s.max),
			String(s.min),
			`${above} (${pctText(above, s.n)})`,
			`${below} (${pctText(below, s.n)})`,
		];
	});

	autoTable(doc, {
		startY: yIn,
		head: [[labelHead, "n", "Rata-rata\nIQ", "Terting-\ngi", "Teren-\ndah", "IQ 110+", "IQ < 90"]],
		body,
		theme: "grid",
		styles: {
			font: "helvetica",
			fontSize: 7.6,
			lineWidth: 0.5,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: 2.8,
			halign: "center",
			overflow: "linebreak",
		},
		headStyles: {
			fillColor: hexToRGB(GREEN_DEEP),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 7.4,
			valign: "middle",
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 150 } },
		margin: { left: margin, right: margin },
	});
	return nextY(doc, yIn) + 14;
}

function groupBy(
	rows: CfitRekapRow[],
	keyOf: (r: CfitRekapRow) => string,
): Array<{ key: string; iqs: number[] }> {
	const map = new Map<string, number[]>();
	for (const r of rows) {
		const k = keyOf(r);
		const arr = map.get(k) ?? [];
		if (typeof r.iq === "number") arr.push(r.iq);
		map.set(k, arr);
	}
	return [...map.entries()]
		.map(([key, iqs]) => ({ key, iqs }))
		.sort((a, b) => a.key.localeCompare(b.key, "id", { sensitivity: "base" }));
}

function ageGroupOf(age: number | null): string {
	if (age == null) return "Tidak diisi";
	if (age < 15) return "Di bawah 15 tahun";
	if (age === 15) return "15 tahun";
	if (age === 16) return "16 tahun";
	return "17 tahun ke atas";
}

// ──────────────────────────────────────────────────────
// HALAMAN 4 — SOROTAN, METODOLOGI, TANDA TANGAN
// ──────────────────────────────────────────────────────

function drawSpotlightTable(
	doc: jsPDF,
	title: string,
	subjects: CfitRekapRow[],
	headColor: string,
	margin: number,
	yIn: number,
	width: number,
	emptyText: string,
): number {
	if (subjects.length === 0) {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(7.6);
		const lines = wrapText(doc, emptyText, width - 20);
		const h = Math.max(30, 14 + lines.length * 10.4);
		fillHex(doc, PANEL);
		drawHex(doc, HAIRLINE);
		doc.setLineWidth(0.6);
		doc.rect(margin, yIn, width, h, "FD");
		textHex(doc, SOFT_INK);
		lines.forEach((line, i) => {
			txt(doc, line, margin + 10, yIn + 17 + i * 10.4);
		});
		textHex(doc, INK);
		return yIn + h + 12;
	}

	autoTable(doc, {
		startY: yIn,
		head: [[title, "Kelas", "IQ", "Klasifikasi"]],
		body: subjects.map((r) => [
			cellText(r.fullName || "-"),
			cellText(r.grade || "-"),
			r.iq != null ? String(r.iq) : "-",
			cellText(r.classification || "-"),
		]),
		theme: "grid",
		styles: {
			font: "helvetica",
			fontSize: 7,
			lineWidth: 0.5,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: 2.6,
			overflow: "linebreak",
		},
		headStyles: {
			fillColor: hexToRGB(headColor),
			textColor: hexToRGB(INK),
			fontStyle: "bold",
			fontSize: 7,
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		columnStyles: {
			0: { fontStyle: "bold" },
			1: { cellWidth: 34, halign: "center" },
			2: { cellWidth: 22, halign: "center", fontStyle: "bold" },
			3: { cellWidth: 78 },
		},
		tableWidth: width,
		margin: { left: margin, right: 0 },
	});
	return nextY(doc, yIn) + 12;
}

function drawMethodology(
	doc: jsPDF,
	margin: number,
	yIn: number,
	pageW: number,
): number {
	const innerW = pageW - margin * 2;
	const notes = [
		"Instrumen: Culture Fair Intelligence Test (CFIT) Skala 3, Bentuk A dan B, terdiri atas 4 subtes yaitu Series, Classification, Matrices, dan Conditions (Topology).",
		"Penskoran: jawaban benar setiap subtes dijumlahkan menjadi Raw Score (RS) Bentuk A dan Bentuk B, lalu digabung menjadi RS Total. Penilaian dilakukan sepenuhnya di sisi server; kunci jawaban tidak pernah dikirim ke perangkat peserta.",
		"Konversi: RS Total dikonversi menjadi skor IQ memakai tabel norma CFIT Skala 3 dengan kolom norma yang dipilih otomatis sesuai usia peserta (15 tahun, 16 tahun, dan 17 tahun ke atas).",
		"Klasifikasi: mengikuti pembagian kategori Cattell, yaitu Jenius (170 ke atas), Sangat Superior (140-169), Superior (120-139), Di Atas Rata-rata (110-119), Rata-rata (90-109), Di Bawah Rata-rata (80-89), Borderline (70-79), dan Terhambat (di bawah 70).",
		"Keterbatasan: skor merupakan estimasi kemampuan penalaran umum pada saat pengukuran dan dapat dipengaruhi kondisi fisik, motivasi, serta situasi ruang tes. Hasil sebaiknya dibaca bersama data prestasi belajar, observasi, dan wawancara konseling, bukan sebagai satu-satunya dasar pengambilan keputusan.",
		"Kerahasiaan: dokumen ini bersifat rahasia dan hanya diperuntukkan bagi keperluan layanan bimbingan dan konseling di satuan pendidikan yang bersangkutan.",
	];

	doc.setFont("helvetica", "normal");
	doc.setFontSize(7.4);
	const wrapped: string[] = [];
	for (const n of notes) {
		wrapped.push(...wrapText(doc, `-  ${n}`, innerW - 26));
	}
	const boxH = 18 + wrapped.length * 9.4;

	fillHex(doc, PANEL);
	drawHex(doc, INK);
	doc.setLineWidth(1);
	doc.rect(margin, yIn, innerW, boxH, "FD");
	textHex(doc, INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7.4);
	wrapped.forEach((line, i) => {
		txt(doc, line, margin + 12, yIn + 16 + i * 9.4);
	});
	return yIn + boxH + 14;
}

function drawSignatures(
	doc: jsPDF,
	margin: number,
	yIn: number,
	pageW: number,
	tanggal: string,
): number {
	const innerW = pageW - margin * 2;
	const gap = 32;
	const colW = (innerW - gap) / 2;
	const cols = [
		{
			cx: margin + colW / 2,
			jabatan: ["Ketua Program Studi Magister", "Bimbingan dan Konseling"],
			nama: KAPRODI_NAMA,
			idLabel: "NIDN",
			idValue: KAPRODI_NIDN,
		},
		{
			cx: margin + colW + gap + colW / 2,
			jabatan: [`${KOP_KOTA}, ${tanggal}`, "Tester"],
			nama: TESTER_NAMA,
			idLabel: "NA",
			idValue: TESTER_NA,
		},
	];

	const jabatanY = yIn;
	const nameY = jabatanY + 62;

	for (const c of cols) {
		textHex(doc, INK);
		doc.setFont("helvetica", "normal");
		c.jabatan.forEach((line, i) => {
			fittedCenterText(doc, line, c.cx, jabatanY + i * 11, colW - 8, 8.2, 6.4);
		});

		const nama = c.nama || "...................................................";
		doc.setFont("helvetica", "bold");
		fittedCenterText(doc, nama, c.cx, nameY, colW - 8, 8.8, 6.6);

		const lineW = Math.min(colW - 8, Math.max(150, doc.getTextWidth(safeText(nama)) + 26));
		drawHex(doc, INK);
		doc.setLineWidth(0.6);
		doc.line(c.cx - lineW / 2, nameY + 3.5, c.cx + lineW / 2, nameY + 3.5);

		textHex(doc, SOFT_INK);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(7.6);
		txt(
			doc,
			c.idValue ? `${c.idLabel}. ${c.idValue}` : `${c.idLabel}.`,
			c.cx,
			nameY + 15,
			{ align: "center" },
		);
		textHex(doc, INK);
	}

	return nameY + 24;
}

// ──────────────────────────────────────────────────────
// DOKUMEN
// ──────────────────────────────────────────────────────

export function buildCfitRekapPDF(
	meta: { school: string; grade: string; generatedAt: Date },
	rows: CfitRekapRow[],
	opts?: { showPageNumber?: boolean },
): Buffer {
	const showPageNumber = opts?.showPageNumber !== false;
	const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();
	const margin = 36;
	const innerW = pageW - margin * 2;

	const iqs = rows.map((r) => r.iq).filter((n): n is number => typeof n === "number");
	const hasScores = iqs.length > 0;
	const printedAt = meta.generatedAt.toLocaleString("id-ID", {
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Jakarta",
	});

	// ═══ HALAMAN 1 — RINGKASAN EKSEKUTIF ═══
	drawKop(doc, margin, pageW);
	drawRahasiaBadge(doc, pageW, margin);

	// Judul dokumen
	brutBox(doc, margin, 76, innerW, 46, GREEN, 4);
	textHex(doc, INK);
	doc.setFont("helvetica", "bold");
	fittedLeftText(doc, "REKAP HASIL TES INTELEGENSI KELOMPOK", margin + 14, 102, innerW - 28, 15.5, 10);
	doc.setFont("helvetica", "normal");
	fittedLeftText(
		doc,
		"Culture Fair Intelligence Test (CFIT) Skala 3 - Bentuk A + B",
		margin + 14,
		115,
		innerW - 28,
		8.6,
		6.4,
	);

	// Strip identitas & meta cetak
	fillHex(doc, INK);
	doc.rect(margin, 130, innerW, 32, "F");
	textHex(doc, WHITE);
	doc.setFont("helvetica", "bold");
	fittedLeftText(
		doc,
		`${(meta.school || "SEMUA SEKOLAH").toUpperCase()}   \u2022   KELAS: ${(meta.grade || "SEMUA KELAS").toUpperCase()}`,
		margin + 10,
		144,
		innerW - 20,
		9,
		6.4,
	);
	textHex(doc, MINT);
	doc.setFont("helvetica", "bold");
	fittedLeftText(
		doc,
		`TOTAL PESERTA SELESAI: ${rows.length}   \u2022   SKOR TEROLAH: ${iqs.length}   \u2022   DICETAK: ${printedAt} WIB`,
		margin + 10,
		156,
		innerW - 20,
		7.4,
		5.4,
	);
	textHex(doc, INK);

	let y = 176;

	if (hasScores) {
		const s = computeStats(iqs);
		const topBand = [...CFIT_BANDS]
			.map((b) => ({ b, c: iqs.filter((iq) => iq >= b.min && iq <= b.max).length }))
			.sort((a, b) => b.c - a.c)[0];
		const above = iqs.filter((v) => v >= 110).length;

		// Kartu KPI — potret: 3 kolom x 2 baris
		const cardGap = 12;
		const cardW = (innerW - cardGap * 2) / 3;
		const cardH = 60;
		const kpis: Array<{ label: string; value: string; sub: string; fill: string }> = [
			{ label: "Peserta", value: String(s.n), sub: "skor terolah", fill: WHITE },
			{ label: "Rata-rata IQ", value: String(s.avg), sub: bandFor(s.avg).label.split(" (")[0], fill: GREEN_SOFT },
			{ label: "Median IQ", value: String(s.median), sub: "nilai tengah", fill: WHITE },
			{ label: "IQ Tertinggi", value: String(s.max), sub: bandFor(s.max).label.split(" (")[0], fill: WHITE },
			{ label: "IQ Terendah", value: String(s.min), sub: bandFor(s.min).label.split(" (")[0], fill: WHITE },
			{ label: "Proporsi IQ 110+", value: pctText(above, s.n), sub: `${above} peserta`, fill: GREEN_SOFT },
		];
		kpis.forEach((k, i) => {
			const col = i % 3;
			const row = Math.floor(i / 3);
			drawKpiCard(
				doc,
				margin + col * (cardW + cardGap),
				y + row * (cardH + 12),
				cardW,
				cardH,
				k.label,
				k.value,
				k.sub,
				k.fill,
			);
		});
		y += cardH * 2 + 12 + 18;

		// Keterangan simpangan baku & kategori terbanyak
		textHex(doc, SOFT_INK);
		doc.setFont("helvetica", "bold");
		fittedLeftText(
			doc,
			`Simpangan baku: ${s.sd}   \u2022   Rentang skor: ${s.min}-${s.max}   \u2022   Kategori terbanyak: ${topBand.b.label} (${topBand.c} peserta, ${pctText(topBand.c, s.n)})`,
			margin,
			y,
			innerW,
			7.6,
			5.6,
		);
		textHex(doc, INK);
		y += 12;

		y = drawBandChart(doc, iqs, margin, y, pageW) + 14;
		drawNarrative(doc, buildNarrative(rows, iqs, s), margin, y, pageW);
	} else {
		fillHex(doc, PANEL);
		drawHex(doc, INK);
		doc.setLineWidth(1);
		doc.rect(margin, y, innerW, 60, "FD");
		textHex(doc, INK);
		doc.setFont("helvetica", "bold");
		fittedLeftText(doc, "Belum ada skor IQ yang dapat diolah pada filter ini.", margin + 14, y + 26, innerW - 28, 11, 8);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8);
		wrapText(
			doc,
			"Peserta terdata sudah menyelesaikan tes, namun hasil penskoran belum tersedia. Periksa kembali data hasil pada panel admin.",
			innerW - 28,
		).forEach((line, i) => {
			txt(doc, line, margin + 14, y + 42 + i * 10);
		});
	}

	// ═══ HALAMAN 2 — DAFTAR PESERTA ═══
	doc.addPage();
	y = sectionTitle(
		doc,
		"DAFTAR PESERTA & HASIL INDIVIDUAL",
		`${rows.length} peserta \u2022 urut nama`,
		margin,
		36,
		pageW,
	);
	y = drawParticipantTable(doc, rows, margin, y);

	// Legenda warna klasifikasi (dua baris agar muat pada halaman potret)
	y = ensureSpace(doc, y, 44, 40);
	textHex(doc, SOFT_INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7);
	txt(doc, "KETERANGAN WARNA KOLOM IQ:", margin, y + 8);
	const legendPerRow = 4;
	const legendColW = innerW / legendPerRow;
	CFIT_BANDS.forEach((b, i) => {
		const col = i % legendPerRow;
		const row = Math.floor(i / legendPerRow);
		const lx = margin + col * legendColW;
		const ly = y + 14 + row * 13;
		fillHex(doc, b.color);
		drawHex(doc, INK);
		doc.setLineWidth(0.6);
		doc.rect(lx, ly, 10, 10, "FD");
		textHex(doc, INK);
		doc.setFont("helvetica", "bold");
		fittedLeftText(doc, `${b.short} (${b.range})`, lx + 13, ly + 8, legendColW - 18, 6.4, 4.8);
	});
	textHex(doc, INK);

	// ═══ HALAMAN 3 — ANALISIS KELOMPOK ═══
	if (hasScores) {
		doc.addPage();
		y = sectionTitle(
			doc,
			"DISTRIBUSI KLASIFIKASI IQ",
			"jumlah & proporsi peserta per kategori",
			margin,
			36,
			pageW,
		);
		y = drawDistributionTable(doc, iqs, margin, y);

		const grades = groupBy(rows, (r) => r.grade || "Tanpa Kelas");
		if (grades.length > 1) {
			y = ensureSpace(doc, y, 120, 40);
			y = sectionTitle(doc, "REKAP PER KELAS", "perbandingan antar rombongan belajar", margin, y, pageW);
			y = drawGroupTable(doc, "Kelas", grades, margin, y);
		}

		const schools = groupBy(rows, (r) => r.school || "Tanpa Sekolah");
		if (schools.length > 1) {
			y = ensureSpace(doc, y, 120, 40);
			y = sectionTitle(doc, "REKAP PER SEKOLAH", "perbandingan antar satuan pendidikan", margin, y, pageW);
			y = drawGroupTable(doc, "Sekolah", schools, margin, y);
		}

		const genders = groupBy(rows, (r) =>
			r.gender === "L" ? "Laki-laki" : r.gender === "P" ? "Perempuan" : "Tidak diisi",
		);
		y = ensureSpace(doc, y, 120, 40);
		y = sectionTitle(doc, "REKAP PER JENIS KELAMIN", "data pendukung, bukan pembanding kemampuan", margin, y, pageW);
		y = drawGroupTable(doc, "Jenis Kelamin", genders, margin, y);

		const ages = groupBy(rows, (r) => ageGroupOf(r.age));
		y = ensureSpace(doc, y, 120, 40);
		y = sectionTitle(doc, "REKAP PER KELOMPOK USIA", "mengikuti kolom norma CFIT yang dipakai", margin, y, pageW);
		y = drawGroupTable(doc, "Kelompok Usia", ages, margin, y);
	}

	// ═══ HALAMAN 4 — SOROTAN, METODOLOGI, TANDA TANGAN ═══
	doc.addPage();
	y = 36;

	if (hasScores) {
		y = sectionTitle(
			doc,
			"SOROTAN PESERTA",
			"capaian tertinggi & perlu perhatian layanan",
			margin,
			y,
			pageW,
		);

		const scored = rows.filter((r) => typeof r.iq === "number");
		const top = [...scored].sort((a, b) => (b.iq as number) - (a.iq as number)).slice(0, 8);
		const attention = [...scored]
			.filter((r) => (r.iq as number) < 90)
			.sort((a, b) => (a.iq as number) - (b.iq as number))
			.slice(0, 8);

		const colGap = 18;
		const colW = (innerW - colGap) / 2;
		const leftEnd = drawSpotlightTable(
			doc,
			"Capaian Tertinggi",
			top,
			MINT,
			margin,
			y,
			colW,
			"Belum ada data.",
		);
		const rightEnd = drawSpotlightTable(
			doc,
			"Perlu Perhatian (IQ < 90)",
			attention,
			AMBER,
			margin + colW + colGap,
			y,
			colW,
			"Tidak ada peserta pada kategori di bawah rata-rata.",
		);
		y = Math.max(leftEnd, rightEnd) + 4;

		textHex(doc, SOFT_INK);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(7.2);
		wrapText(
			doc,
			"Daftar sorotan ini hanya alat bantu prioritas layanan. Setiap peserta tetap berhak atas pendampingan yang sama tanpa pelabelan.",
			innerW,
		).forEach((line, i) => {
			txt(doc, line, margin, y + 8 + i * 9.4);
		});
		textHex(doc, INK);
		y += 26;
	}

	y = ensureSpace(doc, y, 150, 40);
	y = sectionTitle(doc, "CATATAN METODOLOGI & PENAFSIRAN", "wajib dibaca sebelum menggunakan hasil", margin, y, pageW);
	y = drawMethodology(doc, margin, y, pageW);

	y = ensureSpace(doc, y, 120, 40);
	drawSignatures(doc, margin, y + 6, pageW, fmtDateLong(meta.generatedAt));

	// ═══ FOOTER SEMUA HALAMAN ═══
	const totalPages = doc.getNumberOfPages();
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		fillHex(doc, INK);
		doc.rect(0, pageH - 20, pageW, 20, "F");
		textHex(doc, WHITE);
		doc.setFont("helvetica", "bold");
		fittedLeftText(
			doc,
			"REKAP HASIL TES IQ - CFIT SKALA 3  \u2022  PASCASARJANA UM METRO  \u2022  DOKUMEN RAHASIA",
			margin,
			pageH - 7,
			innerW - 110,
			7,
			5,
		);
		if (showPageNumber) {
			doc.setFontSize(7);
			txt(doc, `Halaman ${i} dari ${totalPages}`, pageW - margin, pageH - 7, { align: "right" });
		}
	}
	textHex(doc, INK);

	return Buffer.from(doc.output("arraybuffer"));
}
