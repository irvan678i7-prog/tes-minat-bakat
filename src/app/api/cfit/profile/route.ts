import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCfitFromRequest } from "@/lib/cfit/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  fullName: z.string().min(1).max(120),
  nis: z.string().max(30).optional(),
  gender: z.enum(["L", "P"]).optional(),
  birthPlace: z.string().max(120).optional(),
  birthDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  age: z.number().int().min(5).max(99).optional(),
  grade: z.string().max(60).optional(),
  school: z.string().max(160).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(160).optional(),
});

// Usia dihitung SERVER-SIDE dari tanggal lahir terhadap tanggal tes.
// Nilai `age` kiriman klien hanya fallback.
function computeAgeAt(birth: Date, ref: Date): number | null {
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 130) return null;
  return age;
}

function cleanOrNull(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

export async function GET(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = await prisma.cfitSubmission.findUnique({
    where: { id: p.sub },
    include: { token: { select: { school: true, grade: true } } },
  });
  if (!s) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });

  // Sekolah & kelas milik SESI TES (ditempel admin di token). Kalau token
  // sudah membawanya, peserta tidak boleh mengetik sendiri — supaya tulisan
  // seragam untuk semua peserta dan filter rekap tidak pecah.
  const tokenSchool = cleanOrNull(s.token?.school);
  const tokenGrade = cleanOrNull(s.token?.grade);

  return NextResponse.json({
    fullName: s.fullName,
    nis: s.nis,
    gender: s.gender,
    birthPlace: s.birthPlace,
    birthDate: s.birthDate,
    age: s.age,
    grade: tokenGrade ?? s.grade,
    school: tokenSchool ?? s.school,
    schoolLocked: tokenSchool != null,
    gradeLocked: tokenGrade != null,
    phone: s.phone,
    email: s.email,
    form: s.form,
    finishedAt: s.finishedAt,
    // Tanggal tes = saat PESERTA INI redeem token (submission dibuat saat
    // redeem). Jangan pakai token.redeemedAt: itu waktu redeem PERTAMA se-
    // token (token kelas dipakai banyak peserta, bisa beda hari).
    testDate: s.startedAt,
  });
}

export async function POST(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

  const d = parsed.data;

  const sub = await prisma.cfitSubmission.findUnique({
    where: { id: p.sub },
    include: { token: { select: { school: true, grade: true } } },
  });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  // Biodata dikunci setelah tes selesai — mencegah identitas diganti-ganti
  // setelah hasil terbit.
  if (sub.finishedAt) {
    return NextResponse.json({ error: "Tes sudah diselesaikan — biodata tidak bisa diubah lagi." }, { status: 409 });
  }

  const testDate = sub.startedAt;

  // Usia otomatis dari tanggal lahir (dihitung terhadap tanggal tes).
  let age = d.age;
  if (d.birthDate) {
    const computed = computeAgeAt(new Date(d.birthDate), testDate);
    if (computed == null || computed < 5 || computed > 99) {
      return NextResponse.json({ error: "Tanggal lahir tidak valid" }, { status: 400 });
    }
    age = computed;
  }

  // Nilai dari token selalu menang atas kiriman klien.
  const tokenSchool = cleanOrNull(sub.token?.school);
  const tokenGrade = cleanOrNull(sub.token?.grade);
  const school = tokenSchool ?? d.school;
  const grade = tokenGrade ?? d.grade;

  const submission = await prisma.cfitSubmission.update({
    where: { id: p.sub },
    data: {
      fullName: d.fullName,
      nis: d.nis,
      gender: d.gender,
      birthPlace: d.birthPlace,
      birthDate: d.birthDate ? new Date(d.birthDate) : undefined,
      age,
      grade,
      school,
      phone: d.phone,
      email: d.email,
    },
  });

  // Norma yang tersedia saat ini: usia 17 tahun ke atas. Usia < 17 tetap
  // boleh mengerjakan, tapi beri peringatan agar hasil ditafsirkan hati-hati.
  const normWarning =
    typeof age === "number" && age < 17
      ? "Norma IQ yang tersedia saat ini untuk usia 17 tahun ke atas. Hasil peserta di bawah 17 tahun perlu ditafsirkan dengan hati-hati."
      : null;

  return NextResponse.json({ ok: true, submissionId: submission.id, age, normWarning });
}
