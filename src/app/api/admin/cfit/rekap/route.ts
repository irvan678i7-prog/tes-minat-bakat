import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { buildCfitRekapPDF, type CfitRekapRow } from "@/lib/cfit/pdf-rekap";
import { schoolKey, gradeKey } from "@/lib/rekap-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

// Rekap PDF hasil tes IQ CFIT — filter pakai KUNCI KANONIK sekolah/kelas,
// sama seperti api/admin/rekap milik minat-bakat.
export async function GET(req: NextRequest) {
	const admin = getAdminFromRequest(req);
	if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const url = new URL(req.url);
	const wantSchoolKey = url.searchParams.get("schoolKey") || "";
	const wantGradeKey = url.searchParams.get("gradeKey") || "";
	const schoolLabel = url.searchParams.get("schoolLabel") || "";
	const gradeLabel = url.searchParams.get("gradeLabel") || "";

	const subs = await prisma.cfitSubmission.findMany({
		where: { finishedAt: { not: null } },
		include: { result: true },
	});

	const filtered = subs
		.filter(
			(s) =>
				(!wantSchoolKey || schoolKey(s.school) === wantSchoolKey) &&
				(!wantGradeKey || gradeKey(s.grade) === wantGradeKey),
		)
		.sort((a, b) =>
			(a.fullName || "").localeCompare(b.fullName || "", "id", { sensitivity: "base" }),
		);

	if (filtered.length === 0) {
		return NextResponse.json(
			{ error: "Belum ada peserta tes IQ yang selesai untuk filter ini." },
			{ status: 404 },
		);
	}

	const rows: CfitRekapRow[] = filtered.map((s) => ({
		id: s.id,
		fullName: s.fullName,
		gender: s.gender,
		age: s.age,
		grade: s.grade,
		school: s.school,
		form: s.form,
		finishedAt: s.finishedAt,
		rawScoreA: s.result?.rawScoreA ?? null,
		rawScoreB: s.result?.rawScoreB ?? null,
		rawScoreTotal: s.result?.rawScoreTotal ?? null,
		iq: s.result?.iq ?? null,
		classification: s.result?.classification ?? null,
	}));

	const buf = buildCfitRekapPDF(
		{ school: schoolLabel, grade: gradeLabel, generatedAt: new Date() },
		rows,
	);
	const safe = (schoolLabel || wantSchoolKey || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30);
	const safeGrade = (gradeLabel || wantGradeKey || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 20);
	return new NextResponse(new Uint8Array(buf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="rekap-IQ-CFIT-${safe}-${safeGrade}.pdf"`,
		},
	});
}
