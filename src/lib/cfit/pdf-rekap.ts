// Rekap hasil Tes IQ — CFIT Skala 3. A4 landscape, gaya sama dengan rekap
// minat-bakat (src/lib/pdf-rekap.ts) tetapi TERPISAH sepenuhnya dari file itu.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const CYAN = "#00E1FF";
const LIME = "#A3E635";
const PINK = "#FF4D8D";

const FORM_LABEL: Record<string, string> = {
	FORM_3A: "3A",
	FORM_3B: "3B",
	FORM_3AB: "3A+3B",
};

const CFIT_BANDS: Array<{ range: string; label: string; min: number; max: number }> = [
	{ range: ">= 170", label: "Jenius (Genius)", min: 170, max: 9999 },
	{ range: "140 - 169", label: "Sangat Superior (Very Superior)", min: 140, max: 169 },
	{ range: "120 - 139", label: "Superior", min: 120, max: 139 },
	{ range: "110 - 119", label: "Di Atas Rata-rata (High Average)", min: 110, max: 119 },
	{ range: "90 - 109", label: "Rata-rata (Average)", min: 90, max: 109 },
	{ range: "80 - 89", label: "Di Bawah Rata-rata (Low Average)", min: 80, max: 89 },
	{ range: "70 - 79", label: "Borderline", min: 70, max: 79 },
	{ range: "< 70", label: "Terhambat (Mentally Defective)", min: -9999, max: 69 },
];

function pct(n: number, d: number): string {
	if (!d) return "0%";
	return `${Math.round((n / d) * 100)}%`;
}

function fmtDate(d: Date | null): string {
	if (!d) return "—";
	return new Date(d).toLocaleString("id-ID", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Jakarta",
	});
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number, pageH: number): number {
	if (y + needed > pageH - 40) {
		doc.addPage();
		return margin;
	}
	return y;
}

export function buildCfitRekapPDF(
	meta: { school: string; grade: string; generatedAt: Date },
	rows: CfitRekapRow[],
	opts?: { showPageNumber?: boolean },
): Buffer {
	const showPageNumber = opts?.showPageNumber !== false;
	const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
	const pageW = doc.internal.pageSize.getWidth();
	const margin = 36;

	// ── HEADER ──
	doc.setFillColor(CYAN);
	doc.rect(0, 0, pageW, 100, "F");
	doc.setFillColor(BLACK);
	doc.rect(0, 100, pageW, 6, "F");
	doc.setTextColor(BLACK);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(20);
	doc.text("EKIU — REKAP HASIL TES IQ", margin, 42);
	doc.setFontSize(28);
	doc.text(
		`CFIT SKALA 3 — ${meta.school || "Semua Sekolah"}`.toUpperCase(),
		margin,
		78,
	);

	let y = 130;
	doc.setFontSize(10);
	doc.setFont("helvetica", "bold");
	const printedAt = meta.generatedAt.toLocaleString("id-ID", {
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Jakarta",
	});
	doc.text(
		`Kelas: ${meta.grade || "Semua Kelas"} • Total Peserta: ${rows.length} • Dicetak: ${printedAt} WIB`,
		margin,
		y,
	);
	y += 18;

	y = drawParticipantTable(doc, rows, margin, y);
	y = drawStats(doc, rows, margin, y, pageW);
	drawDistribution(doc, rows, margin, y, pageW);

	// ── FOOTER ──
	const totalPages = doc.getNumberOfPages();
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const pageH = doc.internal.pageSize.getHeight();
		doc.setFillColor(BLACK);
		doc.rect(0, pageH - 22, pageW, 22, "F");
		doc.setTextColor(WHITE);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8);
		doc.text("REKAP HASIL TES IQ CFIT SKALA 3 — DICETAK OTOMATIS — RAHASIA", margin, pageH - 8);
		if (showPageNumber) doc.text(`Hal. ${i} / ${totalPages}`, pageW - margin - 60, pageH - 8);
	}
	return Buffer.from(doc.output("arraybuffer"));
}

function drawParticipantTable(doc: jsPDF, rows: CfitRekapRow[], margin: number, yIn: number): number {
	const head = [[
		"No", "Nama", "JK", "Usia", "Kelas", "Sekolah", "Bentuk",
		"RS A", "RS B", "RS Total", "IQ", "Klasifikasi", "Selesai",
	]];
	const body = rows.map((r, i) => [
		String(i + 1),
		r.fullName || "—",
		r.gender || "—",
		r.age != null ? String(r.age) : "—",
		r.grade || "—",
		r.school || "—",
		FORM_LABEL[r.form] ?? r.form,
		r.rawScoreA != null ? String(r.rawScoreA) : "—",
		r.rawScoreB != null ? String(r.rawScoreB) : "—",
		r.rawScoreTotal != null ? String(r.rawScoreTotal) : "—",
		r.iq != null ? String(r.iq) : "—",
		r.classification || "—",
		fmtDate(r.finishedAt),
	]);
	autoTable(doc, {
		startY: yIn,
		head,
		body,
		theme: "grid",
		styles: { fontSize: 7.5, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 3, overflow: "linebreak" },
		headStyles: { fillColor: CYAN, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
		columnStyles: {
			0: { cellWidth: 24, halign: "center" },
			1: { fontStyle: "bold" },
			2: { cellWidth: 24, halign: "center" },
			3: { cellWidth: 30, halign: "center" },
			6: { cellWidth: 42, halign: "center" },
			7: { cellWidth: 34, halign: "center" },
			8: { cellWidth: 34, halign: "center" },
			9: { cellWidth: 44, halign: "center" },
			10: { cellWidth: 32, halign: "center", fontStyle: "bold" },
		},
		margin: { left: margin, right: margin },
	});
	// @ts-expect-error - jspdf-autotable extends jsPDF
	return (doc.lastAutoTable?.finalY ?? yIn) + 16;
}

function drawStats(doc: jsPDF, rows: CfitRekapRow[], margin: number, yIn: number, pageW: number): number {
	const iqs = rows.map((r) => r.iq).filter((n): n is number => typeof n === "number");
	if (iqs.length === 0) return yIn;
	let y = ensureSpace(doc, yIn, 120, margin, doc.internal.pageSize.getHeight());
	doc.setFillColor(BLACK);
	doc.rect(margin, y, pageW - margin * 2, 18, "F");
	doc.setTextColor(WHITE);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(11);
	doc.text("STATISTIK IQ KELOMPOK", margin + 6, y + 13);
	doc.setTextColor(BLACK);
	y += 26;
	const sorted = [...iqs].sort((a, b) => a - b);
	const avg = Math.round(iqs.reduce((a, b) => a + b, 0) / iqs.length);
	const median = sorted[Math.floor(sorted.length / 2)];
	autoTable(doc, {
		startY: y,
		head: [["Jumlah Peserta (n)", "Rata-rata IQ", "Median IQ", "IQ Tertinggi", "IQ Terendah"]],
		body: [[String(iqs.length), String(avg), String(median), String(sorted[sorted.length - 1]), String(sorted[0])]],
		theme: "grid",
		styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 4, halign: "center", fontStyle: "bold" },
		headStyles: { fillColor: LIME, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
		margin: { left: margin, right: margin },
	});
	// @ts-expect-error - jspdf-autotable extends jsPDF
	return (doc.lastAutoTable?.finalY ?? y) + 16;
}

function drawDistribution(doc: jsPDF, rows: CfitRekapRow[], margin: number, yIn: number, pageW: number): number {
	const iqs = rows.map((r) => r.iq).filter((n): n is number => typeof n === "number");
	if (iqs.length === 0) return yIn;
	let y = ensureSpace(doc, yIn, 220, margin, doc.internal.pageSize.getHeight());
	doc.setFillColor(BLACK);
	doc.rect(margin, y, pageW - margin * 2, 18, "F");
	doc.setTextColor(WHITE);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(11);
	doc.text("DISTRIBUSI KLASIFIKASI IQ (PERSENTASE)", margin + 6, y + 13);
	doc.setTextColor(BLACK);
	y += 26;
	const head = [["Rentang IQ", "Klasifikasi", "Jumlah", "%"]];
	const body = CFIT_BANDS.map((b) => {
		const c = iqs.filter((iq) => iq >= b.min && iq <= b.max).length;
		return [b.range, b.label, String(c), pct(c, iqs.length)];
	});
	autoTable(doc, {
		startY: y,
		head,
		body,
		theme: "grid",
		styles: { fontSize: 10, lineWidth: 0.8, lineColor: BLACK, textColor: BLACK, cellPadding: 4 },
		headStyles: { fillColor: PINK, textColor: BLACK, fontStyle: "bold", lineWidth: 1.2 },
		columnStyles: {
			0: { cellWidth: 100, halign: "center", fontStyle: "bold" },
			2: { cellWidth: 70, halign: "center" },
			3: { cellWidth: 70, halign: "center" },
		},
		margin: { left: margin, right: margin },
	});
	// @ts-expect-error - jspdf-autotable extends jsPDF
	return (doc.lastAutoTable?.finalY ?? y) + 16;
}
