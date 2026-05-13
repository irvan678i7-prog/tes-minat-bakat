import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { sheetNameForCode } from "../template/route";

type Row = Record<string, unknown> & {
  subtestCode?: string;
  questionNo?: number | string;
  prompt?: string;
  imageUrl?: string;
  imageUrl2?: string;
  parts?: number | string;
  correctAnswer?: string;
  scoringTag?: string;
};

const OPTION_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");

const SISTEMATIS_CODE = "BAKAT_7_SISTEMATISASI";
const SPASIAL_CODE = "BAKAT_5_SPASIAL";
const SPASIAL_PARTS = 5;
const SPASIAL_OPTIONS: { key: string; label: string }[] = [
  { key: "B", label: "Sama (B)" },
  { key: "S", label: "Beda (S)" },
];

function buildKunciKolom(r: Row, parts: number): string[] {
  const arr: string[] = [];
  for (let i = 1; i <= parts; i++) arr.push(String(r[`kunci_${i}`] ?? "").trim());
  return arr;
}

function buildOptions(r: Row): { key: string; label: string; imageUrl?: string }[] {
  const opts: { key: string; label: string; imageUrl?: string }[] = [];
  for (const k of OPTION_KEYS) {
    const labelVal = r[`option${k}`];
    const imageVal = r[`option${k}Image`];
    const hasLabel = labelVal !== undefined && labelVal !== null && String(labelVal).trim() !== "";
    const hasImage = imageVal !== undefined && imageVal !== null && String(imageVal).trim() !== "";
    if (hasLabel || hasImage) {
      const item: { key: string; label: string; imageUrl?: string } = {
        key: k,
        label: hasLabel ? String(labelVal) : "",
      };
      if (hasImage) item.imageUrl = String(imageVal).trim();
      opts.push(item);
    }
  }
  return opts;
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File required" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  if (wb.SheetNames.length === 0) {
    return NextResponse.json({ error: "Workbook kosong" }, { status: 400 });
  }

  // Resolve subtests once by code; map both code and sheet-name-of-code to subtest.
  const allSubtests = await prisma.subtest.findMany();
  const codeToSubtest = new Map(allSubtests.map((s) => [s.code, s]));
  const sheetNameToCode = new Map(allSubtests.map((s) => [sheetNameForCode(s.code), s.code]));

  // Group rows by subtest code. Support both modes:
  // (a) per-subtest sheet — sheet name == sheetNameForCode(code), no subtestCode column needed.
  // (b) legacy single-sheet — every row has a subtestCode column.
  const grouped: Record<string, Row[]> = {};
  for (const sheetName of wb.SheetNames) {
    if (sheetName.toUpperCase() === "PETUNJUK" || sheetName.toUpperCase() === "REFERENSI-SUBTES") continue;
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { defval: "" });
    const codeFromSheet = sheetNameToCode.get(sheetName) || sheetName;
    for (const r of rows) {
      const explicit = r.subtestCode ? String(r.subtestCode).trim() : "";
      const code = explicit || codeFromSheet;
      if (!code) continue;
      // Skip rows with empty prompt AND no image AND no options AND no kunci_*
      // columns (treat as blank).
      const opts = buildOptions(r);
      const promptStr = String(r.prompt ?? "").trim();
      const imageStr = String(r.imageUrl ?? "").trim();
      const kunciAny = buildKunciKolom(r, 12).some((v) => v.length > 0);
      if (!promptStr && !imageStr && opts.length === 0 && !kunciAny) continue;
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(r);
    }
  }

  const summary: { subtestCode: string; created: number; replaced: number; skipped?: boolean }[] = [];
  for (const [code, list] of Object.entries(grouped)) {
    const subtest = codeToSubtest.get(code);
    if (!subtest) {
      summary.push({ subtestCode: code, created: 0, replaced: 0, skipped: true });
      continue;
    }
    const existingCount = await prisma.question.count({ where: { subtestId: subtest.id } });

    const isSistematis = code === SISTEMATIS_CODE;
    const isSpasial = code === SPASIAL_CODE;
    const data = list.map((r, i) => {
      const rawParts = Number(r.parts ?? 1) || 1;
      const parts = isSpasial
        ? SPASIAL_PARTS
        : isSistematis
        ? Math.max(1, Math.min(12, rawParts))
        : rawParts;
      let opts: unknown;
      if (isSpasial) {
        opts = SPASIAL_OPTIONS;
      } else if (isSistematis) {
        opts = [];
      } else {
        opts = buildOptions(r);
      }
      let correct: string | string[];
      if (isSistematis) {
        correct = buildKunciKolom(r, parts);
      } else if (isSpasial) {
        correct = buildKunciKolom(r, parts).map((s) => s.toUpperCase());
      } else {
        const correctStr = String(r.correctAnswer ?? "").trim();
        correct =
          parts > 1
            ? correctStr.split(/[,;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
            : correctStr.toUpperCase();
      }
      return {
        subtestId: subtest.id,
        questionNo: Number(r.questionNo ?? i + 1) || i + 1,
        prompt: String(r.prompt ?? ""),
        imageUrl: r.imageUrl ? String(r.imageUrl).trim() || null : null,
        imageUrl2: r.imageUrl2 ? String(r.imageUrl2).trim() || null : null,
        parts,
        options: opts as unknown as object,
        correct: correct as unknown as object,
        scoringTag: r.scoringTag ? String(r.scoringTag) : null,
      };
    });

    // Cascade-replace: drop dependent answer rows before removing old questions,
    // then insert new ones. Existing reports stay intact because Result.payload is
    // already computed (in-memory grading) and stored as JSON.
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { question: { subtestId: subtest.id } } }),
      prisma.question.deleteMany({ where: { subtestId: subtest.id } }),
      ...(data.length > 0 ? [prisma.question.createMany({ data })] : []),
    ]);
    summary.push({ subtestCode: code, created: data.length, replaced: existingCount });
  }

  return NextResponse.json({ ok: true, summary });
}
