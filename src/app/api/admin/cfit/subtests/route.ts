import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kelola subtes CFIT (tab Bank Soal IQ).
// GET   → daftar subtes + jumlah soal & contoh (untuk tabel bank soal).
// PATCH { code, instructions?, durationSec? } → ubah instruksi / waktu subtes.

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subtests = await prisma.cfitSubtest.findMany({
    orderBy: { orderIndex: "asc" },
    include: { questions: { select: { isExample: true } } },
  });

  return NextResponse.json({
    subtests: subtests.map((s) => ({
      id: s.id,
      code: s.code,
      form: s.form,
      name: s.name,
      description: s.description,
      instructions: s.instructions,
      durationSec: s.durationSec,
      orderIndex: s.orderIndex,
      questionCount: s.questions.filter((q) => !q.isExample).length,
      exampleCount: s.questions.filter((q) => q.isExample).length,
    })),
  });
}

const PatchBody = z.object({
  code: z.string().min(1),
  instructions: z.string().max(4000).optional(),
  durationSec: z.number().int().min(30).max(3600).optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { code, instructions, durationSec } = parsed.data;

  const subtest = await prisma.cfitSubtest.findUnique({ where: { code } });
  if (!subtest) return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });

  const updated = await prisma.cfitSubtest.update({
    where: { code },
    data: {
      ...(instructions !== undefined ? { instructions } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
    },
  });

  return NextResponse.json({ ok: true, subtest: { code: updated.code, instructions: updated.instructions, durationSec: updated.durationSec } });
}
