import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";

const Body = z.object({
  fullName: z.string().min(1),
  gender: z.string().min(1),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  age: z.number().int().min(5).max(99).optional(),
  grade: z.string().optional(),
  school: z.string().min(1),
  major: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  const sub = await prisma.submission.update({
    where: { id: student.sub },
    data: {
      fullName: d.fullName,
      gender: d.gender,
      birthPlace: d.birthPlace || null,
      birthDate: d.birthDate ? new Date(d.birthDate) : null,
      age: d.age || null,
      grade: d.grade || null,
      school: d.school,
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
  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  return NextResponse.json({ submission: sub });
}
