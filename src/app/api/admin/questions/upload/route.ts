import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
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

  const summary: { subtestCode: string; created: number; replaced: number }[] = [];
  for (const [code, list] of Object.entries(grouped)) {
    const subtest = await prisma.subtest.findUnique({ where: { code } });
    if (!subtest) {
      summary.push({ subtestCode: code, created: 0, replaced: 0 });
      continue;
    }
    // Replace strategy: delete existing questions for this subtest then insert.
    const existingCount = await prisma.question.count({ where: { subtestId: subtest.id } });
    await prisma.question.deleteMany({ where: { subtestId: subtest.id } });

    let created = 0;
    for (const r of list) {
      const opts: { key: string; label: string }[] = [];
      const optionKeys = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");
      for (const k of optionKeys) {
        const val = (r as Record<string, unknown>)[`option${k}`];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          opts.push({ key: k, label: String(val) });
        }
      }
      const parts = Number(r.parts ?? 1) || 1;
      let correct: unknown;
      const correctStr = String(r.correctAnswer ?? "").trim();
      if (parts > 1) {
        correct = correctStr.split(/[,;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      } else {
        correct = correctStr.toUpperCase();
      }
      await prisma.question.create({
        data: {
          subtestId: subtest.id,
          questionNo: Number(r.questionNo ?? created + 1) || created + 1,
          prompt: String(r.prompt ?? ""),
          imageUrl: r.imageUrl ? String(r.imageUrl) : null,
          parts,
          options: opts as unknown as object,
          correct: correct as object,
          scoringTag: r.scoringTag ? String(r.scoringTag) : null,
        },
      });
      created += 1;
    }
    summary.push({ subtestCode: code, created, replaced: existingCount });
  }

  return NextResponse.json({ ok: true, summary });
}
