import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { ensureResumeCode } from "@/lib/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ambil (atau buatkan) "Kode Lanjut" untuk sesi yang sedang berjalan.
//
// Dipakai TestRules supaya komponen itu bisa menampilkan kodenya sendiri
// tanpa perlu props dari TestHub. Idempoten: kode yang sudah ada TIDAK pernah
// diganti — siswa yang sudah mencatatnya tidak boleh dibuat bingung.
//
// Kalau migrasi 0008 belum di-apply, ensureResumeCode() mengembalikan null dan
// endpoint ini menjawab resumeCode: null. Kotak Kode Lanjut sekadar tidak
// muncul — halaman tes TIDAK BOLEH ikut jatuh karenanya.
export async function GET(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sub = await prisma.submission.findUnique({
    where: { id: student.sub },
    select: { id: true, finishedAt: true },
  });
  if (!sub) {
    return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  }
  // Sudah selesai → tidak ada yang perlu dilanjutkan.
  if (sub.finishedAt) return NextResponse.json({ resumeCode: null });

  const resumeCode = await ensureResumeCode(sub.id);
  return NextResponse.json({ resumeCode });
}
