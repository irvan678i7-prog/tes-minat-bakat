import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminFromRequest } from "@/lib/auth";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS, type SubtestSeed } from "@/lib/test-config";

const OPTION_KEYS = "ABCDEFGHIJKL".split("");

export function sheetNameForCode(code: string): string {
  // Excel sheet name max 31 chars; replace invalid chars.
  return code.replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
}

// SISTEMATIS pakai kolom kunci_1..kunci_12 (parts variabel, max 12). SPASIAL
// pakai kunci_1..kunci_5 (B/S, parts=5). Keduanya TIDAK pakai correctAnswer.
function isSistematis(s: SubtestSeed): boolean {
  return s.code === "BAKAT_7_SISTEMATISASI";
}
function isSpasial(s: SubtestSeed): boolean {
  return s.code === "BAKAT_5_SPASIAL";
}
const SISTEMATIS_KUNCI_COLS = Array.from({ length: 12 }, (_, i) => `kunci_${i + 1}`);
const SPASIAL_KUNCI_COLS = Array.from({ length: 5 }, (_, i) => `kunci_${i + 1}`);

function buildHeaders(s: SubtestSeed): string[] {
  if (isSistematis(s)) {
    return ["questionNo", "prompt", "imageUrl", "parts", ...SISTEMATIS_KUNCI_COLS, "scoringTag"];
  }
  if (isSpasial(s)) {
    return ["questionNo", "prompt", "imageUrl", "parts", ...SPASIAL_KUNCI_COLS, "scoringTag"];
  }
  const optionCols: string[] = [];
  const labels = s.optionLabels.length > 0 ? s.optionLabels : OPTION_KEYS.slice(0, 5);
  for (const k of labels) {
    optionCols.push(`option${k}`, `option${k}Image`);
  }
  return ["questionNo", "prompt", "imageUrl", "parts", ...optionCols, "correctAnswer", "scoringTag"];
}

function exampleRowForSubtest(s: SubtestSeed): Record<string, string | number> {
  const row: Record<string, string | number> = {
    questionNo: 1,
    prompt:
      s.testKind === "BAKAT"
        ? `Contoh soal ${s.name}. Hapus baris ini dan ganti dengan soal Anda.`
        : s.code === "MINAT_BIDANG"
        ? "Contoh: pilih kata yang paling Anda sukai dari pasangan."
        : `Contoh: pasangan kata untuk ${s.name}.`,
    imageUrl: "",
    parts: s.parts,
  };
  if (isSistematis(s)) {
    const seq = ["B", "A", "D", "C", "E", "B", "A", "C", "D", "E", "A", "B"];
    for (let i = 0; i < 12; i++) row[`kunci_${i + 1}`] = seq[i] ?? "";
    row.scoringTag = "";
    return row;
  }
  if (isSpasial(s)) {
    const seq = ["S", "B", "B", "B", "S"];
    for (let i = 0; i < 5; i++) row[`kunci_${i + 1}`] = seq[i];
    row.scoringTag = "";
    return row;
  }
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

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: PETUNJUK ────────────────────────────────────────────────
  const petunjukRows: (string | number)[][] = [
    ["TEMPLATE UPLOAD SOAL — TES MINAT & BAKAT"],
    [""],
    ["Cara pakai:"],
    ["1. Setiap subtes memiliki SHEET tersendiri (lihat tab di bawah)."],
    ["2. Buka sheet sesuai subtes, lalu isi soal pada baris di bawah header."],
    ["3. Kolom 'imageUrl' (jika diisi) akan menampilkan gambar di soal."],
    ["4. Untuk soal visual, setiap pilihan jawaban juga bisa pakai gambar lewat kolom 'optionAImage', 'optionBImage', dst."],
    ["5. Upload gambar lewat tab 'Bank Soal' admin → tombol UPLOAD GAMBAR. URL akan otomatis di-copy ke clipboard."],
    ["6. Untuk soal multi-bagian (parts > 1), tulis kunci jawaban dipisah ';' atau ','. Contoh: A;B atau A,B,C."],
    ["6b. SISTEMATIS: parts variabel per soal (max 12), pakai kolom kunci_1..kunci_12 (kolom sisanya boleh kosong) — TIDAK pakai correctAnswer."],
    ["6c. SPASIAL: parts = 5 per soal, pakai kolom kunci_1..kunci_5 (isi 'B' atau 'S') — TIDAK pakai correctAnswer."],
    ["7. Untuk subtes MINAT, kolom 'correctAnswer' boleh kosong (tidak ada benar/salah)."],
    ["8. Save sebagai .xlsx, lalu upload via tombol UPLOAD di tab 'Bank Soal'."],
    [""],
    ["DAFTAR SUBTES"],
    ["Tes", "Kode (Sheet)", "Nama", "Parts", "Soal Disarankan", "Durasi (menit)"],
    ...[...BAKAT_SUBTESTS, ...MINAT_SUBTESTS].map((s) => [
      s.testKind,
      sheetNameForCode(s.code),
      s.name,
      s.parts,
      s.expectedQuestions,
      Math.round(s.durationSec / 60),
    ]),
  ];
  const wsPet = XLSX.utils.aoa_to_sheet(petunjukRows);
  wsPet["!cols"] = [{ wch: 8 }, { wch: 24 }, { wch: 36 }, { wch: 8 }, { wch: 18 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsPet, "PETUNJUK");

  // ── One sheet per subtest ────────────────────────────────────────────
  const allSubtests = [...BAKAT_SUBTESTS, ...MINAT_SUBTESTS];
  for (const s of allSubtests) {
    const headers = buildHeaders(s);
    const example = exampleRowForSubtest(s);
    const ws = XLSX.utils.json_to_sheet([example], { header: headers });
    ws["!cols"] = headers.map((h) => {
      if (h === "prompt") return { wch: 50 };
      if (h === "imageUrl" || h.endsWith("Image")) return { wch: 24 };
      if (h.startsWith("option") && !h.endsWith("Image")) return { wch: 24 };
      return { wch: 14 };
    });
    XLSX.utils.book_append_sheet(wb, ws, sheetNameForCode(s.code));
  }

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-soal-tes-minat-bakat.xlsx"',
    },
  });
}
