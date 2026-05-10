import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS, type SubtestSeed } from "@/lib/test-config";
import { sheetNameForCode } from "../../../questions/template/route";

const OPTION_KEYS = "ABCDEFGHIJKL".split("");

function buildHeaders(s: SubtestSeed): string[] {
  const optionCols: string[] = [];
  const labels = s.optionLabels.length > 0 ? s.optionLabels : OPTION_KEYS.slice(0, 5);
  for (const k of labels) {
    optionCols.push(`option${k}`, `option${k}Image`);
  }
  return ["questionNo", "prompt", "imageUrl", "parts", ...optionCols, "correctAnswer", "scoringTag"];
}

function exampleSoalRow(s: SubtestSeed, no: number): Record<string, string | number> {
  const row: Record<string, string | number> = {
    questionNo: no,
    prompt:
      s.testKind === "BAKAT"
        ? `Contoh soal ${s.name}. (Tampil ke siswa sebelum timer mulai sebagai contoh.)`
        : `Contoh: pasangan kata untuk ${s.name}. (Ditampilkan ke siswa sebelum timer mulai.)`,
    imageUrl: "",
    parts: s.parts,
  };
  const labels = s.optionLabels.length > 0 ? s.optionLabels : ["A", "B", "C", "D", "E"];
  for (let i = 0; i < labels.length; i++) {
    row[`option${labels[i]}`] = `Pilihan ${labels[i]}`;
    row[`option${labels[i]}Image`] = "";
  }
  row.correctAnswer =
    s.testKind === "MINAT" ? "" : s.parts > 1 ? labels.slice(0, s.parts).join(";") : labels[0];
  row.scoringTag = "";
  return row;
}

function blankSoalRow(s: SubtestSeed, no: number): Record<string, string | number> {
  const row: Record<string, string | number> = {
    questionNo: no,
    prompt:
      s.testKind === "BAKAT"
        ? `Soal nomor ${no} (${s.name}). Ganti dengan soal Anda.`
        : `Soal nomor ${no} untuk subtes ${s.name}.`,
    imageUrl: "",
    parts: s.parts,
  };
  const labels = s.optionLabels.length > 0 ? s.optionLabels : ["A", "B", "C", "D", "E"];
  for (let i = 0; i < labels.length; i++) {
    row[`option${labels[i]}`] = `Pilihan ${labels[i]}`;
    row[`option${labels[i]}Image`] = "";
  }
  row.correctAnswer =
    s.testKind === "MINAT" ? "" : s.parts > 1 ? labels.slice(0, s.parts).join(";") : labels[0];
  row.scoringTag = "";
  return row;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sub = await prisma.subtest.findUnique({ where: { id } });
  if (!sub) return NextResponse.json({ error: "Subtest tidak ditemukan" }, { status: 404 });

  const seed =
    [...BAKAT_SUBTESTS, ...MINAT_SUBTESTS].find((x) => x.code === sub.code) ||
    ({
      code: sub.code,
      name: sub.name,
      testKind: sub.testKind as "BAKAT" | "MINAT",
      durationSec: sub.durationSec,
      expectedQuestions: 10,
      parts: 1,
      optionLabels: ["A", "B", "C", "D", "E"],
      description: sub.description ?? "",
    } as SubtestSeed);

  const wb = XLSX.utils.book_new();

  // Sheet 1: PETUNJUK (subtes-spesifik)
  const petunjukRows: (string | number)[][] = [
    [`TEMPLATE SOAL — ${seed.name} (${seed.code})`],
    [""],
    ["Cara mengisi:"],
    ["1. Buka sheet 'CONTOH SOAL' untuk soal contoh (akan tampil ke siswa SEBELUM timer mulai sebagai latihan)."],
    ["2. Buka sheet 'SOAL' untuk soal asli (yang dinilai dan masuk timer)."],
    ["3. Setiap baris = 1 soal. Hapus baris contoh, ganti dengan soal Anda."],
    ["4. Kolom 'imageUrl' (opsional) untuk gambar soal. Upload gambar lewat tab Bank Soal admin."],
    ["5. Kolom 'option*Image' untuk gambar pilihan jawaban (soal visual)."],
    ["6. Untuk soal multi-bagian (parts > 1), tulis kunci pakai ; atau , (mis. A;B atau A,B,C)."],
    seed.testKind === "MINAT"
      ? ["7. Untuk subtes MINAT, kolom 'correctAnswer' DIKOSONGKAN (tidak ada benar/salah)."]
      : ["7. Untuk subtes BAKAT, kolom 'correctAnswer' WAJIB diisi sesuai kunci."],
    ["8. Save sebagai .xlsx, lalu upload via tombol UPLOAD pada baris subtes ini di tab Bank Soal."],
    [""],
    ["INFORMASI SUBTES"],
    ["Kode", seed.code],
    ["Nama", seed.name],
    ["Tes", seed.testKind],
    ["Parts per soal", seed.parts],
    ["Soal disarankan", seed.expectedQuestions],
    ["Durasi (menit)", Math.round(seed.durationSec / 60)],
    ["Pilihan jawaban", (seed.optionLabels.length > 0 ? seed.optionLabels : ["A", "B", "C", "D", "E"]).join(", ")],
  ];
  const wsPet = XLSX.utils.aoa_to_sheet(petunjukRows);
  wsPet["!cols"] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsPet, "PETUNJUK");

  // Sheet 2: CONTOH SOAL (1 baris contoh)
  const headers = buildHeaders(seed);
  const wsContoh = XLSX.utils.json_to_sheet([exampleSoalRow(seed, 1)], { header: headers });
  wsContoh["!cols"] = headers.map((h) => {
    if (h === "prompt") return { wch: 50 };
    if (h === "imageUrl" || h.endsWith("Image")) return { wch: 24 };
    if (h.startsWith("option") && !h.endsWith("Image")) return { wch: 24 };
    return { wch: 14 };
  });
  XLSX.utils.book_append_sheet(wb, wsContoh, "CONTOH SOAL");

  // Sheet 3: SOAL (3 baris contoh)
  const blankRows = [1, 2, 3].map((n) => blankSoalRow(seed, n));
  const wsSoal = XLSX.utils.json_to_sheet(blankRows, { header: headers });
  wsSoal["!cols"] = wsContoh["!cols"];
  XLSX.utils.book_append_sheet(wb, wsSoal, "SOAL");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeCode = sheetNameForCode(seed.code).replace(/\s+/g, "-");
  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-${safeCode}.xlsx"`,
    },
  });
}
