import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { buildRekapPDF } from "@/lib/pdf-rekap";
import { buildReportPDF } from "@/lib/pdf";
import { scoreSubmission, type ScoringPayload } from "@/lib/scoring";
import { schoolKey, gradeKey } from "@/lib/rekap-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gabungan rekap + SEMUA laporan individu jauh lebih berat dari rekap biasa.
// Kalau saat DEPLOY muncul error soal "maxDuration" (plan membatasi), ganti
// angka 60 di bawah menjadi 10. Konsekuensinya: kelas besar (>~25 peserta)
// bisa timeout — solusinya unduh per-kelas/sekolah lebih kecil, atau upgrade
// Vercel Pro.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const schoolK = url.searchParams.get("schoolKey") || "";
  const gradeK = url.searchParams.get("gradeKey") || "";
  const schoolLabel = url.searchParams.get("schoolLabel") || "";
  const gradeLabel = url.searchParams.get("gradeLabel") || "";
  const testKind = (url.searchParams.get("testKind") as "MINAT" | "BAKAT" | null) || "BAKAT";

  // Ambil semua peserta yang sudah selesai untuk jenis tes ini, lalu filter
  // pakai KEY kanonik (sama persis dengan tabel di dasbor admin).
  const subs = await prisma.submission.findMany({
    where: { testKind, finishedAt: { not: null } },
    include: { result: true },
  });

  const filtered = subs
    .filter(
      (s) =>
        (!schoolK || schoolKey(s.school) === schoolK) &&
        (!gradeK || gradeKey(s.grade) === gradeK),
    )
    // Urut ABJAD berdasarkan nama (locale Indonesia, case-insensitive).
    .sort((a, b) =>
      (a.fullName || "").localeCompare(b.fullName || "", "id", { sensitivity: "base" }),
    );

  if (filtered.length === 0) {
    return NextResponse.json(
      { error: "Belum ada peserta yang selesai untuk filter ini." },
      { status: 404 },
    );
  }

  // Pastikan tiap peserta punya payload hasil; hitung lazily bila belum ada.
  // Sengaja berurutan (bukan Promise.all) supaya tidak membebani koneksi DB.
  const rekapRows: {
    id: string;
    fullName: string | null;
    gender: string | null;
    age: number | null;
    grade: string | null;
    school: string | null;
    testKind: "MINAT" | "BAKAT";
    finishedAt: Date | null;
    iqEstimate: number | null;
    payload: ScoringPayload | null;
  }[] = [];
  const reports: { sub: (typeof subs)[number]; payload: ScoringPayload }[] = [];

  for (const s of filtered) {
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
          topProfiles: topProfiles ?? Prisma.JsonNull,
          topPrograms: topPrograms ?? Prisma.JsonNull,
        },
      });
      iq = payload.iqEstimate ?? null;
    }
    rekapRows.push({
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
    });
    reports.push({ sub: s, payload: payload as ScoringPayload });
  }

  // 1) Rekap presentasi (label sekolah/kelas pakai nama tampilan yang rapi).
  const rekapBuf = buildRekapPDF(
    { school: schoolLabel, grade: gradeLabel, testKind, generatedAt: new Date() },
    rekapRows,
  );

  // 2) Gabungkan: rekap dulu, lalu laporan individu (urut abjad).
  const merged = await PDFDocument.create();

  const rekapDoc = await PDFDocument.load(rekapBuf);
  (await merged.copyPages(rekapDoc, rekapDoc.getPageIndices())).forEach((p) => merged.addPage(p));

  for (const { sub, payload } of reports) {
    const buf = buildReportPDF(sub, payload);
    const doc = await PDFDocument.load(buf);
    (await merged.copyPages(doc, doc.getPageIndices())).forEach((p) => merged.addPage(p));
  }

  // 3) Nomor halaman BERLANJUT di seluruh dokumen. Nomor bawaan tiap bagian
  //    ditutup dulu, lalu ditimpa nomor gabungan di kanan-bawah.
  //    - Halaman rekap = landscape, sudah ada bar hitam di bawah -> tulis putih.
  //    - Halaman individu = portrait, background putih -> tulis gelap.
  const font = await merged.embedFont(StandardFonts.HelveticaBold);
  const total = merged.getPageCount();
  merged.getPages().forEach((page, i) => {
    const { width, height } = page.getSize();
    const isLandscape = width > height;
    const label = `Hal ${i + 1} / ${total}`;
    const size = 9;
    const tw = font.widthOfTextAtSize(label, size);
    if (isLandscape) {
      page.drawRectangle({ x: width - 180, y: 0, width: 180, height: 22, color: rgb(0, 0, 0) });
      page.drawText(label, { x: width - 36 - tw, y: 7, size, font, color: rgb(1, 1, 1) });
    } else {
      page.drawRectangle({ x: width - 130, y: 5, width: 110, height: 18, color: rgb(1, 1, 1) });
      page.drawText(label, {
        x: width - 28 - tw,
        y: 8,
        size,
        font,
        color: rgb(0.06, 0.09, 0.16),
      });
    }
  });

  const out = await merged.save();
  const safe = (schoolK || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30);
  const safeGrade = (gradeK || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 20);
  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rekap-lengkap-${testKind}-${safe}-${safeGrade}.pdf"`,
    },
  });
}
