import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { scoreSubmission } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Untuk batch besar (>50 peserta) panggil endpoint ini berkali-kali — tiap
// call ambil submission yang Result.generatedAt paling lama (atau belum
// ada Result), lalu update generatedAt = sekarang. Akibatnya, call berulang
// otomatis pick batch berbeda sampai semua di-recompute.
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
 *  - limit=N    : maksimum jumlah submission yang di-process per call (max 200)
 *  - testKind=BAKAT|MINAT : filter testKind tertentu
 *  - submissionId=ID      : recompute hanya satu submission tertentu
 *  - before=ISODATE       : hanya rescore submission yang Result.generatedAt
 *                           < ISODATE (atau Result null). Dipakai admin
 *                           panel: cutoff = waktu mulai sesi rescore,
 *                           supaya call berulang berhenti otomatis kalau
 *                           semua submission lama sudah di-rescore.
 *
 * Strategi batching: ambil dulu submission yang BELUM punya Result, lalu
 * yang Result.generatedAt paling lama. Tiap rescore meng-update
 * generatedAt jadi waktu sekarang → submission tersebut "naik" ke akhir
 * antrian.
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
  const beforeParam = url.searchParams.get("before");
  const beforeDate = beforeParam ? new Date(beforeParam) : null;
  const beforeValid = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

  const where: Prisma.SubmissionWhereInput = { finishedAt: { not: null } };
  if (testKind) where.testKind = testKind;
  if (submissionIdParam) where.id = submissionIdParam;
  if (beforeValid) {
    // Submission yang Result.generatedAt < before, ATAU belum punya Result
    // sama sekali. Ini supaya admin bisa "rescore semua data sebelum
    // PR scoring fix di-deploy" dengan satu cutoff.
    where.OR = [
      { result: { is: { generatedAt: { lt: beforeValid } } } },
      { result: { is: null } },
    ];
  }

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

  // Order by Result.generatedAt ASC NULLS FIRST. Prisma tidak punya nulls
  // ordering native, jadi kita pakai 2 query:
  //  1) yang result-nya null (belum pernah di-score) — ambil sebanyak limit
  //  2) sisa quota → yang result.generatedAt paling lama
  // Ini lebih simpel dan deterministik daripada pakai $queryRaw.
  const subsNoResult = await prisma.submission.findMany({
    where: { ...where, result: { is: null } },
    orderBy: { finishedAt: "asc" },
    take: limit,
    select: { id: true, fullName: true, testKind: true },
  });
  const remainingQuota = limit - subsNoResult.length;
  const subsOldResult =
    remainingQuota > 0
      ? await prisma.submission.findMany({
          where: { ...where, result: { isNot: null } },
          orderBy: { result: { generatedAt: "asc" } },
          take: remainingQuota,
          select: { id: true, fullName: true, testKind: true },
        })
      : [];
  const subs = [...subsNoResult, ...subsOldResult];

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
      const now = new Date();
      await prisma.result.upsert({
        where: { submissionId: s.id },
        create: {
          submissionId: s.id,
          payload: payload as unknown as Prisma.InputJsonValue,
          iqEstimate: payload.iqEstimate ?? null,
          topProfiles: topProfiles ?? Prisma.JsonNull,
          topPrograms: topPrograms ?? Prisma.JsonNull,
          generatedAt: now,
        },
        update: {
          payload: payload as unknown as Prisma.InputJsonValue,
          iqEstimate: payload.iqEstimate ?? null,
          topProfiles: topProfiles ?? Prisma.JsonNull,
          topPrograms: topPrograms ?? Prisma.JsonNull,
          // Penting: update generatedAt supaya call berulang tidak
          // memproses submission yang sama dua kali di session ini.
          generatedAt: now,
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
  const iqChanged = results.filter(
    (r) => r.ok && r.oldIq != null && r.newIq != null && r.oldIq !== r.newIq,
  ).length;
  return NextResponse.json({
    processed: results.length,
    ok: okCount,
    failed: failedCount,
    iqChanged,
    totalEligible: total,
    remaining: Math.max(0, total - results.length),
    results,
  });
}
