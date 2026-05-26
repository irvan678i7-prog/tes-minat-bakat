import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { scoreSubmission } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby plan max 10 detik. Untuk batch besar (>30 peserta) panggil
// endpoint ini berkali-kali — `dryRun=true` untuk lihat berapa yang akan
// di-recompute, lalu pakai `limit` untuk membatasi per-call.
export const maxDuration = 60;

/**
 * Recompute Result.payload untuk semua submission yang sudah finished.
 * Dipakai untuk MEMPERBAIKI hasil yang tersimpan dengan formula skoring
 * lama (di mana max dihitung dari soal yang dijawab saja, bukan dari
 * total bank soal) → menyebabkan IQ inflasi untuk peserta yang skip
 * sebagian soal.
 *
 * Query params:
 *  - dryRun=1   : hanya hitung berapa banyak yang akan di-recompute
 *  - limit=N    : maksimum jumlah submission yang di-process per call
 *  - testKind=BAKAT|MINAT : filter testKind tertentu
 *  - submissionId=ID      : recompute hanya satu submission tertentu
 */
export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const limitParam = Number(url.searchParams.get("limit") || 0);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  const testKindParam = url.searchParams.get("testKind");
  const testKind: "MINAT" | "BAKAT" | null =
    testKindParam === "MINAT" || testKindParam === "BAKAT" ? testKindParam : null;
  const submissionIdParam = url.searchParams.get("submissionId");

  const where: {
    finishedAt: { not: null };
    testKind?: "MINAT" | "BAKAT";
    id?: string;
  } = { finishedAt: { not: null } };
  if (testKind) where.testKind = testKind;
  if (submissionIdParam) where.id = submissionIdParam;

  const total = await prisma.submission.count({ where });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalEligible: total,
      limit,
      hint:
        total === 0
          ? "Tidak ada submission yang memenuhi filter."
          : `${total} submission akan di-recompute. Hapus dryRun untuk eksekusi.`,
    });
  }

  const subs = await prisma.submission.findMany({
    where,
    orderBy: { finishedAt: "desc" },
    take: limit,
    select: { id: true, fullName: true, testKind: true },
  });

  const results: {
    submissionId: string;
    fullName: string | null;
    testKind: "MINAT" | "BAKAT";
    ok: boolean;
    oldIq: number | null;
    newIq: number | null;
    error?: string;
  }[] = [];

  for (const s of subs) {
    try {
      const old = await prisma.result.findUnique({
        where: { submissionId: s.id },
        select: { iqEstimate: true },
      });
      const payload = await scoreSubmission(s.id);
      const topProfiles = payload.bakat?.topProfiles.map((p) => p.name);
      const topPrograms = payload.minat?.programs.map((p) => p.bidang);
      await prisma.result.upsert({
        where: { submissionId: s.id },
        create: {
          submissionId: s.id,
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
      results.push({
        submissionId: s.id,
        fullName: s.fullName,
        testKind: s.testKind,
        ok: true,
        oldIq: old?.iqEstimate ?? null,
        newIq: payload.iqEstimate ?? null,
      });
    } catch (e) {
      results.push({
        submissionId: s.id,
        fullName: s.fullName,
        testKind: s.testKind,
        ok: false,
        oldIq: null,
        newIq: null,
        error: e instanceof Error ? e.message.slice(0, 200) : "Unknown error",
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - okCount;
  return NextResponse.json({
    processed: results.length,
    ok: okCount,
    failed: failedCount,
    totalEligible: total,
    remaining: Math.max(0, total - results.length),
    results,
  });
}
