import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

type Row = {
  subtestCode?: string;
  questionNo?: number | string;
  prompt?: string;
  imageUrl?: string;
  parts?: number | string;
  optionA?: string; optionB?: string; optionC?: string; optionD?: string;
  optionE?: string; optionF?: string; optionG?: string; optionH?: string;
  optionI?: string; optionJ?: string; optionK?: string; optionL?: string;
  optionM?: string; optionN?: string; optionO?: string; optionP?: string;
  optionQ?: string; optionR?: string; optionS?: string; optionT?: string;
  optionU?: string; optionV?: string; optionW?: string; optionX?: string;
  correctAnswer?: string;     // for parts=1: "A"; for parts>1: "A;B;C" or "A,B,C"
  scoringTag?: string;
};

type ParsedQuestion = {
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  parts: number;
  options: { key: string; label: string }[];
  correct: string | string[];
  scoringTag: string | null;
};

function parseRow(r: Row, fallbackNo: number): ParsedQuestion {
  const opts: { key: string; label: string }[] = [];
  const optionKeys = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");
  for (const k of optionKeys) {
    const val = (r as Record<string, unknown>)[`option${k}`];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      opts.push({ key: k, label: String(val) });
    }
  }
  const parts = Number(r.parts ?? 1) || 1;
  const correctStr = String(r.correctAnswer ?? "").trim();
  const correct: string | string[] =
    parts > 1
      ? correctStr.split(/[,;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
      : correctStr.toUpperCase();
  return {
    questionNo: Number(r.questionNo ?? fallbackNo) || fallbackNo,
    prompt: String(r.prompt ?? ""),
    imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    parts,
    options: opts,
    correct,
    scoringTag: r.scoringTag ? String(r.scoringTag) : null,
  };
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File required" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const wsName = wb.SheetNames[0];
  if (!wsName) return NextResponse.json({ error: "Workbook kosong" }, { status: 400 });
  const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wsName], { defval: "" });

  // Group by subtestCode
  const grouped: Record<string, Row[]> = {};
  for (const r of rows) {
    if (!r.subtestCode) continue;
    const code = String(r.subtestCode).trim();
    if (!grouped[code]) grouped[code] = [];
    grouped[code].push(r);
  }

  // Validate semua subtestCode lebih dulu (di luar transaksi) supaya tidak
  // melakukan delete sebelum tahu semua referensi valid.
  const codes = Object.keys(grouped);
  const subtests = await prisma.subtest.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const subtestByCode = new Map(subtests.map((s) => [s.code, s]));
  const unknownCodes = codes.filter((c) => !subtestByCode.has(c));

  // Build seluruh paket operasi — parsing tidak punya side-effect.
  const txGroups: {
    subtestCode: string;
    subtestId: string;
    parsed: ParsedQuestion[];
  }[] = [];
  for (const [code, list] of Object.entries(grouped)) {
    const subtest = subtestByCode.get(code);
    if (!subtest) continue;
    txGroups.push({
      subtestCode: code,
      subtestId: subtest.id,
      parsed: list.map((r, i) => parseRow(r, i + 1)),
    });
  }

  // Hitung berapa baris yang akan dihapus (untuk pesan summary).
  const replacedCounts = await Promise.all(
    txGroups.map((g) =>
      prisma.question.count({ where: { subtestId: g.subtestId } }),
    ),
  );

  // Bungkus delete + recreate semua subtes dalam SATU transaksi atomik:
  // bila salah satu create gagal, seluruh perubahan rollback.
  try {
    await prisma.$transaction(async (tx) => {
      for (const g of txGroups) {
        await tx.question.deleteMany({ where: { subtestId: g.subtestId } });
        if (g.parsed.length === 0) continue;
        await tx.question.createMany({
          data: g.parsed.map((p) => ({
            subtestId: g.subtestId,
            questionNo: p.questionNo,
            prompt: p.prompt,
            imageUrl: p.imageUrl,
            parts: p.parts,
            options: p.options as unknown as Prisma.InputJsonValue,
            correct: p.correct as unknown as Prisma.InputJsonValue,
            scoringTag: p.scoringTag,
          })),
        });
      }
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal menyimpan bank soal";
    return NextResponse.json(
      { error: "Upload dibatalkan, tidak ada data berubah", detail: message },
      { status: 400 },
    );
  }

  const summary = txGroups.map((g, i) => ({
    subtestCode: g.subtestCode,
    created: g.parsed.length,
    replaced: replacedCounts[i] ?? 0,
  }));
  for (const code of unknownCodes) {
    summary.push({ subtestCode: code, created: 0, replaced: 0 });
  }

  return NextResponse.json({ ok: true, summary, unknownCodes });
}
