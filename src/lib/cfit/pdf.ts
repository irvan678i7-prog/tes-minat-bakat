// Laporan Tes IQ — CFIT Skala 3. 1 lembar A4 portrait, kompak tapi lengkap.
// TERPISAH dari laporan minat-bakat (src/lib/pdf.ts).

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type CfitPdfSubmission = {
	id: string;
	form: string;
	fullName: string | null;
	gender: string | null;
	age: number | null;
	grade: string | null;
	school: string | null;
	startedAt: Date;
	finishedAt: Date | null;
};

export type CfitPdfResult = {
	rawScoreA: number | null;
	rawScoreB: number | null;
	rawScoreTotal: number;
	iq: number;
	classification: string;
	payload: unknown;
	generatedAt: Date;
};

type CfitSubtestScore = {
	subtestCode: string;
	correct: number;
	answered: number;
	total: number;
};

// ── PALETTE ────────────────────────────────────────────────
const INK = "#0F172A";
const SOFT_INK = "#475569";
const HAIRLINE = "#CBD5E1";
const STRIPE = "#F8FAFC";
const PANEL = "#F1F5F9";
const WHITE = "#FFFFFF";
const ACCENT = "#22D3EE";
const ACCENT_DEEP = "#0E7490";
const HIGHLIGHT = "#CFFAFE";

const FORM_LABEL: Record<string, string> = {
	FORM_3A: "Bentuk A",
	FORM_3B: "Bentuk B",
	FORM_3AB: "Bentuk A + B",
};

const SUBTEST_LABEL: Record<string, string> = {
	"3A_SERIES": "A — Subtes 1: Series",
	"3A_CLASSIFICATION": "A — Subtes 2: Classification",
	"3A_MATRICES": "A — Subtes 3: Matrices",
	"3A_CONDITIONS": "A — Subtes 4: Conditions (Topology)",
	"3B_SERIES": "B — Subtes 1: Series",
	"3B_CLASSIFICATION": "B — Subtes 2: Classification",
	"3B_MATRICES": "B — Subtes 3: Matrices",
	"3B_CONDITIONS": "B — Subtes 4: Conditions (Topology)",
};

const CLASS_BANDS: Array<{ range: string; label: string; min: number; max: number }> = [
	{ range: ">= 170", label: "Jenius (Genius)", min: 170, max: 9999 },
	{ range: "140 - 169", label: "Sangat Superior (Very Superior)", min: 140, max: 169 },
	{ range: "120 - 139", label: "Superior", min: 120, max: 139 },
	{ range: "110 - 119", label: "Di Atas Rata-rata (High Average)", min: 110, max: 119 },
	{ range: "90 - 109", label: "Rata-rata (Average)", min: 90, max: 109 },
	{ range: "80 - 89", label: "Di Bawah Rata-rata (Low Average)", min: 80, max: 89 },
	{ range: "70 - 79", label: "Borderline", min: 70, max: 79 },
	{ range: "< 70", label: "Terhambat (Mentally Defective)", min: -9999, max: 69 },
];

function hexToRGB(hex: string): [number, number, number] {
	return [
		parseInt(hex.slice(1, 3), 16),
		parseInt(hex.slice(3, 5), 16),
		parseInt(hex.slice(5, 7), 16),
	];
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
	const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
	return last?.finalY ?? fallback;
}
function fmtDate(d?: Date | null): string {
	if (!d) return "-";
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

export function buildCfitReportPDF(
	sub: CfitPdfSubmission,
	result: CfitPdfResult,
): Buffer {
	const doc = new jsPDF({ unit: "pt", format: "a4" });
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();
	const margin = 28;

	const payload = (result.payload ?? {}) as {
		perSubtest?: CfitSubtestScore[];
		normGroup?: string;
		classificationEn?: string;
	};
	const perSubtest = Array.isArray(payload.perSubtest) ? payload.perSubtest : [];
	const normGroup = typeof payload.normGroup === "string" ? payload.normGroup : "17+";

	// ── HEADER ──
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
	doc.text("Laporan Tes IQ - CFIT Skala 3", margin, 58);
	doc.setFont("helvetica", "normal");
	setTextHex(doc, SOFT_INK);
	doc.setFontSize(8.6);
	doc.text(
		`${sub.fullName || "Peserta"}  \u2022  ${FORM_LABEL[sub.form] ?? sub.form}  \u2022  Dicetak ${fmtDate(new Date())}`,
		margin,
		70,
	);

	const badgeW = 110;
	const badgeH = 50;
	const badgeX = pageW - margin - badgeW;
	setFillHex(doc, INK);
	doc.rect(badgeX, 14, badgeW, badgeH, "F");
	setFillHex(doc, ACCENT);
	doc.rect(badgeX, 14, badgeW, 3, "F");
	setTextHex(doc, WHITE);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.text("KODE LAPORAN", badgeX + 10, 30);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(13);
	doc.text(sub.id.slice(0, 8).toUpperCase(), badgeX + 10, 46);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.text("Rahasia \u2022 Internal", badgeX + 10, 58);

	setDrawHex(doc, HAIRLINE);
	doc.setLineWidth(0.5);
	doc.line(margin, 80, pageW - margin, 80);

	// ── IDENTITAS ──
	let y = 92;
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("IDENTITAS PESERTA", margin, y);
	autoTable(doc, {
		startY: y + 4,
		body: [
			["Nama", sub.fullName || "-", "L/P", sub.gender || "-"],
			["Usia", sub.age != null ? `${sub.age} th` : "-", "Kelas", sub.grade || "-"],
			["Sekolah", sub.school || "-", "Bentuk Tes", FORM_LABEL[sub.form] ?? sub.form],
			["Mulai", fmtDate(sub.startedAt), "Selesai", fmtDate(sub.finishedAt)],
		],
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
	});
	y = nextY(doc, y + 4) + 12;

	// ── KARTU IQ ──
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("HASIL TES IQ (CFIT SKALA 3)", margin, y);
	const cardY = y + 4;
	const cardH = 62;
	setFillHex(doc, PANEL);
	doc.rect(margin, cardY, pageW - margin * 2, cardH, "F");
	setDrawHex(doc, HAIRLINE);
	doc.setLineWidth(0.5);
	doc.rect(margin, cardY, pageW - margin * 2, cardH);

	const scoreW = 120;
	setFillHex(doc, INK);
	doc.rect(margin, cardY, scoreW, cardH, "F");
	setFillHex(doc, ACCENT);
	doc.rect(margin, cardY, scoreW, 3, "F");
	setTextHex(doc, WHITE);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(6.6);
	doc.text("SKOR IQ (CFIT)", margin + 10, cardY + 13);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(28);
	doc.text(String(result.iq), margin + 10, cardY + 44);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(6.6);
	doc.text(`Norma kelompok usia ${normGroup}`, margin + 10, cardY + 56);

	const rightX = margin + scoreW + 12;
	const rightW = pageW - margin * 2 - scoreW - 22;
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(13);
	doc.text(result.classification, rightX, cardY + 17, { maxWidth: rightW });
	if (payload.classificationEn) {
		doc.setFont("helvetica", "normal");
		setTextHex(doc, SOFT_INK);
		doc.setFontSize(8.2);
		doc.text(payload.classificationEn, rightX, cardY + 28, { maxWidth: rightW });
	}
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7.2);
	doc.text("RAW SCORE (RS)", rightX, cardY + 42);
	doc.setFont("helvetica", "normal");
	setTextHex(doc, SOFT_INK);
	doc.setFontSize(8);
	const rsParts: string[] = [];
	if (result.rawScoreA != null) rsParts.push(`Bentuk A: ${result.rawScoreA}`);
	if (result.rawScoreB != null) rsParts.push(`Bentuk B: ${result.rawScoreB}`);
	rsParts.push(`Total: ${result.rawScoreTotal}`);
	doc.text(rsParts.join("   \u2022   "), rightX, cardY + 53);
	y = cardY + cardH + 12;

	// ── RINCIAN PER SUBTES ──
	if (perSubtest.length > 0) {
		setTextHex(doc, INK);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(9);
		doc.text("RINCIAN PER SUBTES", margin, y);
		const rows = perSubtest.map((s) => [
			SUBTEST_LABEL[s.subtestCode] ?? s.subtestCode,
			String(s.correct),
			String(s.answered),
			String(s.total),
			`${Math.round((s.correct / Math.max(1, s.total)) * 100)}%`,
		]);
		autoTable(doc, {
			startY: y + 4,
			head: [["Subtes", "Benar", "Dijawab", "Jumlah Soal", "% Benar"]],
			body: rows,
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
				fontSize: 7.8,
			},
			columnStyles: {
				0: { cellWidth: "auto", fontStyle: "bold" },
				1: { cellWidth: 52, halign: "center" },
				2: { cellWidth: 56, halign: "center" },
				3: { cellWidth: 68, halign: "center" },
				4: { cellWidth: 56, halign: "center" },
			},
			alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
			margin: { left: margin, right: margin },
		});
		y = nextY(doc, y + 4) + 12;
	}

	// ── SKALA KLASIFIKASI ──
	setTextHex(doc, INK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(9);
	doc.text("SKALA KLASIFIKASI IQ (CFIT)", margin, y);
	const bandRows = CLASS_BANDS.map((b) => [
		b.range,
		b.label,
		result.iq >= b.min && result.iq <= b.max ? "<= POSISI PESERTA" : "",
	]);
	autoTable(doc, {
		startY: y + 4,
		head: [["Rentang IQ", "Klasifikasi", ""]],
		body: bandRows,
		theme: "plain",
		styles: {
			font: "helvetica",
			fontSize: 8,
			lineWidth: 0.3,
			lineColor: hexToRGB(HAIRLINE),
			textColor: hexToRGB(INK),
			cellPadding: { top: 2.2, bottom: 2.2, left: 6, right: 6 },
		},
		headStyles: {
			fillColor: hexToRGB(INK),
			textColor: hexToRGB(WHITE),
			fontStyle: "bold",
			fontSize: 7.6,
		},
		columnStyles: {
			0: { cellWidth: 90, halign: "center", fontStyle: "bold" },
			1: { cellWidth: "auto" },
			2: { cellWidth: 120, halign: "left", fontStyle: "bold", textColor: hexToRGB(ACCENT_DEEP) },
		},
		alternateRowStyles: { fillColor: hexToRGB(STRIPE) },
		margin: { left: margin, right: margin },
		didParseCell: (data) => {
			if (data.section !== "body") return;
			const band = CLASS_BANDS[data.row.index];
			if (band && result.iq >= band.min && result.iq <= band.max) {
				data.cell.styles.fillColor = hexToRGB(HIGHLIGHT);
				data.cell.styles.fontStyle = "bold";
			}
		},
	});
	y = nextY(doc, y + 4) + 10;

	// ── DISCLAIMER ──
	const boxY = pageH - 56;
	setFillHex(doc, "#E0F2FE");
	doc.rect(margin, boxY, pageW - margin * 2, 22, "F");
	setDrawHex(doc, ACCENT_DEEP);
	doc.setLineWidth(0.4);
	doc.rect(margin, boxY, pageW - margin * 2, 22);
	setFillHex(doc, ACCENT_DEEP);
	doc.rect(margin, boxY, 3, 22, "F");
	setTextHex(doc, "#0C4A6E");
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7);
	doc.text("DISCLAIMER", margin + 8, boxY + 9);
	setTextHex(doc, INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	const disclaimer =
		`Skor dihitung dari Raw Score total ${result.rawScoreTotal} dengan tabel norma CFIT kelompok usia ${normGroup}. ` +
		"Hasil bersifat skrining dan bukan pengganti pemeriksaan psikologis oleh psikolog berlisensi.";
	const dLines = doc.splitTextToSize(disclaimer, pageW - margin * 2 - 80) as string[];
	doc.text(dLines.slice(0, 2), margin + 70, boxY + 9);

	// ── FOOTER ──
	setDrawHex(doc, HAIRLINE);
	doc.setLineWidth(0.4);
	doc.line(margin, pageH - 24, pageW - margin, pageH - 24);
	setTextHex(doc, SOFT_INK);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7.6);
	doc.text(
		"EKIU \u2014 Tes IQ CFIT Skala 3 \u2022 Rahasia & untuk keperluan internal.",
		margin,
		pageH - 12,
	);

	if (doc.getNumberOfPages() > 1) doc.setPage(1);
	while (doc.getNumberOfPages() > 1) doc.deletePage(doc.getNumberOfPages());
	return Buffer.from(doc.output("arraybuffer"));
}
