import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { ensureSubtestStarted } from "@/lib/subtestLock";

const Body = z.object({
  subtestCode: z.string().min(1),
});

// Tandai subtes DIMULAI secara eksplisit — dipanggil saat siswa menekan
// tombol "MULAI" di layar instruksi/contoh soal. Membuka halaman subtes saja
// TIDAK lagi memulai timer; pemicunya adalah endpoint ini. Idempoten: kalau
// subtes sudah dimulai/dikunci, kembalikan status saat ini tanpa mengubah
// startedAt.
export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [sub, subtest] = await Promise.all([
    prisma.submission.findUnique({ where: { id: student.sub } }),
    prisma.subtest.findUnique({ where: { code: parsed.data.subtestCode } }),
  ]);
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (sub.finishedAt) {
    return NextResponse.json({ ok: true, locked: true, alreadyFinished: true });
  }
  if (!subtest || subtest.testKind !== sub.testKind) {
    return NextResponse.json({ error: "Subtest tidak valid" }, { status: 400 });
  }

  const info = await ensureSubtestStarted({
    submissionId: sub.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });

  return NextResponse.json({
    ok: true,
    locked: info.locked,
    startedAt: info.startedAt ? info.startedAt.toISOString() : null,
    finishedAt: info.finishedAt ? info.finishedAt.toISOString() : null,
    finishReason: info.finishReason,
  });
}
