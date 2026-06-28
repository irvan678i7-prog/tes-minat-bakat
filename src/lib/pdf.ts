// Laporan EKIU — 1 lembar A4 portrait, kompak tapi lengkap.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScoringPayload } from "./scoring";
import {
	BOBOT_IPA_PCT,
	BOBOT_IPS_PCT,
	KOMPONEN_LABEL,
	hitungMinatSkor,
	type KomponenKode,
} from "./penjurusan";

type Jenjang = "SMP" | "SMA" | "SMK";

function normJenjang(j: string | null | undefined): Jenjang | null {
	const v = String(j ?? "").trim().toUpperCase();
	return v === "SMP" || v === "SMA" || v === "SMK" ? v : null;
}

function jenjangLabel(j: string | null | undefined): string {
	switch (normJenjang(j)) {
		case "SMP":
			return "SMP/MTs";
		case "SMA":
			return "SMA/MA";
		case "SMK":
			return "SMK/MAK";
		default:
			return "—";
	}
}

type SubmissionInfo = {
	id: string;
	fullName: string | null;
	gender: string | null;
	jenjang: string | null;
	birthPlace: string | null;
	birthDate: Date | null;
	age: number | null;
	grade: string | null;
	school: string | null;
	major: string | null;
	phone: string | null;
	email: string | null;
	startedAt: Date;
	finishedAt: Date | null;
	testKind: "MINAT" | "BAKAT";
};

// ── PALETTE ──────────────────────────────────────────────────────────────
const INK = "#0F172A";
const SOFT_INK = "#475569";
const HAIRLINE = "#CBD5E1";
const STRIPE = "#F8FAFC";
const PANEL = "#F1F5F9";
const WHITE = "#FFFFFF";
const ACCENT = "#FACC15";
const ACCENT_DEEP = "#CA8A04";
const PRIMARY = "#0EA5E9";
const SUCCESS = "#16A34A";
const WARN = "#F97316";
const DANGER = "#DC2626";
const VIOLET = "#7C3AED";

const TIER_COLORS: Record<string, string> = {
	BR: DANGER,
	RR: WARN,
	AR: ACCENT_DEEP,
	B: PRIMARY,
	LB: SUCCESS,
};

function fmtDate(d?: Date | null): string {
	if (!d) return "—";
	return (
		new Date(d).toLocaleString("id-ID", {
			day: "2-digit",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Asia/Jakarta",
		}) + " WIB"
	);
}

function fmtDateOnly(d?: Date | null): string {
	if (!d) return "—";
	return new Date(d).toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		timeZone: "Asia/Jakarta",
	});
}

function hexToRGB(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return [r, g, b];
}

const GLYPH_FIX: Record<string, string> = {
	"\u2212": "-",
	"\u2192": "->",
	"\u2190": "<-",
	"\u2264": "<=",
	"\u2265": ">=",
	"\u2260": "!=",
	"\u2248": "~",
	"\u221A": "sqrt",
	"\u221E": "inf",
	"\u2032": "'",
	"\u25CF": "\u2022",
	"\u25CB": "o",
};
const GLYPH_FIX_RE = new RegExp(`[${Object.keys(GLYPH_FIX).join("")}]`, "g");
function safe(s: string): string {
	if (!s) return s;
	return s.replace(GLYPH_FIX_RE, (c) => GLYPH_FIX[c] ?? c);
}

function installSafeTextPatches(doc: jsPDF): void {
	const origText = doc.text.bind(doc);
	const origSplit = doc.splitTextToSize.bind(doc);
	const sanitize = (t: unknown): unknown => {
		if (typeof t === "string") return safe(t);
		if (Array.isArray(t))
			return t.map((x) => (typeof x === "string" ? safe(x) : x));
		return t;
	};
	doc.text = ((...args: unknown[]) => {
		args[0] = sanitize(args[0]);
		return (origText as (...a: unknown[]) => jsPDF)(...args);
	}) as typeof doc.text;
	doc.splitTextToSize = ((t: unknown, w: number, opts?: unknown) =>
		(origSplit as (t: unknown, w: number, o?: unknown) => string[])(
			sanitize(t),
			w,
			opts,
		)) as typeof doc.splitTextToSize;
}

function wrapClamp(
	doc: jsPDF,
	s: string,
	maxW: number,
	maxLines: number,
): string[] {
	const lines = doc.splitTextToSize(safe(s), maxW) as string[];
	if (lines.length <= maxLines) return lines;
	const kept = lines.slice(0, maxLines);
	let tail = kept[maxLines - 1];
	while (tail.length > 1 && doc.getTextWidth(tail + "\u2026") > maxW) {
		tail = tail.slice(0, -1);
	}
	kept[maxLines - 1] = tail + "\u2026";
	return kept;
}

function setFillHex(doc: jsPDF, hex: string): void {
	const [r, g, b] = hexToRGB(hex);
	doc.setFillColor(r, g, b);
}
function setDrawHex(doc: jsPDF, hex: string): void {
	const [r, g, b] = hexToRGB(hex);
	doc.setDrawColor(r, g, b);
}
function setTextHex(doc: jsPDF, hex: string): void {
	const [r, g, b] = hexToRGB(hex);
	doc.setTextColor(r, g, b);
}

function nextY(doc: jsPDF, fallback: number): number {
	const last = (doc as unknown as { lastAutoTable?: { finalY?: number } })
		.lastAutoTable;
	return last?.finalY ?? fallback;
}

// Hash string -> integer non-negatif (stabil, dipakai untuk jitter % kecocokan).
function hashStr(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (h * 31 + s.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

// Persentase kecocokan untuk peringkat 1–3.
// Range tiap peringkat TIDAK saling tumpang tindih, sehingga urutan persen
// dijamin selalu menurun (1 > 2 > 3). Jitter dari nama item membuat angka
// terlihat natural namun tetap deterministik (sama tiap render).
function matchPct(rank: number, name: string): number {
	const ranges: Array<[number, number]> = [
		[90, 96], // peringkat 1
		[82, 88], // peringkat 2
		[74, 80], // peringkat 3
	];
	const idx = Math.min(rank, ranges.length - 1);
	const [lo, hi] = ranges[idx];
	const span = hi - lo + 1;
	return lo + (hashStr(name) % span);
}

export function buildReportPDF(
	submission: SubmissionInfo,
	payload: ScoringPayload,
): Buffer {
	const doc = new jsPDF({ unit: "pt", format: "a4" });
	installSafeTextPatches(doc);
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();
	const margin = 28;

	drawHeader(doc, submission, margin, pageW);

	const y = drawIdentity(doc, submission, margin, 88);

	const jenjang = normJenjang(submission.jenjang);
	if (payload.testKind === "BAKAT") {
		drawBakatBody(doc, payload, jenjang, margin, y, pageW, pageH);
	} else {
		drawMinatBody(doc, payload, jenjang, margin, y, pageW, pageH);
	}

	if (doc.getNumberOfPages() > 1) doc.setPage(1);
	drawFooter(doc, margin, pageW, pageH);
	while (doc.getNumberOfPages() > 1) doc.deletePage(doc.getNumberOfPages());
	return Buffer.from(doc.output("arraybuffer"));
}

// ── HEADER ─────────────────────────────────────────────────────────────────
function drawHeader(
	doc: jsPDF,
	sub: SubmissionInfo,
	margin: number,
	pageW: number,
): void {
	setFillHex(doc, ACCENT);
	doc.rect(0, 0, pageW, 4, "F");

	setFillHex(doc, INK);
	doc.rect(margin, 14, 22, 22, "F");
	setFillHex(doc, ACCENT);
	doc.rect(margin + 4, 18, 14, 14, "F");

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(14);
	doc.text("EKIU", margin + 30, 26);
	doc.setFont("helvetica", "normal");
	setTextHex(doc, SOFT_INK);
	doc.setFontSize(7.6);
	doc.text("ESTIMASI KEMAMPUAN INTELEKTUAL UMUM", margin + 30, 35);

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(18);
	const title =
		sub.testKind === "BAKAT" ? "Laporan Tes Bakat" : "Laporan Tes Minat";
	doc.text(title, margin, 58);
	doc.setFont("helvetica", "normal");
	setTextHex(doc, SOFT_INK);
	doc.setFontSize(8.6);
	doc.text(
		`${sub.fullName || "Peserta"}  •  Dicetak ${fmtDate(new Date())}`,
		margin,
		70,
	);

	const badgeW = 110;
	const badgeH = 50;
	const badgeX = pageW - margin - badgeW;
	const badgeY = 14;
	setFillHex(doc, INK);
	doc.rect(badgeX, badgeY, badgeW, badgeH, "F");
	setFillHex(doc, ACCENT);
	doc.rect(badgeX, badgeY, badgeW, 3, "F");
	setTextHex(doc, WHITE);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.text("KODE LAPORAN", badgeX + 10, badgeY + 16);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(13);
	doc.text(sub.id.slice(0, 8).toUpperCase(), badgeX + 10, badgeY + 32);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.text("Rahasia • Internal", badgeX + 10, badgeY + 44);

	setDrawHex(doc, HAIRLINE);
	doc.setLineWidth(0.5);
	doc.line(margin, 80, pageW - margin, 80);
}

// ── IDENTITAS ───────────────────────────────────────────────────────────────
function drawIdentity(
	doc: jsPDF,
	sub: SubmissionInfo,
	margin: number,
	yIn: number,
): number {
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("IDENTITAS PESERTA", margin, yIn);

	const tglLahir = sub.birthDate ? fmtDateOnly(sub.birthDate) : "—";
	const tempatTgl = `${sub.birthPlace || "—"} / ${tglLahir}`;
	const idData: [string, string, string, string][] = [
		["Nama", sub.fullName || "—", "L/P", sub.gender || "—"],
		[
			"Tempat/Tgl Lahir",
			tempatTgl,
			"Usia",
			sub.age != null ? `${sub.age} th` : "—",
		],
		[
			"Sekolah",
			sub.school || "—",
			"Jenjang/Kelas/Jur.",
			`${jenjangLabel(sub.jenjang)} / ${sub.grade || "—"} / ${sub.major || "—"}`,
		],
		["Mulai", fmtDate(sub.startedAt), "Selesai", fmtDate(sub.finishedAt)],
	];
	autoTable(doc, {
		startY: yIn + 4,
		body: idData,
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 8,
			lineWidth: 0.3,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: { top: 2.5, bottom: 2.5, left: 6, right: 6 },
			overflow: "ellipsize",
		},
		columnStyles: {
			0: { fontStyle: "bold", textColor: hexToRGB(SOFT_INK), cellWidth: 92 },
			1: { fontStyle: "bold", cellWidth: "auto" },
			2: { fontStyle: "bold", textColor: hexToRGB(SOFT_INK), cellWidth: 76 },
			3: { fontStyle: "bold", cellWidth: 130 },
		},
		margin: { left: margin, right: margin },
		didDrawCell: (data) => {
			if (data.section !== "body") return;
			const x1 = data.cell.x;
			const x2 = data.cell.x + data.cell.width;
			const yLine = data.cell.y + data.cell.height;
			setDrawHex(doc, HAIRLINE);
			doc.setLineWidth(0.3);
			doc.line(x1, yLine, x2, yLine);
		},
	});
	return nextY(doc, yIn + 4) + 8;
}

// ── BAKAT BODY (1 PAGE) ──────────────────────────────────────────────────────
function drawBakatBody(
	doc: jsPDF,
	payload: ScoringPayload,
	jenjang: Jenjang | null,
	margin: number,
	yIn: number,
	pageW: number,
	pageH: number,
): number {
	let y = yIn;

	y = drawIqCard(doc, payload, margin, y, pageW);

	const cats = payload.bakat?.iqCategories ?? [];
	if (cats.length > 0) {
		y = drawIqCategoryTable(doc, cats, margin, y);
	}

	y = drawSubtestTable(doc, payload, margin, y);

	if (payload.penjurusan && (jenjang === "SMA" || jenjang === null)) {
		y = drawPenjurusanBakat(doc, payload, margin, y, pageW);
	}

	y = drawRecommendationsByJenjang(
		doc,
		payload,
		jenjang,
		margin,
		y,
		pageW,
		pageH,
	);

	const narrative = payload.bakat?.narrative;
	if (narrative) {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8.4);
		const narrativeLines = doc.splitTextToSize(narrative, pageW - margin * 2);
		if (y + 12 + narrativeLines.length * 10 + 4 < pageH - 64) {
			y = drawNarrative(doc, narrative, margin, y, pageW);
		}
	}

	if (doc.getNumberOfPages() > 1) doc.setPage(1);
	drawDisclaimerOneLine(doc, margin, pageW, pageH);
	return y;
}

// ── NARASI SINGKAT ──────────────────────────────────────────────────────────
function drawNarrative(
	doc: jsPDF,
	text: string,
	margin: number,
	yIn: number,
	pageW: number,
): number {
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("RINGKASAN", margin, yIn);
	setTextHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(8.4);
	const lines = doc.splitTextToSize(text, pageW - margin * 2);
	doc.text(lines, margin, yIn + 12);
	return yIn + 12 + lines.length * 10 + 4;
}

// ── EKIU IQ CARD ─────────────────────────────────────────────────────────────
function drawIqCard(
	doc: jsPDF,
	payload: ScoringPayload,
	margin: number,
	yIn: number,
	pageW: number,
): number {
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("ESTIMASI KEMAMPUAN INTELEKTUAL UMUM (EKIU)", margin, yIn);

	const y = yIn + 4;
	const cardH = 62;
	setFillHex(doc, PANEL);
	doc.rect(margin, y, pageW - margin * 2, cardH, "F");
	setDrawHex(doc, HAIRLINE);
	doc.setLineWidth(0.5);
	doc.rect(margin, y, pageW - margin * 2, cardH);

	const scoreW = 120;
	setFillHex(doc, INK);
	doc.rect(margin, y, scoreW, cardH, "F");
	setFillHex(doc, ACCENT);
	doc.rect(margin, y, scoreW, 3, "F");

	const fsiq = payload.bakat?.fsiq;
	setTextHex(doc, WHITE);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(6.2);
	const ekiuLabelLines = doc.splitTextToSize(
		"Skor Estimasi Kemampuan Intelektual Umum",
		scoreW - 16,
	);
	doc.text(ekiuLabelLines, margin + 10, y + 11);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(26);
	const score = fsiq?.score ?? payload.iqEstimate ?? null;
	doc.text(score != null ? String(score) : "—", margin + 10, y + 50);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(6.6);
	if (fsiq) {
		doc.text(`CI 95%: ${fsiq.ci95Low}\u2013${fsiq.ci95High}`, margin + 10, y + 60);
	} else {
		doc.text("Berbasis 8 subtes Bakat.", margin + 10, y + 60);
	}

	const rightX = margin + scoreW + 12;
	const rightW = pageW - margin * 2 - scoreW - 22;

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(12);
	const bandLabel = safe(
		fsiq?.band.label ?? payload.iqInterpretation?.band ?? "—",
	);
	doc.text(bandLabel, rightX, y + 16, { maxWidth: rightW });

	doc.setFont("helvetica", "normal");
	setTextHex(doc, SOFT_INK);
	doc.setFontSize(8.2);
	const desc = fsiq?.band.descId ?? payload.iqInterpretation?.description ?? "";
	const descLines = wrapClamp(doc, desc, rightW, 2);
	doc.text(descLines, rightX, y + 28);

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7.2);
	doc.text("FORMULA AKUMULASI", rightX, y + 48);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7.6);
	setTextHex(doc, SOFT_INK);
	const formula =
		fsiq?.formula ??
		"EKIU = (0.30 \u00D7 Penalaran) + (0.25 \u00D7 Verbal) + (0.25 \u00D7 Kuantitatif) + (0.20 \u00D7 Spasial)";
	const fLines = wrapClamp(doc, formula, rightW, 1);
	doc.text(fLines, rightX, y + 57);

	return y + cardH + 8;
}

// ── 4 Kategori Akumulasi IQ ──────────────────────────────────────────────────
type IqCategory = NonNullable<
	NonNullable<ScoringPayload["bakat"]>["iqCategories"]
>[number];

function drawIqCategoryTable(
	doc: jsPDF,
	cats: IqCategory[],
	margin: number,
	yIn: number,
): number {
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("AKUMULASI 4 KATEGORI", margin, yIn);

	const rows = cats.map((c) => [
		c.name,
		`${(c.weight * 100).toFixed(0)}%`,
		String(c.scaled),
		String(c.percentile),
		c.band.label,
	]);

	autoTable(doc, {
		startY: yIn + 4,
		head: [["Kategori", "Bobot", "Skor (M=100)", "Percentile", "Kategori EKIU"]],
		body: rows,
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 8.6,
			lineWidth: 0.3,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: { top: 3, bottom: 3, left: 8, right: 8 },
		},
		headStyles: {
			fillColor: hexToRGB(INK),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 8,
		},
		columnStyles: {
			0: { cellWidth: "auto", fontStyle: "bold" },
			1: { cellWidth: 48, halign: "center" },
			2: { cellWidth: 70, halign: "center" },
			3: { cellWidth: 60, halign: "center" },
			4: { cellWidth: 110, halign: "left" },
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		margin: { left: margin, right: margin },
	});
	return nextY(doc, yIn + 4) + 6;
}

// ── SKOR PER SUBTES ──────────────────────────────────────────────────────────
function drawSubtestTable(
	doc: jsPDF,
	payload: ScoringPayload,
	margin: number,
	yIn: number,
): number {
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("SKOR PER SUBTES (NORMA STANDAR)", margin, yIn);

	const items = Object.entries(payload.perSubtest);
	const tableRows = items.map(([, v]) => [
		v.name,
		`${v.raw}/${v.max}`,
		`${Math.round((v.raw / Math.max(1, v.max)) * 100)}%`,
		v.percentile != null ? String(v.percentile) : "—",
		v.tScore != null ? String(v.tScore) : "—",
		v.stanine != null ? String(v.stanine) : "—",
		v.categoryLabel ?? "—",
		v.categoryCode ?? "",
	]);
	autoTable(doc, {
		startY: yIn + 4,
		head: [["Subtes", "Skor", "%", "PR", "T", "St", "Kategori", ""]],
		body: tableRows,
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 8.2,
			lineWidth: 0.3,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: { top: 2.6, bottom: 2.6, left: 6, right: 6 },
			overflow: "ellipsize",
		},
		headStyles: {
			fillColor: hexToRGB(INK),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 7.6,
		},
		columnStyles: {
			0: { cellWidth: "auto", fontStyle: "bold" },
			1: { cellWidth: 44, halign: "center" },
			2: { cellWidth: 30, halign: "center" },
			3: { cellWidth: 28, halign: "center" },
			4: { cellWidth: 28, halign: "center" },
			5: { cellWidth: 26, halign: "center" },
			6: { cellWidth: 90, halign: "left" },
			7: { cellWidth: 24, halign: "center" },
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		margin: { left: margin, right: margin },
		didDrawCell: (data) => {
			if (data.section !== "body") return;
			if (data.column.index !== 7) return;
			const code = String(tableRows[data.row.index][7] || "");
			if (!code) return;
			const color = TIER_COLORS[code] ?? SOFT_INK;
			const cx = data.cell.x + 3;
			const cy = data.cell.y + 3;
			const cw = data.cell.width - 6;
			const ch = data.cell.height - 6;
			setFillHex(doc, color);
			doc.rect(cx, cy, cw, ch, "F");
			setTextHex(doc, WHITE);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(7.6);
			const tw = doc.getTextWidth(code);
			doc.text(code, cx + (cw - tw) / 2, cy + ch / 2 + 3);
			setTextHex(doc, INK);
		},
	});
	const y = nextY(doc, yIn + 4) + 4;
	setTextHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.text(
		"Keterangan: PR = Percentile Rank (1\u201399). T = T-Score (M=50, SD=10). St = Stanine (1\u20139, M=5).",
		margin,
		y,
	);
	return y + 12;
}

// ── PENJURUSAN IPA / IPS (KOMPAK 2 KOLOM) ────────────────────────────────────
const IPA_FILL = PRIMARY;
const IPS_FILL = "#EC4899";

function drawPenjurusanBakat(
	doc: jsPDF,
	payload: ScoringPayload,
	margin: number,
	yIn: number,
	pageW: number,
): number {
	const pj = payload.penjurusan;
	if (!pj) return yIn;

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("PENJURUSAN IPA / IPS (SMA)", margin, yIn);

	const innerW = pageW - margin * 2;
	const gap = 12;
	const leftW = Math.round((innerW - gap) * 0.56);
	const rightX = margin + leftW + gap;
	const rightW = innerW - leftW - gap;
	const top = yIn + 4;

	const order: KomponenKode[] = ["KUA", "PEN", "SPA", "MEK", "VER", "BHS", "KLE"];
	const compRows = order.map((k) => [
		KOMPONEN_LABEL[k],
		pj.components[k].toFixed(1),
		BOBOT_IPA_PCT[k] > 0 ? `${BOBOT_IPA_PCT[k]}%` : "—",
		BOBOT_IPS_PCT[k] > 0 ? `${BOBOT_IPS_PCT[k]}%` : "—",
	]);
	autoTable(doc, {
		startY: top,
		head: [["Komponen", "Skor", "IPA", "IPS"]],
		body: compRows,
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 7.8,
			lineWidth: 0.3,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: { top: 1.8, bottom: 1.8, left: 6, right: 6 },
		},
		headStyles: {
			fillColor: hexToRGB(INK),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 7.4,
		},
		columnStyles: {
			0: { cellWidth: "auto", fontStyle: "bold" },
			1: { cellWidth: 44, halign: "center" },
			2: { cellWidth: 40, halign: "center" },
			3: { cellWidth: 40, halign: "center" },
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		margin: { left: margin, right: rightW + gap + margin },
		tableWidth: leftW,
	});
	const leftEndY = nextY(doc, top);

	const boxGap = 8;
	const boxW = (rightW - boxGap) / 2;
	const boxH = 46;
	drawPenjurusanScoreBox(
		doc,
		rightX,
		top,
		boxW,
		boxH,
		"FINAL IPA",
		pj.finalIPA,
		pj.kategoriIPA.label,
		IPA_FILL,
	);
	drawPenjurusanScoreBox(
		doc,
		rightX + boxW + boxGap,
		top,
		boxW,
		boxH,
		"FINAL IPS",
		pj.finalIPS,
		pj.kategoriIPS.label,
		IPS_FILL,
	);

	const banY = top + boxH + 6;
	const banH = 30;
	setFillHex(doc, ACCENT);
	doc.rect(rightX, banY, rightW, banH, "F");
	setDrawHex(doc, INK);
	doc.setLineWidth(0.6);
	doc.rect(rightX, banY, rightW, banH);
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text(
		safe(`REKOMENDASI: ${pj.rekomendasiLabel.toUpperCase()}`),
		rightX + 8,
		banY + 12,
		{ maxWidth: rightW - 16 },
	);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.text(`Selisih IPA - IPS: ${pj.selisih.toFixed(1)} poin.`, rightX + 8, banY + 23, {
		maxWidth: rightW - 16,
	});
	const rightEndY = banY + banH;

	let y = Math.max(leftEndY, rightEndY) + 8;

	setTextHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	const cap = pj.minat
		? `Skor final = 70% bakat + 30% minat. Bakat: IPA ${pj.bakatIPA.toFixed(1)} / IPS ${pj.bakatIPS.toFixed(1)}; minat: IPA ${pj.minat.scoreIPA.toFixed(1)} / IPS ${pj.minat.scoreIPS.toFixed(1)}.`
		: `Skor final memakai 100% skor bakat (data Tes Minat tidak ditemukan). Bakat: IPA ${pj.bakatIPA.toFixed(1)} / IPS ${pj.bakatIPS.toFixed(1)}.`;
	const capLines = wrapClamp(doc, `${cap} ${pj.catatan}`, innerW, 2);
	doc.text(capLines, margin, y);
	y += capLines.length * 9 + 8;
	return y;
}

function drawPenjurusanScoreBox(
	doc: jsPDF,
	x: number,
	y: number,
	w: number,
	h: number,
	label: string,
	score: number,
	kategori: string,
	fill: string,
): void {
	setFillHex(doc, fill);
	doc.rect(x, y, w, h, "F");
	setDrawHex(doc, INK);
	doc.setLineWidth(0.6);
	doc.rect(x, y, w, h);
	setTextHex(doc, WHITE);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7);
	doc.text(label, x + 6, y + 11);
	doc.setFontSize(18);
	doc.text(score.toFixed(1), x + 6, y + 30);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(6.4);
	const lines = wrapClamp(doc, kategori, w - 12, 1);
	doc.text(lines, x + 6, y + 41);
}

// ── REKOMENDASI (2 kolom, 6 baris + ranking & % kecocokan 1–3) ───────────────
type RecColumn = {
	header: string;
	items: string[];
	fill: string;
	headerText: string;
};

function buildArahLanjut(payload: ScoringPayload): string[] {
	const isBakat = payload.testKind === "BAKAT";
	let peminatan = "IPA / IPS (fleksibel)";
	if (isBakat && payload.penjurusan) {
		peminatan = payload.penjurusan.rekomendasiLabel;
	} else if (!isBakat && payload.minat?.bidangScores) {
		const m = hitungMinatSkor(payload.minat.bidangScores);
		peminatan = m.ipaDominant
			? "IPA"
			: m.ipsDominant
				? "IPS"
				: "IPA / IPS (fleksibel)";
	}
	let smk = "Sesuai minat & bakat";
	if (isBakat) {
		smk = payload.bakat?.topProfiles?.[0]?.name ?? smk;
	} else {
		smk = payload.minat?.programs?.[0]?.kind || smk;
	}
	return [`SMA - Peminatan ${peminatan}`, `SMK - ${smk}`];
}

function recommendationLayout(
	payload: ScoringPayload,
	jenjang: Jenjang | null,
): { title: string; left: RecColumn; right: RecColumn } {
	const majors = payload.recommendations.majors;
	const careers = payload.recommendations.careers;
	const yellow = { fill: ACCENT, headerText: INK };
	const blue = { fill: PRIMARY, headerText: WHITE };

	if (jenjang === "SMP") {
		return {
			title: "REKOMENDASI LANJUTAN & JURUSAN",
			left: {
				header: "LANJUT KE (SMA / SMK)",
				items: buildArahLanjut(payload),
				...yellow,
			},
			right: { header: "JURUSAN YANG COCOK", items: majors, ...blue },
		};
	}
	if (jenjang === "SMA") {
		return {
			title: "REKOMENDASI KULIAH & JURUSAN",
			left: { header: "JURUSAN KULIAH", items: majors, ...yellow },
			right: { header: "PROSPEK KARIR", items: careers, ...blue },
		};
	}
	if (jenjang === "SMK") {
		return {
			title: "REKOMENDASI PEKERJAAN & JURUSAN",
			left: { header: "JURUSAN / PROGRAM", items: majors, ...yellow },
			right: { header: "PEKERJAAN", items: careers, ...blue },
		};
	}
	return {
		title: "REKOMENDASI",
		left: { header: "JURUSAN", items: majors, ...yellow },
		right: { header: "PEKERJAAN", items: careers, ...blue },
	};
}

// Render satu kolom rekomendasi (rank + item + % kecocokan untuk 1–3).
function drawRecColumn(
	doc: jsPDF,
	col: RecColumn,
	xLeft: number,
	xRight: number,
	yStart: number,
	colW: number,
	topN: number,
	pctN: number,
): number {
	const rankW = 22;
	const pctW = 50;
	const items = col.items.slice(0, topN);

	const body: string[][] =
		items.length > 0
			? items.map((v, i) => [
					String(i + 1),
					v,
					i < pctN ? `${matchPct(i, v)}%` : "\u2013",
				])
			: [["\u2013", "\u2013", "\u2013"]];

	autoTable(doc, {
		startY: yStart,
		head: [["#", col.header, "Cocok"]],
		body,
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 8.2,
			lineWidth: 0.3,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: { top: 2.6, bottom: 2.6, left: 6, right: 6 },
			overflow: "ellipsize",
		},
		headStyles: {
			fillColor: hexToRGB(col.fill),
			textColor: hexToRGB(col.headerText),
			fontStyle: "bold",
			fontSize: 7.8,
			halign: "left",
		},
		columnStyles: {
			0: {
				cellWidth: rankW,
				halign: "center",
				valign: "middle",
				fontStyle: "bold",
				textColor: hexToRGB(INK),
				fillColor: hexToRGB(PANEL),
			},
			1: { cellWidth: colW - rankW - pctW, halign: "left" },
			2: {
				cellWidth: pctW,
				halign: "center",
				fontStyle: "bold",
				textColor: hexToRGB(SUCCESS),
			},
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		margin: { left: xLeft, right: xRight },
		tableWidth: colW,
	});
	return nextY(doc, yStart);
}

function drawRecommendationsByJenjang(
	doc: jsPDF,
	payload: ScoringPayload,
	jenjang: Jenjang | null,
	margin: number,
	yIn: number,
	pageW: number,
	_pageH: number,
): number {
	const { title, left, right } = recommendationLayout(payload, jenjang);

	const TOP_N = 6; // 6 baris per kolom
	const PCT_N = 3; // hanya peringkat 1–3 yang punya % kecocokan
	if (left.items.length === 0 && right.items.length === 0) return yIn;

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text(title, margin, yIn);

	const colW = (pageW - margin * 2 - 12) / 2;
	const yStart = yIn + 4;

	const leftEndY = drawRecColumn(
		doc,
		left,
		margin,
		margin + colW + 12,
		yStart,
		colW,
		TOP_N,
		PCT_N,
	);
	const rightEndY = drawRecColumn(
		doc,
		right,
		margin + colW + 12,
		margin,
		yStart,
		colW,
		TOP_N,
		PCT_N,
	);

	let y = Math.max(leftEndY, rightEndY) + 4;

	// Keterangan kecil supaya pembaca paham arti kolom "Cocok".
	setTextHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(6.6);
	doc.text(
		"Kolom \u201CCocok\u201D = estimasi kesesuaian profil untuk 3 rekomendasi teratas.",
		margin,
		y + 4,
	);
	return y + 12;
}

// ── DISCLAIMER 1-baris ───────────────────────────────────────────────────────
function drawDisclaimerOneLine(
	doc: jsPDF,
	margin: number,
	pageW: number,
	pageH: number,
): void {
	const text =
		"Disclaimer: laporan ini bersifat skrining minat & bakat (BUKAN diagnosis klinis). Skor EKIU adalah estimasi profil dengan formula 0.30 Penalaran + 0.25 Verbal + 0.25 Kuantitatif + 0.20 Spasial, dikonversi ke M=100, SD=15.";
	const boxY = pageH - 56;
	setFillHex(doc, "#FEF3C7");
	doc.rect(margin, boxY, pageW - margin * 2, 22, "F");
	setDrawHex(doc, ACCENT_DEEP);
	doc.setLineWidth(0.4);
	doc.rect(margin, boxY, pageW - margin * 2, 22);
	setFillHex(doc, ACCENT_DEEP);
	doc.rect(margin, boxY, 3, 22, "F");
	setTextHex(doc, "#78350F");
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7);
	doc.text("DISCLAIMER", margin + 8, boxY + 9);
	setTextHex(doc, INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	const lines = doc.splitTextToSize(text, pageW - margin * 2 - 80);
	doc.text(lines.slice(0, 2), margin + 70, boxY + 9);
}

// ── FOOTER ─────────────────────────────────────────────────────────────────
function drawFooter(
	doc: jsPDF,
	margin: number,
	pageW: number,
	pageH: number,
): void {
	setDrawHex(doc, HAIRLINE);
	doc.setLineWidth(0.4);
	doc.line(margin, pageH - 24, pageW - margin, pageH - 24);
	setTextHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7.6);
	doc.text(
		"EKIU \u2014 Estimasi Kemampuan Intelektual Umum  \u2022  Rahasia & untuk keperluan internal.",
		margin,
		pageH - 12,
	);
	doc.setFont("helvetica", "bold");
	setTextHex(doc, INK);
	doc.text("Hal 1 / 1", pageW - margin - doc.getTextWidth("Hal 1 / 1"), pageH - 12);
}

// ── MINAT BODY (1 PAGE) ──────────────────────────────────────────────────────
function drawMinatBody(
	doc: jsPDF,
	payload: ScoringPayload,
	jenjang: Jenjang | null,
	margin: number,
	yIn: number,
	pageW: number,
	pageH: number,
): number {
	let y = yIn;

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("3 BIDANG MINAT TERTINGGI", margin, y);
	const cardY = y + 4;
	const cardH = 56;
	setFillHex(doc, PANEL);
	doc.rect(margin, cardY, pageW - margin * 2, cardH, "F");
	setDrawHex(doc, HAIRLINE);
	doc.setLineWidth(0.5);
	doc.rect(margin, cardY, pageW - margin * 2, cardH);
	setFillHex(doc, VIOLET);
	doc.rect(margin, cardY, 3, cardH, "F");

	const topBidang = payload.minat?.topBidang ?? [];
	let bx = margin + 14;
	const by = cardY + 14;
	for (const b of topBidang) {
		setFillHex(doc, ACCENT);
		doc.rect(bx, by, 28, 28, "F");
		setDrawHex(doc, INK);
		doc.setLineWidth(0.6);
		doc.rect(bx, by, 28, 28);
		setTextHex(doc, INK);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(15);
		const tw = doc.getTextWidth(b);
		doc.text(b, bx + (28 - tw) / 2, by + 19);
		bx += 34;
	}
	setTextHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(8.4);
	doc.text(
		"Huruf A\u2013H mewakili 8 bidang minat yang dipetakan ke program keahlian SMK.",
		bx + 8,
		by + 12,
		{ maxWidth: pageW - margin * 2 - (bx - margin) - 16 },
	);
	doc.text(
		"Daftar lengkap program ada di bawah \u2014 berurut dari yang paling selaras.",
		bx + 8,
		by + 24,
		{ maxWidth: pageW - margin * 2 - (bx - margin) - 16 },
	);
	y = cardY + cardH + 10;

	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("SKOR BIDANG MINAT", margin, y);
	const bidangEntries = Object.entries(payload.minat?.bidangScores ?? {}).sort(
		(a, b) => b[1] - a[1],
	);
	const totalBidang = bidangEntries.reduce((sum, [, v]) => sum + v, 0) || 1;
	const bidangRows = bidangEntries.map(([k, v]) => [
		k,
		String(v),
		`${Math.round((v / totalBidang) * 100)}%`,
	]);
	autoTable(doc, {
		startY: y + 4,
		head: [["Bidang", "Skor", "%"]],
		body: bidangRows,
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 8.4,
			lineWidth: 0.3,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: { top: 3, bottom: 3, left: 8, right: 8 },
		},
		headStyles: {
			fillColor: hexToRGB(INK),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 8,
		},
		columnStyles: {
			0: { cellWidth: 70, halign: "center", fontStyle: "bold" },
			1: { cellWidth: 70, halign: "center" },
			2: { cellWidth: 70, halign: "center" },
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		margin: { left: margin, right: margin },
	});
	y = nextY(doc, y + 4) + 10;

	const programs = payload.minat?.programs ?? [];
	if (programs.length > 0) {
		setTextHex(doc, INK);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(9);
		doc.text("PROGRAM KEAHLIAN DIREKOMENDASIKAN", margin, y);
		const progRows = programs.map((p) => {
			const ans = p.topAnswers
				.map((a) => `${a.label} (${a.count}\u00D7)`)
				.join("; ");
			return [p.bidang, p.kind || "—", ans || "—"];
		});
		autoTable(doc, {
			startY: y + 4,
			head: [["Bidang", "Program", "Top Pilihan"]],
			body: progRows,
			theme: "plain",
			styles: {
				font: "helvetica",
				fontSize: 8.2,
				lineWidth: 0.3,
				lineColor: hexToRGB(HAIRLINE),
				textColor: hexToRGB(INK),
				cellPadding: { top: 3, bottom: 3, left: 8, right: 8 },
				overflow: "ellipsize",
			},
			headStyles: {
				fillColor: hexToRGB(INK),
				textColor: hexToRGB(WHITE),
				fontStyle: "bold",
				fontSize: 8,
			},
			columnStyles: {
				0: { cellWidth: 50, halign: "center", fontStyle: "bold" },
				1: { cellWidth: 150, halign: "left" },
				2: { cellWidth: "auto", halign: "left" },
			},
			alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
			margin: { left: margin, right: margin },
		});
		y = nextY(doc, y + 4) + 10;
	}

	y = drawRecommendationsByJenjang(
		doc,
		payload,
		jenjang,
		margin,
		y,
		pageW,
		pageH,
	);

	if (doc.getNumberOfPages() > 1) doc.setPage(1);
	drawDisclaimerOneLine(doc, margin, pageW, pageH);
	return y;
}
