import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kelola bank soal CFIT (terpisah dari bank soal minat-bakat).
// Opsi jawaban CFIT berupa GAMBAR: { key: "a", label?: "", imageUrl?: "https://..." }.
// GET  ?subtest=3A_SERIES  → daftar soal subtes itu (termasuk kunci — admin).
// POST { subtestCode, questionNo, ... }  → buat / perbarui soal (upsert; kirim `id` untuk edit langsung).
// DELETE ?id=...  → hapus soal.

const OptionObj = z.object({
  key: z.string().min(1).max(4),
  label: z.string().max(200).optional().default(""),
  imageUrl: z.string().url().max(1000).nullable().optional(),
});

const UpsertBody = z.object({
  id: z.string().min(1).optional(),
  subtestCode: z.string().min(1),
  questionNo: z.number().int().min(1).max(200),
  prompt: z.string().max(2000).default(""),
  imageUrl: z.string().url().max(1000).nullable().optional(),
  options: z.array(z.union([z.string().min(1).max(40), OptionObj])).min(2).max(8),
  correct: z.union([z.string().min(1).max(40), z.array(z.string().min(1).max(40)).min(1).max(8)]),
  isExample: z.boolean().default(false),
});

type NormOption = { key: string; label: string; imageUrl: string | null };

function normalizeOptions(raw: Array<string | z.infer<typeof OptionObj>>): NormOption[] {
  return raw.map((o) =>
    typeof o === "string"
      ? { key: o.trim().toLowerCase(), label: "", imageUrl: null }
      : {
          key: o.key.trim().toLowerCase(),
          label: o.label ?? "",
          imageUrl: o.imageUrl ? String(o.imageUrl) : null,
        },
  );
}

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

  const options = normalizeOptions(d.options);
  const keys = options.map((o) => o.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) {
    return NextResponse.json({ error: `Huruf opsi duplikat: ${[...new Set(dupes)].join(", ")}` }, { status: 400 });
  }

  // Validasi: semua kunci harus ada di daftar opsi.
  const correctArr = (Array.isArray(d.correct) ? d.correct : [d.correct]).map((c) => c.trim().toLowerCase());
  const invalid = correctArr.filter((c) => !keys.includes(c));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Kunci jawaban tidak ada di opsi: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }
  const correct = correctArr.length === 1 ? correctArr[0] : correctArr;

  try {
    const question = d.id
      ? await prisma.cfitQuestion.update({
          where: { id: d.id },
          data: {
            questionNo: d.questionNo,
            prompt: d.prompt,
            imageUrl: d.imageUrl ?? null,
            options,
            correct,
            isExample: d.isExample,
          },
        })
      : await prisma.cfitQuestion.upsert({
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
            options,
            correct,
            isExample: d.isExample,
          },
          update: {
            prompt: d.prompt,
            imageUrl: d.imageUrl ?? null,
            options,
            correct,
          },
        });
    return NextResponse.json({ ok: true, question });
  } catch {
    return NextResponse.json(
      { error: "Gagal menyimpan — kemungkinan nomor soal tersebut sudah dipakai soal lain." },
      { status: 409 },
    );
  }
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
