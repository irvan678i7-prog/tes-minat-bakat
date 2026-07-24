import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kelola bank soal CFIT (terpisah dari bank soal minat-bakat).
// GET  ?subtest=3A_SERIES  → daftar soal subtes itu (termasuk kunci — admin).
// POST { subtestCode, questionNo, ... }  → buat / perbarui soal (upsert).
// DELETE ?id=...  → hapus soal.

const UpsertBody = z.object({
  subtestCode: z.string().min(1),
  questionNo: z.number().int().min(1).max(200),
  prompt: z.string().max(2000).default(""),
  imageUrl: z.string().url().max(1000).nullable().optional(),
  options: z.array(z.string().min(1).max(40)).min(2).max(8),
  correct: z.union([z.string().min(1).max(40), z.array(z.string().min(1).max(40)).min(1).max(8)]),
  isExample: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subtestCode = searchParams.get("subtest");

  if (subtestCode) {
    const subtest = await prisma.cfitSubtest.findUnique({
      where: { code: subtestCode },
      include: { questions: { orderBy: [{ isExample: "desc" }, { questionNo: "asc" }] } },
    });
    if (!subtest) return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ subtest });
  }

  // Tanpa filter → ringkasan jumlah soal per subtes (untuk dashboard admin).
  const subtests = await prisma.cfitSubtest.findMany({
    orderBy: { orderIndex: "asc" },
    include: {
      _count: { select: { questions: true } },
    },
  });
  return NextResponse.json({
    subtests: subtests.map((s) => ({
      code: s.code,
      form: s.form,
      name: s.name,
      durationSec: s.durationSec,
      orderIndex: s.orderIndex,
      questionCount: s._count.questions,
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = UpsertBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid", detail: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const subtest = await prisma.cfitSubtest.findUnique({ where: { code: d.subtestCode } });
  if (!subtest) return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });

  // Validasi: semua kunci harus ada di daftar opsi.
  const correctArr = Array.isArray(d.correct) ? d.correct : [d.correct];
  const invalid = correctArr.filter((c) => !d.options.includes(c));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Kunci jawaban tidak ada di opsi: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const question = await prisma.cfitQuestion.upsert({
    where: {
      subtestId_questionNo_isExample: {
        subtestId: subtest.id,
        questionNo: d.questionNo,
        isExample: d.isExample,
      },
    },
    create: {
      subtestId: subtest.id,
      questionNo: d.questionNo,
      prompt: d.prompt,
      imageUrl: d.imageUrl ?? null,
      options: d.options,
      correct: d.correct,
      isExample: d.isExample,
    },
    update: {
      prompt: d.prompt,
      imageUrl: d.imageUrl ?? null,
      options: d.options,
      correct: d.correct,
    },
  });

  return NextResponse.json({ ok: true, question });
}

export async function DELETE(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Parameter id wajib" }, { status: 400 });

  await prisma.cfitQuestion.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
