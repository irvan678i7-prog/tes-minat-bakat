import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStudentFromRequest, STUDENT_COOKIE } from "@/lib/auth";
import { gradeAnswers, scoreSubmission } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) return NextResponse.json({ ok: true, alreadyFinished: true });

  await prisma.submission.update({
    where: { id: sub.id },
    data: { finishedAt: new Date() },
  });

  await gradeAnswers(sub.id);
  const payload = await scoreSubmission(sub.id);
  const topProfiles = payload.bakat?.topProfiles.map((p) => p.name);
  const topPrograms = payload.minat?.programs.map((p) => p.bidang);

  await prisma.result.upsert({
    where: { submissionId: sub.id },
    create: {
      submissionId: sub.id,
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

  const res = NextResponse.json({ ok: true });
  // Sign out the student session — they cannot redo the test.
  res.cookies.set(STUDENT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
