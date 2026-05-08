import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { buildRekapPDF } from "@/lib/pdf-rekap";
import { scoreSubmission, type ScoringPayload } from "@/lib/scoring";

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
    orderBy: [{ school: "asc" }, { grade: "asc" }, { fullName: "asc" }],
    include: { result: true },
  });

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
    { school, grade, testKind, generatedAt: new Date() },
    rows,
  );
  const safe = (school || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30);
  const safeGrade = (grade || "semua").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 20);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rekap-${testKind}-${safe}-${safeGrade}.pdf"`,
    },
  });
}
