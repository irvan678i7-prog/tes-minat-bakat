import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS, type SubtestSeed } from "@/lib/test-config";
import { sheetNameForCode } from "../../../questions/template/route";

const OPTION_KEYS = "ABCDEFGHIJKL".split("");

function isTextMode(s: SubtestSeed): boolean {
  return s.defaultInputMode === "TEXT";
}

// Subtes yang biasanya butuh 2 gambar dalam 1 soal (mis. Penalaran Urutan —
// buku menampilkan 2 panel gambar dalam 1 soal).
function needsTwoImages(s: SubtestSeed): boolean {
  return s.code === "BAKAT_4_URUTAN";
}

// SISTEMATIS: 1 soal = 1 gambar + N kolom jawaban (TEXT). Jumlah jawaban
// (parts) bisa berbeda per soal (max 12). Template pakai kolom
// kunci_1..kunci_12 supaya admin tinggal isi N kolom sesuai parts; kolom
// sisanya boleh dibiarkan kosong.
function isSistematis(s: SubtestSeed): boolean {
  return s.code === "BAKAT_7_SISTEMATISASI";
}

// SPASIAL: 1 soal = 1 gambar berisi 5 bentuk + 5 kolom jawaban B/S.
// Template pakai kolom kunci_1..kunci_5 (isi "B" atau "S" per kolom).
function isSpasial(s: SubtestSeed): boolean {
  return s.code === "BAKAT_5_SPASIAL";
}

// 3D: tiap Sisi (I, II, III) punya 5 gambar pilihan visual (A-E). Jawaban
// tetap TEXT (siswa ketik huruf per Sisi), tapi pilihan gambar ditampilkan
// untuk referensi visual.
function usesPerPartOptionImages(s: SubtestSeed): boolean {
  return s.code === "BAKAT_6_3DIMENSI";
}

const SISTEMATIS_KUNCI_COLS = Array.from({ length: 12 }, (_, i) => `kunci_${i + 1}`);
const SISTEMATIS_LABEL_COLS = Array.from({ length: 12 }, (_, i) => `label_${i + 1}`);
const SPASIAL_KUNCI_COLS = Array.from({ length: 5 }, (_, i) => `kunci_${i + 1}`);
const SPASIAL_LABEL_COLS = Array.from({ length: 5 }, (_, i) => `label_${i + 1}`);

function partOptionImageCols(s: SubtestSeed): string[] {
  if (!usesPerPartOptionImages(s)) return [];
  // 1 kolom gambar per Sisi. Admin upload 1 gambar (mis. screenshot 5 pilihan
  // A-E) per Sisi, lalu siswa mengetik huruf jawaban (A-E) untuk tiap Sisi.
  const partLabels = s.partLabels && s.partLabels.length > 0 ? s.partLabels : ["I", "II", "III"];
  return partLabels.map((p, i) => `sisi${i + 1}_image`);
}

function buildHeaders(s: SubtestSeed): string[] {
  const imageCols = needsTwoImages(s)
    ? ["imageUrl", "imageUrl2"]
    : ["imageUrl"];
  if (isSistematis(s)) {
    return [
      "questionNo",
      "prompt",
      "imageUrl",
      "parts",
      "inputMode",
      ...SISTEMATIS_KUNCI_COLS,
      ...SISTEMATIS_LABEL_COLS,
      "scoringTag",
    ];
  }
  if (isSpasial(s)) {
    return [
      "questionNo",
      "prompt",
      "imageUrl",
      "parts",
      "inputMode",
      ...SPASIAL_KUNCI_COLS,
      ...SPASIAL_LABEL_COLS,
      "scoringTag",
    ];
  }
  if (usesPerPartOptionImages(s)) {
    return [
      "questionNo",
      "prompt",
      "imageUrl",
      "parts",
      "inputMode",
      ...partOptionImageCols(s),
      "correctAnswer",
      "scoringTag",
    ];
  }
  if (isTextMode(s)) {
    return ["questionNo", "prompt", ...imageCols, "parts", "inputMode", "correctAnswer", "scoringTag"];
  }
  const optionCols: string[] = [];
  const labels = s.optionLabels.length > 0 ? s.optionLabels : OPTION_KEYS.slice(0, 5);
  for (const k of labels) {
    optionCols.push(`option${k}`, `option${k}Image`);
  }
  return ["questionNo", "prompt", ...imageCols, "parts", "inputMode", ...optionCols, "correctAnswer", "scoringTag"];
}

function textCorrectExample(s: SubtestSeed): string {
  if (s.parts > 1) {
    if (s.code === "BAKAT_6_3DIMENSI") return "A;B;C";
    if (s.code === "BAKAT_4_URUTAN") return "5;9";
    if (s.code === "BAKAT_5_SPASIAL") return "S;B;B;B;S";
    return Array.from({ length: s.parts }, (_, i) => String(i + 1)).join(";");
  }
  if (s.code === "BAKAT_2_NUMERIK" || s.code === "BAKAT_9_FIGURAL") return "42";
  if (s.code === "BAKAT_7_SISTEMATISASI") return "B";
  return "JAWABAN";
}

// MINAT pair generator. Each soal pairs 2 letters cycling through the bidang
// alphabet (A,B → B,C → C,D → …). Used both for default scoringTag and example
// labels in the template.
const MINAT_LETTERS_8 = ["A", "B", "C", "D", "E", "F", "G", "H"];
function minatPairForSoal(no: number): [string, string] {
  const i = (no - 1) % MINAT_LETTERS_8.length;
  const j = no % MINAT_LETTERS_8.length;
  return [MINAT_LETTERS_8[i], MINAT_LETTERS_8[j]];
}
const MINAT_LABEL_BIDANG: Record<string, string> = {
  A: "Komunikasi",
  B: "Seni",
  C: "Kesehatan",
  D: "Pariwisata",
  E: "Administrasi",
  F: "Teknologi",
  G: "Agrobisnis",
  H: "Industri",
};

function exampleSoalRow(s: SubtestSeed, no: number): Record<string, string | number> {
  const row: Record<string, string | number> = {
    questionNo: no,
    prompt:
      s.testKind === "BAKAT"
        ? `Contoh soal ${s.name}. (Tampil ke siswa sebelum timer mulai sebagai contoh.)`
        : `Contoh: pasangan kata untuk ${s.name}. (Ditampilkan ke siswa sebelum timer mulai.)`,
    imageUrl: "",
    parts: s.parts,
    inputMode: s.defaultInputMode ?? "CHOICE",
  };
  if (needsTwoImages(s)) row.imageUrl2 = "";
  if (isSistematis(s)) {
    for (let i = 0; i < 12; i++) {
      row[`kunci_${i + 1}`] = ["B", "A", "D", "C", "E", "B", "A", "C", "D", "E", "A", "B"][i] ?? "";
      // Default kosong → label otomatis 1..N per soal. Admin boleh isi
      // (mis. 13, 14, …) untuk override jadi nomor berkesinambungan.
      row[`label_${i + 1}`] = "";
    }
    row.scoringTag = "";
    return row;
  }
  if (isSpasial(s)) {
    const seq = ["S", "B", "B", "B", "S"];
    for (let i = 0; i < 5; i++) {
      row[`kunci_${i + 1}`] = seq[i];
      row[`label_${i + 1}`] = "";
    }
    row.scoringTag = "";
    return row;
  }
  if (usesPerPartOptionImages(s)) {
    for (const col of partOptionImageCols(s)) row[col] = "";
    row.correctAnswer = textCorrectExample(s);
    row.scoringTag = "";
    return row;
  }
  if (isTextMode(s)) {
    row.correctAnswer = textCorrectExample(s);
    row.scoringTag = "";
    return row;
  }
  if (s.testKind === "MINAT") {
    const [L1, L2] = minatPairForSoal(no);
    row.optionA = MINAT_LABEL_BIDANG[L1] ?? `Pilihan ${L1}`;
    row.optionAImage = "";
    row.optionB = MINAT_LABEL_BIDANG[L2] ?? `Pilihan ${L2}`;
    row.optionBImage = "";
    row.correctAnswer = "";
    row.scoringTag = `${L1},${L2}`;
    return row;
  }
  const labels = s.optionLabels.length > 0 ? s.optionLabels : ["A", "B", "C", "D", "E"];
  for (let i = 0; i < labels.length; i++) {
    row[`option${labels[i]}`] = `Pilihan ${labels[i]}`;
    row[`option${labels[i]}Image`] = "";
  }
  row.correctAnswer = s.parts > 1 ? labels.slice(0, s.parts).join(";") : labels[0];
  row.scoringTag = "";
  return row;
}

function blankSoalRow(s: SubtestSeed, no: number): Record<string, string | number> {
  const row: Record<string, string | number> = {
    questionNo: no,
    prompt:
      s.testKind === "BAKAT"
        ? `Soal nomor ${no} (${s.name}). Ganti dengan soal Anda.`
        : `Soal nomor ${no} — pasangan kata ${s.name}.`,
    imageUrl: "",
    parts: s.parts,
    inputMode: s.defaultInputMode ?? "CHOICE",
  };
  if (needsTwoImages(s)) row.imageUrl2 = "";
  if (isSistematis(s)) {
    for (let i = 0; i < 12; i++) {
      row[`kunci_${i + 1}`] = "";
      row[`label_${i + 1}`] = "";
    }
    row.scoringTag = "";
    return row;
  }
  if (isSpasial(s)) {
    for (let i = 0; i < 5; i++) {
      row[`kunci_${i + 1}`] = "";
      row[`label_${i + 1}`] = "";
    }
    row.scoringTag = "";
    return row;
  }
  if (usesPerPartOptionImages(s)) {
    for (const col of partOptionImageCols(s)) row[col] = "";
    row.correctAnswer = textCorrectExample(s);
    row.scoringTag = "";
    return row;
  }
  if (isTextMode(s)) {
    row.correctAnswer = textCorrectExample(s);
    row.scoringTag = "";
    return row;
  }
  if (s.testKind === "MINAT") {
    const [L1, L2] = minatPairForSoal(no);
    row.optionA = MINAT_LABEL_BIDANG[L1] ?? `Kata ${L1}`;
    row.optionAImage = "";
    row.optionB = MINAT_LABEL_BIDANG[L2] ?? `Kata ${L2}`;
    row.optionBImage = "";
    row.correctAnswer = "";
    row.scoringTag = `${L1},${L2}`;
    return row;
  }
  const labels = s.optionLabels.length > 0 ? s.optionLabels : ["A", "B", "C", "D", "E"];
  for (let i = 0; i < labels.length; i++) {
    row[`option${labels[i]}`] = `Pilihan ${labels[i]}`;
    row[`option${labels[i]}Image`] = "";
  }
  row.correctAnswer = s.parts > 1 ? labels.slice(0, s.parts).join(";") : labels[0];
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
  const isText = isTextMode(seed);
  const partLabelStr = (seed.partLabels ?? []).join(", ");
  const petunjukRows: (string | number)[][] = [
    [`TEMPLATE SOAL — ${seed.name} (${seed.code})`],
    [""],
    ["Cara mengisi:"],
    ["1. Buka sheet 'CONTOH SOAL' untuk soal contoh (akan tampil ke siswa SEBELUM timer mulai sebagai latihan)."],
    ["2. Buka sheet 'SOAL' untuk soal asli (yang dinilai dan masuk timer)."],
    ["3. Setiap baris = 1 soal. Hapus baris contoh, ganti dengan soal Anda."],
    needsTwoImages(seed)
      ? ["4. Kolom 'imageUrl' = gambar pertama soal, 'imageUrl2' = gambar kedua. Subtes ini umumnya pakai 2 gambar dalam 1 soal (stem + pelengkap). Upload gambar lewat tab Bank Soal admin."]
      : ["4. Kolom 'imageUrl' (opsional) untuk gambar soal. Upload gambar lewat tab Bank Soal admin."],
    isText
      ? ["5. Kolom 'inputMode' = TEXT untuk subtes ini (jawaban diketik siswa, BUKAN pilihan ganda)."]
      : ["5. Kolom 'inputMode' = CHOICE (pilihan ganda). Kolom 'option*' & 'option*Image' untuk pilihan jawaban."],
    isSistematis(seed)
      ? ["6. SISTEMATIS: 1 soal = 1 gambar stem (berisi N simbol/posisi) + kolom jawaban 'kunci_1'..'kunci_N' (max 12). Set kolom 'parts' = N untuk soal tsb, lalu isi N kolom kunci pertama (kolom sisanya kosong). Jumlah N boleh beda antar soal; total parts seluruh soal sebaiknya ≈ 150. Kolom 'label_1'..'label_12' opsional — isi kalau ingin override nomor sel di lembar jawaban siswa (mis. label_1=13, label_2=14,… untuk soal #2 supaya nomornya berkesinambungan). Kosongkan = otomatis 1..N per soal."]
      : isSpasial(seed)
      ? ["6. SPASIAL: 1 soal = 1 gambar stem (berisi 5 bentuk) + 5 kolom jawaban 'kunci_1'..'kunci_5'. Tiap kolom diisi 'B' (sama/serupa) atau 'S' (beda). Kolom 'parts' tetap 5. Kolom 'label_1'..'label_5' opsional — isi kalau ingin override nomor sel di lembar jawaban siswa (mis. label_1=6, label_2=7,… untuk soal #2 supaya berkesinambungan). Kosongkan = otomatis 1..5 per soal."]
      : usesPerPartOptionImages(seed)
      ? [`6. 3D: Tiap soal punya 1 gambar stem (balok 3D) + 3 gambar pilihan per Sisi (Sisi ${partLabelStr}). Upload 1 gambar per Sisi di kolom 'sisi1_image', 'sisi2_image', 'sisi3_image' (gambar berisi 5 pilihan A-E). Kunci diketik siswa di kolom 'correctAnswer' (3 huruf dipisah ;) — mis. ${textCorrectExample(seed)}.`]
      : isText && seed.parts > 1
      ? [`6. Soal punya ${seed.parts} bagian (${partLabelStr}). Kunci pakai ; atau , — mis. ${textCorrectExample(seed)}.`]
      : seed.parts > 1
      ? ["6. Untuk soal multi-bagian (parts > 1), tulis kunci pakai ; atau , (mis. A;B atau A,B,C)."]
      : isText
      ? ["6. Tulis kunci jawaban tepat seperti yang diharapkan (huruf/angka). Pencocokan abaikan huruf besar/kecil & spasi."]
      : ["6. Tulis kunci 1 huruf (mis. A) di kolom 'correctAnswer'."],
    seed.testKind === "MINAT"
      ? ["7. Subtes MINAT: tiap soal HANYA 2 opsi (optionA & optionB). 'correctAnswer' DIKOSONGKAN — tidak ada benar/salah."]
      : isSistematis(seed)
      ? ["7. Kolom 'correctAnswer' TIDAK ADA — pakai kunci_1..kunci_12 saja. Skor: 1 poin per kunci yang benar (maks 12 poin per soal)."]
      : isSpasial(seed)
      ? ["7. Kolom 'correctAnswer' TIDAK ADA — pakai kunci_1..kunci_5 saja. Skor: 1 poin per kunci yang benar (maks 5 poin per soal)."]
      : ["7. Untuk subtes BAKAT, kolom 'correctAnswer' WAJIB diisi sesuai kunci."],
    seed.testKind === "MINAT"
      ? ["   'scoringTag' WAJIB — isi 2 huruf bidang dipisah koma. Mis. 'A,B' artinya optionA = bidang A, optionB = bidang B."]
      : ["   'scoringTag' opsional (kosongkan saja)."],
    seed.code === "MINAT_BIDANG"
      ? ["   Pasangan bidang lengkap: A=Komunikasi, B=Seni, C=Kesehatan, D=Pariwisata, E=Administrasi, F=Teknologi, G=Agrobisnis, H=Industri."]
      : seed.code.startsWith("MINAT_PROG_")
      ? ["   Untuk Program (A-H), 'scoringTag' = pasangan huruf program/karier yang dipasangkan (lihat Tabel Program di Panduan Admin)."]
      : isSistematis(seed)
      ? ["   FORMAT TES: gambar stem berisi N simbol/posisi (max 12). Siswa mengetik jawaban (huruf/angka) untuk setiap posisi."]
      : isSpasial(seed)
      ? ["   FORMAT TES: gambar stem berisi 5 bentuk (1-5). Siswa memilih tombol B (sama) atau S (beda) untuk tiap bentuk."]
      : usesPerPartOptionImages(seed)
      ? ["   FORMAT TES: gambar stem balok 3D dengan panah ke Sisi I, II, III. Untuk tiap Sisi, siswa melihat 1 gambar pilihan (berisi 5 opsi A-E) lalu mengetik huruf yang cocok di kotak isian Sisi tsb."]
      : [""],
    ["8. Save sebagai .xlsx, lalu upload via tombol UPLOAD pada baris subtes ini di tab Bank Soal."],
    [""],
    ["INFORMASI SUBTES"],
    ["Kode", seed.code],
    ["Nama", seed.name],
    ["Tes", seed.testKind],
    ["Parts per soal", seed.parts],
    ["Mode jawaban default", seed.defaultInputMode ?? "CHOICE"],
    ["Soal disarankan", seed.expectedQuestions],
    ["Durasi (menit)", Math.round(seed.durationSec / 60)],
    isText
      ? ["Format jawaban", seed.parts > 1 ? `${seed.parts} bagian (${partLabelStr || "1,2,..."}); pisah dengan ; atau ,` : "Ketik jawaban (huruf/angka)"]
      : ["Pilihan jawaban", (seed.optionLabels.length > 0 ? seed.optionLabels : ["A", "B", "C", "D", "E"]).join(", ")],
  ];
  const wsPet = XLSX.utils.aoa_to_sheet(petunjukRows);
  wsPet["!cols"] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsPet, "PETUNJUK");

  // Sheet 2: CONTOH SOAL (1 baris contoh)
  const headers = buildHeaders(seed);
  const wsContoh = XLSX.utils.json_to_sheet([exampleSoalRow(seed, 1)], { header: headers });
  wsContoh["!cols"] = headers.map((h) => {
    if (h === "prompt") return { wch: 50 };
    if (h === "imageUrl" || h === "imageUrl2" || h.endsWith("Image") || h.endsWith("_image")) return { wch: 24 };
    if (h.startsWith("option") && !h.endsWith("Image")) return { wch: 24 };
    if (h.startsWith("kunci_")) return { wch: 10 };
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
