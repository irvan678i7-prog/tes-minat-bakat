import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Upload bank soal CFIT dari template XLSX (sheet CONTOH SOAL + SOAL).
// Pola sama dengan upload minat-bakat: MENGGANTI semua soal lama subtes ini.

const OPTION_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

const DEFAULT_KEYS: Record<string, string[]> = {
  SERIES: ["a", "b", "c", "d", "e", "f"],
  CLASSIFICATION: ["a", "b", "c", "d", "e"],
  MATRICES: ["a", "b", "c", "d", "e", "f"],
  CONDITIONS: ["a", "b", "c", "d", "e"],
};

type Row = Record<string, unknown>;
type OptionItem = { key: string; label: string; imageUrl: string | null };

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

function buildOptions(r: Row): OptionItem[] {
  const opts: OptionItem[] = [];
  for (const k of OPTION_KEYS) {
    const K = k.toUpperCase();
    const img = str(r[`option${K}Image`]);
    const label = str(r[`option${K}`]);
    if (img || label) opts.push({ key: k, label, imageUrl: img || null });
  }
  return opts;
}

function nonEmpty(r: Row): boolean {
  return !!(str(r.prompt) || str(r.imageUrl) || buildOptions(r).length > 0 || str(r.correctAnswer));
}

type BuiltQuestion = {
  subtestId: string;
  questionNo: number;
  prompt: string;
  imageUrl: string | null;
  options: object;
  correct: object;
  isExample: boolean;
};

function rowsToData(
  list: Row[],
  subtestId: string,
  isExample: boolean,
  defaultKeys: string[],
  sheetLabel: string,
): { data?: BuiltQuestion[]; error?: string } {
  const data: BuiltQuestion[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const questionNo = Number(r.questionNo ?? i + 1) || i + 1;
    if (seen.has(questionNo)) {
      return { error: `Sheet ${sheetLabel}: nomor soal ${questionNo} muncul lebih dari sekali.` };
    }
    seen.add(questionNo);

    let options = buildOptions(r);
    if (options.length < 2) {
      // Tidak ada gambar/label opsi di baris ini → pakai huruf standar subtes
      // (peserta tetap melihat tombol huruf a-f/a-e).
      options = defaultKeys.map((k) => ({ key: k, label: "", imageUrl: null }));
    }
    const keys = options.map((o) => o.key);

    const correctStr = str(r.correctAnswer).toLowerCase();
    let correctArr = correctStr
      ? correctStr.split(/[,;|/]/).map((s) => s.trim()).filter(Boolean)
      : [];
    if (correctArr.length === 0) {
      if (!isExample) {
        return { error: `Sheet ${sheetLabel} — soal no. ${questionNo}: kolom 'correctAnswer' wajib diisi.` };
      }
      correctArr = [keys[0]];
    }
    const invalid = correctArr.filter((c) => !keys.includes(c));
    if (invalid.length > 0) {
      return {
        error: `Sheet ${sheetLabel} — soal no. ${questionNo}: kunci '${invalid.join(", ")}' tidak ada di pilihan (${keys.join(", ")}).`,
      };
    }

    data.push({
      subtestId,
      questionNo,
      prompt: str(r.prompt),
      imageUrl: str(r.imageUrl) || null,
      options: options as unknown as object,
      correct: (correctArr.length === 1 ? correctArr[0] : correctArr) as unknown as object,
      isExample,
    });
  }
  return { data };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code: rawCode } = await ctx.params;
  const code = decodeURIComponent(rawCode);
  const sub = await prisma.cfitSubtest.findUnique({ where: { code } });
  if (!sub) return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });

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
    wb.SheetNames.find(
      (n) => !["PETUNJUK", "CONTOHSOAL", "CONTOH"].includes(n.toUpperCase().replace(/\s+/g, "")),
    ) ||
    null;
  const contohSheet = findSheet(["CONTOHSOAL", "CONTOH"]);

  const soalRows: Row[] = soalSheet
    ? (XLSX.utils.sheet_to_json<Row>(wb.Sheets[soalSheet], { defval: "" }) as Row[]).filter(nonEmpty)
    : [];
  const contohRows: Row[] = contohSheet
    ? (XLSX.utils.sheet_to_json<Row>(wb.Sheets[contohSheet], { defval: "" }) as Row[]).filter(nonEmpty)
    : [];

  if (soalRows.length === 0 && contohRows.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris soal terisi. Isi sheet 'SOAL' (dan opsional 'CONTOH SOAL') dulu." },
      { status: 400 },
    );
  }

  const defaultKeys = DEFAULT_KEYS[sub.code.split("_").slice(1).join("_")] ?? ["a", "b", "c", "d", "e", "f"];

  const soal = rowsToData(soalRows, sub.id, false, defaultKeys, "SOAL");
  if (soal.error) return NextResponse.json({ error: soal.error }, { status: 400 });
  const contoh = rowsToData(contohRows, sub.id, true, defaultKeys, "CONTOH SOAL");
  if (contoh.error) return NextResponse.json({ error: contoh.error }, { status: 400 });

  const existingSoal = await prisma.cfitQuestion.count({ where: { subtestId: sub.id, isExample: false } });
  const existingContoh = await prisma.cfitQuestion.count({ where: { subtestId: sub.id, isExample: true } });

  // Replace-all per subtes (jawaban lama pada soal subtes ini ikut terhapus;
  // hasil/CfitResult yang sudah digenerate tetap utuh karena payload tersimpan).
  await prisma.$transaction([
    prisma.cfitAnswer.deleteMany({ where: { question: { subtestId: sub.id } } }),
    prisma.cfitQuestion.deleteMany({ where: { subtestId: sub.id } }),
    ...(soal.data && soal.data.length > 0 ? [prisma.cfitQuestion.createMany({ data: soal.data as never })] : []),
    ...(contoh.data && contoh.data.length > 0 ? [prisma.cfitQuestion.createMany({ data: contoh.data as never })] : []),
  ]);

  return NextResponse.json({
    ok: true,
    subtest: { code: sub.code, name: sub.name },
    soal: { created: soal.data?.length ?? 0, replaced: existingSoal },
    contoh: { created: contoh.data?.length ?? 0, replaced: existingContoh },
  });
}
