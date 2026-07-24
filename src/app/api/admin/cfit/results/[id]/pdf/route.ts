import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { buildCfitReportPDF } from "@/lib/cfit/pdf";

// PDF pakai jspdf (Node-only) — paksa Node runtime & non-static, sama seperti
// rute PDF minat-bakat (api/admin/submissions/[id]/pdf).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const sub = await prisma.cfitSubmission.findUnique({ where: { id } });
  if (!sub) return NextResponse.json({ error: "Peserta tidak ditemukan" }, { status: 404 });

  // Hasil dihitung & disimpan saat peserta menyelesaikan tes (api/cfit/test/finish).
  const result = await prisma.cfitResult.findUnique({ where: { submissionId: id } });
  if (!result) {
    return NextResponse.json(
      { error: "Hasil belum tersedia — peserta belum menyelesaikan tes." },
      { status: 409 },
    );
  }

  const buf = buildCfitReportPDF(sub, result);
  const fileSafe = (sub.fullName || sub.id).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="laporan-IQ-CFIT-${fileSafe}.pdf"`,
    },
  });
}
