import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";

const Body = z.object({
  fullName: z.string().min(1),
  gender: z.string().min(1),
  jenjang: z.enum(["SMP", "SMA", "SMK"]),
  birthPlace: z.string().optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal lahir harus format YYYY-MM-DD")
    .refine((s) => !Number.isNaN(new Date(s).getTime()), "Tanggal lahir tidak valid")
    .optional()
    .or(z.literal("")),
  age: z.number().int().min(5).max(99).optional(),
  grade: z.string().optional(),
  school: z.string().min(1),
  major: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

// Nama sekolah dari token (opsional, diisi admin saat membuat token) selalu
// menang atas ketikan siswa — supaya semua peserta satu token punya tulisan
// yang identik. Kalau token tidak membawa sekolah, perilaku lama dipakai:
// nama sekolah murni dari isian siswa.
function cleanOrEmpty(v: string | null | undefined): string {
  return (v ?? "").trim();
}

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  const current = await prisma.submission.findUnique({
    where: { id: student.sub },
    select: { id: true, token: { select: { school: true } } },
  });
  if (!current) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  const tokenSchool = cleanOrEmpty(current.token?.school);
  const sub = await prisma.submission.update({
    where: { id: student.sub },
    data: {
      fullName: d.fullName,
      gender: d.gender,
      jenjang: d.jenjang,
      birthPlace: d.birthPlace || null,
      birthDate: d.birthDate ? new Date(d.birthDate) : null,
      age: d.age || null,
      grade: d.grade || null,
      school: tokenSchool || d.school,
      major: d.major || null,
      phone: d.phone || null,
      email: d.email || null,
    },
  });
  return NextResponse.json({ ok: true, submissionId: sub.id });
}

export async function GET(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sub = await prisma.submission.findUnique({
    where: { id: student.sub },
    select: {
      id: true,
      testKind: true,
      fullName: true,
      gender: true,
      jenjang: true,
      birthPlace: true,
      birthDate: true,
      age: true,
      grade: true,
      school: true,
      major: true,
      phone: true,
      email: true,
      finishedAt: true,
      token: { select: { school: true } },
    },
  });
  if (!sub) return NextResponse.json({ submission: null });
  const { token, ...rest } = sub;
  const tokenSchool = cleanOrEmpty(token?.school);
  return NextResponse.json({
    submission: {
      ...rest,
      school: tokenSchool || rest.school,
      // true → nama sekolah sudah ditetapkan admin lewat token, tidak perlu
      // (dan tidak akan) diubah oleh isian siswa.
      schoolLocked: tokenSchool.length > 0,
    },
  });
}
