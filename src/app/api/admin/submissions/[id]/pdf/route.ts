import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { buildReportPDF } from "@/lib/pdf";
import { scoreSubmission, type ScoringPayload } from "@/lib/scoring";

// PDF generation pakai jspdf (Node-only API) — paksa Node runtime, jangan
// kena edge runtime fallback. `dynamic = force-dynamic` supaya Next tidak
// coba cache response sebagai static.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby plan max 10 detik. Route ini cepat karena `Result` di-cache
// saat siswa menyelesaikan tes (lihat `api/student/test/finish/route.ts`),
// jadi GET PDF tidak perlu re-score — hanya render PDF dari payload.
export const maxDuration = 10;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sub = await prisma.submission.findUnique({
    where: { id },
    include: { result: true },
  });
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });

  let payload: ScoringPayload;
  if (sub.result?.payload) {
    payload = sub.result.payload as unknown as ScoringPayload;
  } else {
    payload = await scoreSubmission(sub.id);
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
  }

  const buf = buildReportPDF(sub, payload);
  const fileSafe = (sub.fullName || sub.id).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="laporan-${sub.testKind}-${fileSafe}.pdf"`,
    },
  });
}
