import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import {
	buildCfitReportPDF,
	type CfitPdfSubmission,
	type CfitPdfResult,
} from "@/lib/cfit/pdf";
import { buildCfitRekapPDF, type CfitRekapRow } from "@/lib/cfit/pdf-rekap";
import { mergeCfitPdfs } from "@/lib/cfit/pdf-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Contoh laporan DUMMY (tanpa menyentuh database) supaya admin bisa melihat
// bentuk PDF individu / rekap / rekap+individu sebelum ada data sungguhan.
// GET ?jenis=individu (default) | rekap | lengkap

type DummySpec = {
	name: string;
	gender: "L" | "P";
	age: number;
	grade: string;
	form: "FORM_3A" | "FORM_3B";
	rs: number;
	iq: number;
	cls: string;
	clsEn: string;
};

const SPECS: DummySpec[] = [
	{ name: "Anisa Rahmawati", gender: "P", age: 17, grade: "XII IPA 1", form: "FORM_3A", rs: 35, iq: 141, cls: "Sangat Superior", clsEn: "Very Superior" },
	{ name: "Bima Saputra", gender: "L", age: 17, grade: "XII IPA 1", form: "FORM_3A", rs: 30, iq: 127, cls: "Superior", clsEn: "Superior" },
	{ name: "Citra Lestari", gender: "P", age: 16, grade: "XII IPA 1", form: "FORM_3B", rs: 26, iq: 115, cls: "Di Atas Rata-rata", clsEn: "High Average" },
	{ name: "Dimas Pratama", gender: "L", age: 17, grade: "XII IPS 1", form: "FORM_3A", rs: 22, iq: 100, cls: "Rata-rata", clsEn: "Average" },
	{ name: "Eka Wulandari", gender: "P", age: 17, grade: "XII IPS 1", form: "FORM_3B", rs: 20, iq: 96, cls: "Rata-rata", clsEn: "Average" },
	{ name: "Fajar Nugroho", gender: "L", age: 18, grade: "XII IPS 2", form: "FORM_3A", rs: 17, iq: 88, cls: "Di Bawah Rata-rata", clsEn: "Low Average" },
	{ name: "Gita Permata", gender: "P", age: 17, grade: "XII IPA 2", form: "FORM_3B", rs: 14, iq: 79, cls: "Borderline", clsEn: "Borderline" },
	{ name: "Hendra Wijaya", gender: "L", age: 17, grade: "XII IPA 2", form: "FORM_3A", rs: 28, iq: 121, cls: "Superior", clsEn: "Superior" },
];

function splitScores(prefix: "3A" | "3B", total: number) {
	const defs = [
		{ code: "SERIES", cap: 13 },
		{ code: "CLASSIFICATION", cap: 14 },
		{ code: "MATRICES", cap: 13 },
		{ code: "CONDITIONS", cap: 10 },
	];
	const vals = defs.map((d) => Math.min(d.cap, Math.floor((total * d.cap) / 50)));
	let remaining = total - vals.reduce((a, b) => a + b, 0);
	for (let i = 0; remaining > 0 && i < defs.length; i++) {
		const add = Math.min(remaining, defs[i].cap - vals[i]);
		vals[i] += add;
		remaining -= add;
	}
	return defs.map((d, i) => ({
		subtestCode: `${prefix}_${d.code}`,
		correct: vals[i],
		answered: Math.min(d.cap, vals[i] + 1),
		total: d.cap,
	}));
}

function buildDummies(): Array<{ sub: CfitPdfSubmission; result: CfitPdfResult }> {
	const now = new Date();
	const started = new Date(now.getTime() - 55 * 60 * 1000);
	return SPECS.map((d, i) => {
		const prefix = d.form === "FORM_3A" ? "3A" : "3B";
		const sub: CfitPdfSubmission = {
			id: `CONTOH${String(i + 1).padStart(2, "0")}-dummy-bukan-data-asli`,
			form: d.form,
			fullName: `${d.name} (CONTOH)`,
			gender: d.gender,
			age: d.age,
			grade: d.grade,
			school: "SMA Negeri 1 Contoh",
			startedAt: started,
			finishedAt: now,
		};
		const result: CfitPdfResult = {
			rawScoreA: d.form === "FORM_3A" ? d.rs : null,
			rawScoreB: d.form === "FORM_3B" ? d.rs : null,
			rawScoreTotal: d.rs,
			iq: d.iq,
			classification: d.cls,
			payload: {
				perSubtest: splitScores(prefix, d.rs),
				normGroup: "17+",
				classificationEn: d.clsEn,
			},
			generatedAt: now,
		};
		return { sub, result };
	});
}

// new Uint8Array(...) wajib di sini: menyalin ke Uint8Array ber-backing
// ArrayBuffer murni supaya cocok dengan tipe BodyInit milik NextResponse
// (Buffer / hasil pdf-lib bertipe Uint8Array<ArrayBufferLike> dan ditolak TS).
function pdfResponse(buf: Buffer | Uint8Array, filename: string): NextResponse {
	return new NextResponse(new Uint8Array(buf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}

export async function GET(req: NextRequest) {
	const admin = getAdminFromRequest(req);
	if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const jenis = new URL(req.url).searchParams.get("jenis") || "individu";
	const dummies = buildDummies();

	if (jenis === "individu") {
		const { sub, result } = dummies[0];
		return pdfResponse(buildCfitReportPDF(sub, result), "contoh-laporan-IQ-CFIT-individu.pdf");
	}

	const rows: CfitRekapRow[] = dummies.map(({ sub, result }) => ({
		id: sub.id,
		fullName: sub.fullName,
		gender: sub.gender,
		age: sub.age,
		grade: sub.grade,
		school: sub.school,
		form: sub.form,
		finishedAt: sub.finishedAt,
		rawScoreA: result.rawScoreA,
		rawScoreB: result.rawScoreB,
		rawScoreTotal: result.rawScoreTotal,
		iq: result.iq,
		classification: result.classification,
	}));

	const rekapBuf = buildCfitRekapPDF(
		{ school: "SMA Negeri 1 Contoh (DUMMY)", grade: "Kelas 12", generatedAt: new Date() },
		rows,
		{ showPageNumber: jenis === "rekap" },
	);

	if (jenis === "rekap") {
		return pdfResponse(rekapBuf, "contoh-rekap-IQ-CFIT.pdf");
	}

	// jenis === "lengkap": rekap + semua laporan individu dummy.
	const indivBufs = dummies.map(({ sub, result }) => buildCfitReportPDF(sub, result));
	const out = await mergeCfitPdfs([rekapBuf, ...indivBufs]);
	return pdfResponse(out, "contoh-rekap-lengkap-IQ-CFIT.pdf");
}
