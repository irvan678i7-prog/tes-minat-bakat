import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { schoolKey, gradeKey, pickDisplay } from "@/lib/rekap-key";

export async function GET(req: NextRequest) {
	const admin = getAdminFromRequest(req);
	if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	// Ambil data mentah (yang sudah selesai), lalu kelompokkan DI JS berdasarkan
	// kunci kanonik (schoolKey|gradeKey|testKind). Dengan begitu variasi
	// penulisan seperti "SMA 1 metro" & "SMKN 1 METRO" tergabung jadi satu opsi.
	const subs = await prisma.submission.findMany({
		where: { finishedAt: { not: null } },
		select: { school: true, grade: true, testKind: true },
	});

	type Agg = {
		schoolKey: string;
		gradeKey: string;
		testKind: "MINAT" | "BAKAT";
		count: number;
		schoolNames: string[];
		gradeNames: string[];
	};

	const map = new Map<string, Agg>();
	for (const s of subs) {
		const sk = schoolKey(s.school);
		const gk = gradeKey(s.grade);
		const key = `${sk}|${gk}|${s.testKind}`;
		const a =
			map.get(key) ??
			({
				schoolKey: sk,
				gradeKey: gk,
				testKind: s.testKind as "MINAT" | "BAKAT",
				count: 0,
				schoolNames: [],
				gradeNames: [],
			} as Agg);
		a.count += 1;
		if (s.school) a.schoolNames.push(s.school);
		if (s.grade) a.gradeNames.push(s.grade);
		map.set(key, a);
	}

	// Setiap grup: kembalikan kunci kanonik + nama tampilan paling rapi + jumlah.
	const classes = [...map.values()]
		.map((a) => ({
			schoolKey: a.schoolKey,
			school: pickDisplay(a.schoolNames), // nama tampilan (rapi)
			gradeKey: a.gradeKey,
			grade: pickDisplay(a.gradeNames) || a.gradeKey,
			testKind: a.testKind,
			count: a.count,
		}))
		.sort(
			(x, y) =>
				x.school.localeCompare(y.school) || x.grade.localeCompare(y.grade),
		);

	return NextResponse.json({ classes });
}
