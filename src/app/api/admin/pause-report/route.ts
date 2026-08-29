import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { isMissingColumnError } from "@/lib/resume";
import { PAUSE_BUDGET_SEC } from "@/lib/subtestLock";
import { CFIT_PAUSE_BUDGET_SEC } from "@/lib/cfit/lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// REKAP JEDA — jawaban untuk audit #7.
//
// Timer sadar-jeda memberi tiap subtes jatah jeda (10 menit untuk minat-bakat,
// 5 menit untuk tes IQ). Jatah itu memang disengaja: mati lampu tidak boleh
// memakan waktu ujian. Tapi konsekuensinya jujur harus diakui — kalau siswa
// MENUTUP TAB, anti-cheat tidak mencatat apa pun, karena pencatatan tab_hidden
// butuh halaman yang masih hidup. Jadi tiap subtes punya jendela "bebas buka
// catatan" yang tidak tercatat sebagai pelanggaran.
//
// pauseCount & pausedSec sudah lama tersimpan, hanya belum pernah
// ditampilkan. Endpoint ini menampilkannya, diurutkan dari jeda TERPANJANG,
// supaya pengawas bisa menilai sendiri mana yang wajar (mati lampu satu kelas)
// dan mana yang mencurigakan (satu siswa jeda 9 menit di tiap subtes).

const KIND = z.enum(["MINAT_BAKAT", "CFIT"]);
type Kind = z.infer<typeof KIND>;

type ProgressLite = {
  submissionId: string;
  subtestId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  finishReason: string | null;
  consumedSec: number;
  lastSeenAt: Date | null;
  pauseCount: number;
  pausedSec: number;
};

type SubtestMeta = { code: string; name: string; durationSec: number; orderIndex: number };

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const kindParsed = KIND.safeParse(sp.get("kind") ?? "MINAT_BAKAT");
  const kind: Kind = kindParsed.success ? kindParsed.data : "MINAT_BAKAT";
  const q = (sp.get("q") ?? "").trim();
  const tokenCode = (sp.get("tokenCode") ?? "").trim().toUpperCase();
  const sort = sp.get("sort") === "recent" ? "recent" : "paused";

  const nameFilter = q ? { fullName: { contains: q, mode: "insensitive" as const } } : {};
  const tokenFilter = tokenCode ? { token: { code: tokenCode } } : {};

  // Kolom jeda datang dari migrasi 0007 (minat-bakat) dan 0009 (tes IQ).
  // Kalau belum di-apply, panel TIDAK BOLEH 500 — kita jatuh ke select
  // cadangan dan memberi tahu pengawas lewat flag pauseColumnsMissing.
  let pauseColumnsMissing = false;

  async function loadProgress(ids: string[]): Promise<ProgressLite[]> {
    if (!ids.length) return [];
    const full = {
      submissionId: true as const,
      subtestId: true as const,
      startedAt: true as const,
      finishedAt: true as const,
      finishReason: true as const,
      consumedSec: true as const,
      lastSeenAt: true as const,
      pauseCount: true as const,
      pausedSec: true as const,
    };
    const lite = {
      submissionId: true as const,
      subtestId: true as const,
      startedAt: true as const,
      finishedAt: true as const,
      finishReason: true as const,
    };
    try {
      const rows =
        kind === "CFIT"
          ? await prisma.cfitSubtestProgress.findMany({
              where: { submissionId: { in: ids } },
              select: full,
            })
          : await prisma.subtestProgress.findMany({
              where: { submissionId: { in: ids } },
              select: full,
            });
      return rows.map((r) => ({
        submissionId: r.submissionId,
        subtestId: r.subtestId,
        startedAt: r.startedAt ?? null,
        finishedAt: r.finishedAt ?? null,
        finishReason: r.finishReason ? String(r.finishReason) : null,
        consumedSec: r.consumedSec ?? 0,
        lastSeenAt: r.lastSeenAt ?? null,
        pauseCount: r.pauseCount ?? 0,
        pausedSec: r.pausedSec ?? 0,
      }));
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      pauseColumnsMissing = true;
      const rows =
        kind === "CFIT"
          ? await prisma.cfitSubtestProgress.findMany({
              where: { submissionId: { in: ids } },
              select: lite,
            })
          : await prisma.subtestProgress.findMany({
              where: { submissionId: { in: ids } },
              select: lite,
            });
      return rows.map((r) => ({
        submissionId: r.submissionId,
        subtestId: r.subtestId,
        startedAt: r.startedAt ?? null,
        finishedAt: r.finishedAt ?? null,
        finishReason: r.finishReason ? String(r.finishReason) : null,
        consumedSec: 0,
        lastSeenAt: null,
        pauseCount: 0,
        pausedSec: 0,
      }));
    }
  }

  type SessionOut = {
    id: string;
    kind: Kind;
    fullName: string | null;
    school: string | null;
    grade: string | null;
    label: string;
    tokenCode: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    violationCount: number;
    flaggedCheating: boolean;
    totalPausedSec: number;
    totalPauseCount: number;
    lockedCount: number;
    subtests: Array<{
      subtestId: string;
      code: string;
      name: string;
      durationSec: number;
      consumedSec: number;
      remainingSec: number;
      pausedSec: number;
      pauseCount: number;
      finishReason: string | null;
      locked: boolean;
      startedAt: string | null;
      lastSeenAt: string | null;
    }>;
  };

  let sessions: SessionOut[] = [];
  let unavailable = false;

  try {
    if (kind === "CFIT") {
      const subs = await prisma.cfitSubmission.findMany({
        where: { ...tokenFilter, ...nameFilter },
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          fullName: true,
          school: true,
          grade: true,
          form: true,
          startedAt: true,
          finishedAt: true,
          violationCount: true,
          flaggedCheating: true,
          token: { select: { code: true } },
        },
      });
      const ids = subs.map((s) => s.id);
      const [progress, metas] = [
        await loadProgress(ids),
        await prisma.cfitSubtest.findMany({
          select: { id: true, code: true, name: true, durationSec: true, orderIndex: true },
        }),
      ];
      const metaById = new Map<string, SubtestMeta>(
        metas.map((m) => [m.id, { code: m.code, name: m.name, durationSec: m.durationSec, orderIndex: m.orderIndex }]),
      );
      sessions = subs.map((s) => {
        const rows = progress.filter((p) => p.submissionId === s.id);
        return buildSession(
          {
            id: s.id,
            fullName: s.fullName,
            school: s.school,
            grade: s.grade,
            label: `TES IQ ${String(s.form).replace("FORM_", "")}`,
            tokenCode: s.token?.code ?? null,
            startedAt: s.startedAt,
            finishedAt: s.finishedAt,
            violationCount: s.violationCount ?? 0,
            flaggedCheating: !!s.flaggedCheating,
          },
          rows,
          metaById,
          "CFIT",
        );
      });
    } else {
      const subs = await prisma.submission.findMany({
        where: { ...tokenFilter, ...nameFilter },
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          fullName: true,
          school: true,
          grade: true,
          testKind: true,
          startedAt: true,
          finishedAt: true,
          violationCount: true,
          flaggedCheating: true,
          token: { select: { code: true } },
        },
      });
      const ids = subs.map((s) => s.id);
      const progress = await loadProgress(ids);
      const metas = await prisma.subtest.findMany({
        select: { id: true, code: true, name: true, durationSec: true, orderIndex: true },
      });
      const metaById = new Map<string, SubtestMeta>(
        metas.map((m) => [m.id, { code: m.code, name: m.name, durationSec: m.durationSec, orderIndex: m.orderIndex }]),
      );
      sessions = subs.map((s) => {
        const rows = progress.filter((p) => p.submissionId === s.id);
        return buildSession(
          {
            id: s.id,
            fullName: s.fullName,
            school: s.school,
            grade: s.grade,
            label: String(s.testKind),
            tokenCode: s.token?.code ?? null,
            startedAt: s.startedAt,
            finishedAt: s.finishedAt,
            violationCount: s.violationCount ?? 0,
            flaggedCheating: !!s.flaggedCheating,
          },
          rows,
          metaById,
          "MINAT_BAKAT",
        );
      });
    }
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    unavailable = true;
    console.warn("[admin/pause-report] tabel/kolom belum tersedia:", err);
  }

  // Urutan bawaan: jeda TERPANJANG di atas — itulah gunanya rekap ini.
  sessions.sort((a, b) =>
    sort === "recent"
      ? (b.startedAt ?? "").localeCompare(a.startedAt ?? "")
      : b.totalPausedSec - a.totalPausedSec ||
        b.totalPauseCount - a.totalPauseCount,
  );

  return NextResponse.json({
    kind,
    sort,
    sessions,
    pauseBudgetSec: kind === "CFIT" ? CFIT_PAUSE_BUDGET_SEC : PAUSE_BUDGET_SEC,
    pauseColumnsMissing,
    unavailable,
  });
}

function buildSession(
  base: {
    id: string;
    fullName: string | null;
    school: string | null;
    grade: string | null;
    label: string;
    tokenCode: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    violationCount: number;
    flaggedCheating: boolean;
  },
  rows: ProgressLite[],
  metaById: Map<string, SubtestMeta>,
  kind: Kind,
) {
  const subtests = rows
    .map((p) => {
      const meta = metaById.get(p.subtestId);
      const durationSec = meta?.durationSec ?? 0;
      return {
        subtestId: p.subtestId,
        code: meta?.code ?? "?",
        name: meta?.name ?? "(subtes tidak dikenal)",
        orderIndex: meta?.orderIndex ?? 999,
        durationSec,
        consumedSec: p.consumedSec,
        remainingSec: Math.max(0, durationSec - p.consumedSec),
        pausedSec: p.pausedSec,
        pauseCount: p.pauseCount,
        finishReason: p.finishReason,
        locked: !!p.finishedAt,
        startedAt: p.startedAt ? p.startedAt.toISOString() : null,
        lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(({ orderIndex: _orderIndex, ...rest }) => rest);

  return {
    id: base.id,
    kind,
    fullName: base.fullName,
    school: base.school,
    grade: base.grade,
    label: base.label,
    tokenCode: base.tokenCode,
    startedAt: base.startedAt ? base.startedAt.toISOString() : null,
    finishedAt: base.finishedAt ? base.finishedAt.toISOString() : null,
    violationCount: base.violationCount,
    flaggedCheating: base.flaggedCheating,
    totalPausedSec: subtests.reduce((n, s) => n + s.pausedSec, 0),
    totalPauseCount: subtests.reduce((n, s) => n + s.pauseCount, 0),
    lockedCount: subtests.filter((s) => s.locked).length,
    subtests,
  };
}
