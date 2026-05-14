import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

// Endpoint admin untuk edit / hapus 1 soal individu lewat halaman "Preview
// Bank Soal" di panel admin. Skema PATCH menerima semua field yang aman
// diubah; `correct` & `options` divalidasi dengan z.unknown() lalu disimpan
// apa adanya sebagai JSON.

const OptionItem = z.object({
  key: z.string().min(1).max(4),
  label: z.string().default(""),
  imageUrl: z.string().optional(),
});

const PatchBody = z.object({
  prompt: z.string().max(8000).optional(),
  imageUrl: z.string().nullable().optional(),
  imageUrl2: z.string().nullable().optional(),
  parts: z.number().int().min(1).max(24).optional(),
  isExample: z.boolean().optional(),
  inputMode: z.enum(["CHOICE", "TEXT"]).optional(),
  questionNo: z.number().int().min(1).optional(),
  scoringTag: z.string().nullable().optional(),
  // options diterima sebagai array OptionItem (CHOICE) atau object dengan
  // partImages (3D / SISTEMATIS) — pakai unknown supaya bentuk apapun lewat.
  options: z.unknown().optional(),
  // correct: string (single CHOICE/TEXT), array (parts>1), atau apa pun yang
  // sesuai bentuk yang sudah ada di DB.
  correct: z.unknown().optional(),
  partLabels: z.array(z.string()).nullable().optional(),
});

function normalizeCorrect(raw: unknown, parts: number, inputMode: "CHOICE" | "TEXT"): unknown {
  // CHOICE: huruf di-uppercase (A/B/C). Array kalau parts>1, string kalau parts<=1.
  if (inputMode === "CHOICE") {
    if (Array.isArray(raw)) {
      return raw.map((v) => String(v ?? "").trim().toUpperCase());
    }
    if (raw == null) return parts > 1 ? Array.from({ length: parts }, () => "") : "";
    return String(raw).trim().toUpperCase();
  }
  // TEXT: simpan apa adanya (case sensitive — siswa input bebas).
  if (Array.isArray(raw)) return raw.map((v) => String(v ?? ""));
  if (raw == null) return parts > 1 ? Array.from({ length: parts }, () => "") : "";
  return String(raw);
}

function normalizeOptions(raw: unknown): unknown {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((o) => OptionItem.safeParse(o))
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: z.infer<typeof OptionItem> }).data);
  }
  // Untuk struktur seperti { partImages: [...] }, simpan apa adanya.
  return raw;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; questionId: string }> },
) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, questionId } = await ctx.params;
  const existing = await prisma.question.findUnique({ where: { id: questionId } });
  if (!existing || existing.subtestId !== id) {
    return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Input tidak valid: ${parsed.error.issues.map((i) => i.message).join(", ")}` },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const nextParts = body.parts ?? existing.parts;
  const nextInputMode =
    (body.inputMode ?? (existing.inputMode === "TEXT" ? "TEXT" : "CHOICE")) as "CHOICE" | "TEXT";

  const data: Prisma.QuestionUpdateInput = {};
  if (body.prompt !== undefined) data.prompt = body.prompt;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl || null;
  if (body.imageUrl2 !== undefined) data.imageUrl2 = body.imageUrl2 || null;
  if (body.parts !== undefined) data.parts = nextParts;
  if (body.isExample !== undefined) data.isExample = body.isExample;
  if (body.inputMode !== undefined) data.inputMode = nextInputMode;
  if (body.questionNo !== undefined) data.questionNo = body.questionNo;
  if (body.scoringTag !== undefined) data.scoringTag = body.scoringTag || null;
  if (body.options !== undefined) {
    data.options = normalizeOptions(body.options) as Prisma.InputJsonValue;
  }
  if (body.correct !== undefined) {
    data.correct = normalizeCorrect(body.correct, nextParts, nextInputMode) as Prisma.InputJsonValue;
  }
  if (body.partLabels !== undefined) {
    if (body.partLabels === null) {
      data.partLabels = Prisma.JsonNull;
    } else {
      data.partLabels = body.partLabels as Prisma.InputJsonValue;
    }
  }

  try {
    const updated = await prisma.question.update({ where: { id: questionId }, data });
    return NextResponse.json({ ok: true, question: updated });
  } catch (e) {
    // Unique constraint (subtestId, questionNo, isExample) berpotensi bentrok
    // saat admin ubah questionNo / isExample ke nilai yang sudah dipakai.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Nomor soal bentrok dengan soal lain pada subtes ini. Pilih nomor yang berbeda atau ubah status contoh/real.",
        },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Gagal menyimpan: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; questionId: string }> },
) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, questionId } = await ctx.params;
  const existing = await prisma.question.findUnique({ where: { id: questionId } });
  if (!existing || existing.subtestId !== id) {
    return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });
  }

  // Cascade akan ikut menghapus Answer.
  await prisma.question.delete({ where: { id: questionId } });
  return NextResponse.json({ ok: true });
}
