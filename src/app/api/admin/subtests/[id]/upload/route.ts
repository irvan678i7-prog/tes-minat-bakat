import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS, type InputMode } from "@/lib/test-config";

type Row = Record<string, unknown> & {
  questionNo?: number | string;
  prompt?: string;
  imageUrl?: string;
  imageUrl2?: string;
  parts?: number | string;
  inputMode?: string;
  correctAnswer?: string;
  scoringTag?: string;
};

const OPTION_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");

// Subtes spesifik dengan kolom kunci_1..kunci_12 (SISTEMATIS).
const SISTEMATIS_CODE = "BAKAT_7_SISTEMATISASI";
// Subtes spesifik dengan kolom gambar per Sisi (3D).
const PER_PART_IMAGES_CODE = "BAKAT_6_3DIMENSI";

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

// 3D-style: simpan {partImages: [url1, url2, url3]} di kolom options untuk
// referensi visual; kunci jawaban tetap di kolom correctAnswer (TEXT).
function buildPartImages(r: Row, parts: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= parts; i++) {
    const v = r[`sisi${i}_image`];
    out.push(v ? String(v).trim() : "");
  }
  return out;
}

// SISTEMATIS: ambil 12 kolom kunci_1..kunci_12 sebagai array kunci jawaban.
function buildSistematisKunci(r: Row): string[] {
  const arr: string[] = [];
  for (let i = 1; i <= 12; i++) arr.push(String(r[`kunci_${i}`] ?? "").trim());
  return arr;
}

// MINAT: opsi di template selalu A,B (sepasang). scoringTag (mis. "A,B" atau
// "B,C") menentukan huruf BIDANG/PROGRAM yang sebenarnya dipilih siswa. Kita
// remap key opsi sesuai scoringTag supaya scoring tinggal hitung huruf yang
// dipilih = huruf bidang/program.
function remapMinatOptions(
  opts: { key: string; label: string; imageUrl?: string }[],
  scoringTag: string,
): { key: string; label: string; imageUrl?: string }[] {
  const tags = scoringTag
    .split(/[,;|/]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (tags.length < 2 || opts.length < 2) return opts;
  return opts.map((o, i) => ({ ...o, key: tags[i] ?? o.key }));
}

function resolveInputMode(r: Row, fallback: InputMode): InputMode {
  const raw = String(r.inputMode ?? "").trim().toUpperCase();
  if (raw === "TEXT") return "TEXT";
  if (raw === "CHOICE") return "CHOICE";
  return fallback;
}

function rowsToData(
  list: Row[],
  subtestId: string,
  isExample: boolean,
  fallbackMode: InputMode,
  isMinat: boolean,
  subtestCode: string,
  fallbackParts: number,
): {
  subtestId: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  imageUrl2: string | null;
  parts: number;
  options: object;
  correct: object;
  scoringTag: string | null;
  isExample: boolean;
  inputMode: string;
}[] {
  const isSistematis = subtestCode === SISTEMATIS_CODE;
  const isPerPartImages = subtestCode === PER_PART_IMAGES_CODE;
  return list.map((r, i) => {
    const inputMode = resolveInputMode(r, fallbackMode);
    let opts: unknown;
    if (isPerPartImages) {
      // Simpan gambar per Sisi sebagai object di kolom options.
      const parts = Number(r.parts ?? fallbackParts) || fallbackParts;
      opts = { partImages: buildPartImages(r, parts) };
    } else if (inputMode === "TEXT") {
      opts = [];
    } else {
      const rawOpts = buildOptions(r);
      const tagInner = r.scoringTag ? String(r.scoringTag).trim() : "";
      opts =
        isMinat && rawOpts.length > 0 && tagInner
          ? remapMinatOptions(rawOpts, tagInner)
          : rawOpts;
    }
    const parts = isSistematis
      ? 12
      : Number(r.parts ?? fallbackParts) || fallbackParts;
    let correct: string | string[];
    if (isSistematis) {
      // 12 kolom kunci_1..kunci_12 → array of 12 strings (case preserved).
      correct = buildSistematisKunci(r);
    } else {
      const correctStr = String(r.correctAnswer ?? "").trim();
      if (inputMode === "TEXT") {
        // For TEXT mode, store raw strings (case preserved). Comparison normalizes later.
        correct =
          parts > 1
            ? correctStr.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
            : correctStr;
      } else {
        correct =
          parts > 1
            ? correctStr.split(/[,;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
            : correctStr.toUpperCase();
      }
    }
    return {
      subtestId,
      questionNo: Number(r.questionNo ?? i + 1) || i + 1,
      prompt: String(r.prompt ?? ""),
      imageUrl: r.imageUrl ? String(r.imageUrl).trim() || null : null,
      imageUrl2: r.imageUrl2 ? String(r.imageUrl2).trim() || null : null,
      parts,
      options: opts as unknown as object,
      correct: correct as unknown as object,
      scoringTag: r.scoringTag ? String(r.scoringTag) : null,
      isExample,
      inputMode,
    };
  });
}

function nonEmpty(r: Row): boolean {
  const opts = buildOptions(r);
  const promptStr = String(r.prompt ?? "").trim();
  const imageStr = String(r.imageUrl ?? "").trim();
  const correctStr = String(r.correctAnswer ?? "").trim();
  const sistematisAny = buildSistematisKunci(r).some((v) => v.length > 0);
  const perPartImages = Array.from({ length: 6 }, (_, i) =>
    String(r[`sisi${i + 1}_image`] ?? "").trim(),
  ).some((v) => v.length > 0);
  return !!(promptStr || imageStr || opts.length > 0 || correctStr || sistematisAny || perPartImages);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sub = await prisma.subtest.findUnique({ where: { id } });
  if (!sub) return NextResponse.json({ error: "Subtest tidak ditemukan" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File required" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  if (wb.SheetNames.length === 0) {
    return NextResponse.json({ error: "Workbook kosong" }, { status: 400 });
  }

  const findSheet = (matchers: string[]): string | null => {
    for (const name of wb.SheetNames) {
      const norm = name.toUpperCase().replace(/\s+/g, "");
      if (matchers.some((m) => norm === m)) return name;
    }
    return null;
  };

  const soalSheet =
    findSheet(["SOAL", "QUESTIONS", "SOALASLI"]) ||
    wb.SheetNames.find((n) => !["PETUNJUK", "CONTOH SOAL", "CONTOHSOAL"].includes(n.toUpperCase().replace(/\s+/g, ""))) ||
    null;
  const contohSheet = findSheet(["CONTOHSOAL", "CONTOH"]);

  const soalRows: Row[] = soalSheet
    ? (XLSX.utils.sheet_to_json<Row>(wb.Sheets[soalSheet], { defval: "" }) as Row[]).filter(nonEmpty)
    : [];
  const contohRows: Row[] = contohSheet
    ? (XLSX.utils.sheet_to_json<Row>(wb.Sheets[contohSheet], { defval: "" }) as Row[]).filter(nonEmpty)
    : [];

  const existingSoalCount = await prisma.question.count({
    where: { subtestId: sub.id, isExample: false },
  });
  const existingContohCount = await prisma.question.count({
    where: { subtestId: sub.id, isExample: true },
  });

  const seed = [...BAKAT_SUBTESTS, ...MINAT_SUBTESTS].find((x) => x.code === sub.code);
  const fallbackMode: InputMode = seed?.defaultInputMode ?? "CHOICE";
  const fallbackParts = seed?.parts ?? 1;
  const isMinat = sub.testKind === "MINAT";

  const soalData = rowsToData(soalRows, sub.id, false, fallbackMode, isMinat, sub.code, fallbackParts);
  const contohData = rowsToData(contohRows, sub.id, true, fallbackMode, isMinat, sub.code, fallbackParts);

  // Cascade-replace per (subtestId, isExample) bucket. Existing reports stay
  // intact because Result.payload is already computed and stored as JSON.
  await prisma.$transaction([
    prisma.answer.deleteMany({ where: { question: { subtestId: sub.id } } }),
    prisma.question.deleteMany({ where: { subtestId: sub.id } }),
    ...(soalData.length > 0 ? [prisma.question.createMany({ data: soalData })] : []),
    ...(contohData.length > 0 ? [prisma.question.createMany({ data: contohData })] : []),
  ]);

  return NextResponse.json({
    ok: true,
    subtest: { code: sub.code, name: sub.name },
    soal: { created: soalData.length, replaced: existingSoalCount },
    contoh: { created: contohData.length, replaced: existingContohCount },
  });
}
