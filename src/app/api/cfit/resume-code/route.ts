import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCfitFromRequest } from "@/lib/cfit/auth";
import { ensureCfitResumeCode } from "@/lib/cfit/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ambil (atau buatkan) "Kode Lanjut" untuk sesi tes IQ yang sedang berjalan.
// Dipakai banner di halaman hub /cfit/test.
//
// Idempoten: kode yang sudah ada tidak pernah diganti. Kalau migrasi 0009
// belum di-apply, endpoint ini menjawab resumeCode: null (banner sekadar
// tidak muncul) — bukan error.
export async function GET(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const submission = await prisma.cfitSubmission.findUnique({
    where: { id: p.sub },
    select: { id: true, finishedAt: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  }
  // Sesi sudah selesai → tidak ada yang perlu dilanjutkan.
  if (submission.finishedAt) return NextResponse.json({ resumeCode: null });

  const resumeCode = await ensureCfitResumeCode(submission.id);
  return NextResponse.json({ resumeCode });
}
