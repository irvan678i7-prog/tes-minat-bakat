import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { buildRekapPDF } from "@/lib/pdf-rekap";
import { scoreSubmission, type ScoringPayload } from "@/lib/scoring";
import { schoolKey, gradeKey } from "@/lib/rekap-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby plan max 10 detik. Untuk rekap besar (>50 peserta) bisa kena
// limit ini — kalau perlu, batasi jumlah peserta per rekap atau pertimbangkan
// upgrade plan. Sebagian besar payload sudah di-cache di tabel Result.
export const maxDuration = 10;

export async function GET(req: NextRequest) {
	const admin = getAdminFromRequest(req);
	if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const url = new URL(req.url);
	// Filter sekarang pakai KUNCI KANONIK (hasil normalisasi), bukan teks mentah,
	// supaya variasi penulisan sekolah/kelas ("SMA 1 metro" vs "SMAN 1 METRO")
	// tetap tergabung. Label dipakai hanya untuk judul & nama file PDF.
	const wantSchoolKey = url.searchParams.get("schoolKey") || "";
	const wantGradeKey = url.searchParams.get("gradeKey") || "";
	const schoolLabel = url.searchParams.get("schoolLabel") || "";
	const gradeLabel = url.searchParams.get("gradeLabel") || "";
	const testKind = (url.searchParams.get("testKind") as "MINAT" | "BAKAT" | null) || "BAKAT";

	// Tidak bisa memfilter sekolah/kelas langsung di Prisma karena pencocokan
	// harus lewat fungsi normalisasi. Jadi ambil semua yang sudah selesai untuk
	// testKind ini, lalu saring di JS pakai schoolKey/gradeKey.
	const subsAll = await prisma.submission.findMany({
		where: { testKind, finishedAt: { not: null } },
		orderBy: [{ school: "asc" }, { grade: "asc" }, { fullName: "asc" }],
		include: { result: true },
	});

	const subs = subsAll.filter(
		(s) =>
			(!wantSchoolKey || schoolKey(s.school) === wantSchoolKey) &&
			(!wantGradeKey || gradeKey(s.grade) === wantGradeKey),
	);

	// Ensure each finished submission has a result; compute lazily if missing.
	const rows = await Promise.all(
		subs.map(async (s) => {
			let payload = s.result?.payload as unknown as ScoringPayload | null;
			let iq = s.result?.iqEstimate ?? null;
			if (!payload) {
				payload = await scoreSubmission(s.id);
				const topProfiles = payload.bakat?.topProfiles.map((p) => p.name);
				const topPrograms = payload.minat?.programs.map((p) => p.bidang);
				await prisma.result.upsert({
					where: { submissionId: s.id },
					create: {
						submissionId: s.id,
						payload: payload as unknown as Prisma.InputJsonValue,
						iqEstimate: payload.iqEstimate ?? null,
						topProfiles: topProfiles ?? Prisma.JsonNull,
						topPrograms: topPrograms ?? Prisma.JsonNull,
					},
					update: {
						payload: payload as unknown as Prisma.InputJsonValue,
						iqEstimate: payload.iqEstimate ?? null,
					},
				});
				iq = payload.iqEstimate ?? null;
			}
			return {
				id: s.id,
				fullName: s.fullName,
				gender: s.gender,
				age: s.age,
				grade: s.grade,
				school: s.school,
				testKind: s.testKind as "MINAT" | "BAKAT",
				finishedAt: s.finishedAt,
				iqEstimate: iq,
				payload,
			};
		}),
	);

	const buf = buildRekapPDF(
		{ school: schoolLabel, grade: gradeLabel, testKind, generatedAt: new Date() },
		rows,
	);
	const safe = (schoolLabel || wantSchoolKey || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30);
	const safeGrade = (gradeLabel || wantGradeKey || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 20);
	return new NextResponse(new Uint8Array(buf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="rekap-${testKind}-${safe}-${safeGrade}.pdf"`,
		},
	});
}
