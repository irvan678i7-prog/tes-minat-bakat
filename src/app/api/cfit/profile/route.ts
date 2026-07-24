import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCfitFromRequest } from "@/lib/cfit/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  fullName: z.string().min(1).max(120),
  gender: z.enum(["L", "P"]).optional(),
  birthPlace: z.string().max(120).optional(),
  birthDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  age: z.number().int().min(5).max(99).optional(),
  grade: z.string().max(60).optional(),
  school: z.string().max(160).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(160).optional(),
});

export async function GET(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = await prisma.cfitSubmission.findUnique({ where: { id: p.sub } });
  if (!s) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  return NextResponse.json({
    fullName: s.fullName,
    gender: s.gender,
    birthPlace: s.birthPlace,
    birthDate: s.birthDate,
    age: s.age,
    grade: s.grade,
    school: s.school,
    phone: s.phone,
    email: s.email,
    form: s.form,
    finishedAt: s.finishedAt,
  });
}

export async function POST(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

  const d = parsed.data;
  const submission = await prisma.cfitSubmission.update({
    where: { id: p.sub },
    data: {
      fullName: d.fullName,
      gender: d.gender,
      birthPlace: d.birthPlace,
      birthDate: d.birthDate ? new Date(d.birthDate) : undefined,
      age: d.age,
      grade: d.grade,
      school: d.school,
      phone: d.phone,
      email: d.email,
    },
  });

  // Norma yang tersedia saat ini: usia 17 tahun ke atas. Usia < 17 tetap
  // boleh mengerjakan, tapi beri peringatan agar hasil ditafsirkan hati-hati.
  const normWarning =
    typeof d.age === "number" && d.age < 17
      ? "Norma IQ yang tersedia saat ini untuk usia 17 tahun ke atas. Hasil peserta di bawah 17 tahun perlu ditafsirkan dengan hati-hati."
      : null;

  return NextResponse.json({ ok: true, submissionId: submission.id, normWarning });
}
