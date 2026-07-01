import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { buildRekapPDF } from "@/lib/pdf-rekap";
import { buildReportPDF } from "@/lib/pdf";
import { scoreSubmission, type ScoringPayload } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gabungan rekap + SEMUA laporan individu lebih berat dari rekap biasa.
// Vercel Hobby tetap dibatasi 10 detik; untuk kelas besar (>~25 peserta)
// sebaiknya unduh per-kelas atau upgrade ke Vercel Pro (60 detik).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const school = url.searchParams.get("school") || "";
  const grade = url.searchParams.get("grade") || "";
  const testKind = (url.searchParams.get("testKind") as "MINAT" | "BAKAT" | null) || "BAKAT";

  const where: {
    testKind: "MINAT" | "BAKAT";
    finishedAt: { not: null };
    school?: string;
    grade?: string;
  } = {
    testKind,
    finishedAt: { not: null },
  };
  if (school) where.school = school;
  if (grade) where.grade = grade;

  const subs = await prisma.submission.findMany({
    where,
    include: { result: true },
  });

  // Urutkan ABJAD berdasarkan nama (locale Indonesia, case-insensitive).
  subs.sort((a, b) =>
    (a.fullName || "").localeCompare(b.fullName || "", "id", { sensitivity: "base" }),
  );

  if (subs.length === 0) {
    return NextResponse.json(
      { error: "Belum ada peserta yang selesai untuk filter ini." },
      { status: 404 },
    );
  }

  // Pastikan tiap peserta punya payload hasil; hitung lazily bila belum ada.
  // Sengaja dibuat berurutan (bukan Promise.all) supaya tidak membebani
  // koneksi database sekaligus.
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

  for (const s of subs) {
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
    reports.push({ sub: s, payload });
  }

  // 1) Rekap presentasi — nomor halaman dimatikan (akan dinomori ulang
  //    berlanjut untuk seluruh dokumen gabungan).
  const rekapBuf = buildRekapPDF(
    { school, grade, testKind, generatedAt: new Date() },
    rekapRows,
    { showPageNumber: false },
  );

  // 2) Gabungkan: rekap dulu, lalu laporan individu (urut abjad).
  const merged = await PDFDocument.create();

  const rekapDoc = await PDFDocument.load(rekapBuf);
  const rekapPages = await merged.copyPages(rekapDoc, rekapDoc.getPageIndices());
  rekapPages.forEach((p) => merged.addPage(p));

  for (const { sub, payload } of reports) {
    const buf = buildReportPDF(sub, payload, { showPageNumber: false });
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  // 3) Nomor halaman BERLANJUT di seluruh dokumen. Dipasang sebagai chip
  //    hitam kecil di kanan-bawah supaya kontras di halaman rekap
  //    (landscape) maupun laporan individu (portrait).
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const total = merged.getPageCount();
  merged.getPages().forEach((page, i) => {
    const { width } = page.getSize();
    const labelText = `Hal ${i + 1} / ${total}`;
    const size = 8;
    const tw = font.widthOfTextAtSize(labelText, size);
    const padX = 6;
    const boxW = tw + padX * 2;
    const boxH = 13;
    const x = width - 24 - boxW;
    const y = 6;
    page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(0, 0, 0) });
    page.drawText(labelText, { x: x + padX, y: y + 3.5, size, font, color: rgb(1, 1, 1) });
  });

  const out = await merged.save();
  const safe = (school || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30);
  const safeGrade = (grade || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 20);
  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rekap-lengkap-${testKind}-${safe}-${safeGrade}.pdf"`,
    },
  });
}
