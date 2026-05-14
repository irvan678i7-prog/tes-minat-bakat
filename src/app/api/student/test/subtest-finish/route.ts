import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { computeSubtestLock } from "@/lib/subtestLock";

const Body = z.object({
  subtestCode: z.string().min(1),
  reason: z.enum(["MANUAL", "TIME_UP"]).default("MANUAL"),
});

// Tandai subtes selesai secara eksplisit (siswa klik tombol Selesai atau
// runner mendeteksi timer habis). Idempoten — kalau sudah dikunci, balikan
// status saat ini tanpa error.
export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const sub = await prisma.submission.findUnique({ where: { id: student.sub } });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) {
    return NextResponse.json({ ok: true, locked: true, alreadyFinished: true });
  }

  const subtest = await prisma.subtest.findUnique({
    where: { code: parsed.data.subtestCode },
  });
  if (!subtest || subtest.testKind !== sub.testKind) {
    return NextResponse.json({ error: "Subtest tidak valid" }, { status: 400 });
  }

  // Lazy compute (akan set TIME_UP otomatis kalau sudah lewat deadline).
  const lock = await computeSubtestLock({
    submissionId: sub.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });
  if (lock.locked) {
    return NextResponse.json({
      ok: true,
      locked: true,
      finishedAt: lock.finishedAt,
      finishReason: lock.finishReason,
    });
  }

  // Kunci secara manual. Pakai updateMany + filter finishedAt:null supaya
  // race dengan TIME_UP tidak menimpa.
  const now = new Date();
  const updated = await prisma.subtestProgress.updateMany({
    where: { submissionId: sub.id, subtestId: subtest.id, finishedAt: null },
    data: { finishedAt: now, finishReason: parsed.data.reason },
  });
  if (updated.count === 0) {
    // Kemungkinan progress belum pernah dibuat (siswa belum buka subtes,
    // tapi tetap klik finish?). Buat ulang dengan finishedAt langsung.
    await prisma.subtestProgress.upsert({
      where: { submissionId_subtestId: { submissionId: sub.id, subtestId: subtest.id } },
      create: {
        submissionId: sub.id,
        subtestId: subtest.id,
        startedAt: now,
        finishedAt: now,
        finishReason: parsed.data.reason,
      },
      update: { finishedAt: now, finishReason: parsed.data.reason },
    });
  }

  return NextResponse.json({
    ok: true,
    locked: true,
    finishedAt: now.toISOString(),
    finishReason: parsed.data.reason,
  });
}
