import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Template XLSX per subtes CFIT — pola sama dengan template minat-bakat:
// sheet PETUNJUK + CONTOH SOAL + SOAL. Soal CFIT berupa gambar semua:
// 'imageUrl' = gambar soal (stem/deret), 'option*Image' = gambar TIAP pilihan.
//
// Subtes yang meminta LEBIH DARI SATU jawaban (Classification / subtes 2:
// peserta menandai 2 gambar) memakai kolom kunci TERPISAH: correctAnswer1 dan
// correctAnswer2, masing-masing satu huruf. Format lama satu kolom
// 'correctAnswer' berisi "b;d" tetap diterima saat upload.

type KindCfg = {
  count: number;
  optionKeys: string[];
  correctCount: number;
  contohCount: number;
  correctExample: string[];
};

const KIND_CONFIG: Record<string, KindCfg> = {
  SERIES: { count: 13, optionKeys: ["a", "b", "c", "d", "e", "f"], correctCount: 1, contohCount: 3, correctExample: ["c"] },
  CLASSIFICATION: { count: 14, optionKeys: ["a", "b", "c", "d", "e"], correctCount: 2, contohCount: 2, correctExample: ["b", "d"] },
  MATRICES: { count: 13, optionKeys: ["a", "b", "c", "d", "e", "f"], correctCount: 1, contohCount: 3, correctExample: ["d"] },
  CONDITIONS: { count: 10, optionKeys: ["a", "b", "c", "d", "e"], correctCount: 1, contohCount: 3, correctExample: ["c"] },
};

function kindOf(code: string): string {
  return code.split("_").slice(1).join("_");
}

/** Nama kolom kunci: 1 kunci → 'correctAnswer'; >1 kunci → 'correctAnswer1..N'. */
function keyColumns(cfg: KindCfg): string[] {
  if (cfg.correctCount > 1) {
    return Array.from({ length: cfg.correctCount }, (_, i) => `correctAnswer${i + 1}`);
  }
  return ["correctAnswer"];
}

function headersFor(cfg: KindCfg): string[] {
  return [
    "questionNo",
    "prompt",
    "imageUrl",
    ...cfg.optionKeys.map((k) => `option${k.toUpperCase()}Image`),
    ...keyColumns(cfg),
  ];
}

function blankRow(
  cfg: KindCfg,
  no: number,
  correct: string[],
): Record<string, string | number> {
  const row: Record<string, string | number> = {
    questionNo: no,
    prompt: "",
    imageUrl: "",
  };
  for (const k of cfg.optionKeys) row[`option${k.toUpperCase()}Image`] = "";
  keyColumns(cfg).forEach((col, i) => {
    row[col] = correct[i] ?? "";
  });
  return row;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code: rawCode } = await ctx.params;
  const code = decodeURIComponent(rawCode);
  const sub = await prisma.cfitSubtest.findUnique({ where: { code } });
  if (!sub) return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });

  const cfg = KIND_CONFIG[kindOf(sub.code)] ?? {
    count: 10,
    optionKeys: ["a", "b", "c", "d", "e", "f"],
    correctCount: 1,
    contohCount: 2,
    correctExample: ["a"],
  };
  const keyCols = keyColumns(cfg);

  const wb = XLSX.utils.book_new();

  // Sheet 1: PETUNJUK
  const petunjukRows: (string | number)[][] = [
    [`TEMPLATE SOAL CFIT — ${sub.name} (${sub.code})`],
    [""],
    ["Cara mengisi:"],
    ["1. Sheet 'CONTOH SOAL' = soal contoh. Tampil ke peserta SEBELUM timer mulai dan TIDAK dinilai."],
    ["2. Sheet 'SOAL' = soal asli yang dinilai (masuk timer). Setiap baris = 1 soal."],
    ["3. Cara tercepat mengisi gambar: tombol GAMBAR pada baris subtes di tab Bank Soal IQ — pilih semua gambar sekaligus, penamaan 01.png (gambar soal), 01b.png (pilihan b), c01.png (contoh). Cara manual: kartu 'Upload 1 Gambar' lalu tempel URL ke kolom di bawah."],
    ["4. Kolom 'imageUrl' = gambar SOAL (stem / deret gambar). Kolom 'optionAImage'..'option?Image' = gambar TIAP pilihan jawaban (soal CFIT: jawaban juga berupa gambar)."],
    [
      cfg.correctCount > 1
        ? `5. Subtes ini meminta peserta memilih ${cfg.correctCount} jawaban, jadi kuncinya diisi pada ${cfg.correctCount} kolom terpisah: ${keyCols.join(" dan ")}. Satu kolom = SATU huruf (mis. ${keyCols[0]} = ${cfg.correctExample[0]}, ${keyCols[1]} = ${cfg.correctExample[1]}). Kedua huruf harus berbeda.`
        : `5. Kolom 'correctAnswer' = 1 huruf kunci (${cfg.optionKeys[0]}-${cfg.optionKeys[cfg.optionKeys.length - 1]}), mis. ${cfg.correctExample[0]}.`,
    ],
    ["6. Kolom 'prompt' opsional (teks tambahan di atas gambar; biasanya dikosongkan karena soal murni gambar)."],
    ["7. Simpan sebagai .xlsx lalu klik UPLOAD pada baris subtes ini. Upload MENGGANTI semua soal lama subtes ini."],
    [""],
    ["INFORMASI SUBTES"],
    ["Kode", sub.code],
    ["Nama", sub.name],
    ["Bentuk", sub.form === "FORM_3A" ? "3A" : "3B"],
    ["Jumlah soal standar", cfg.count],
    ["Jumlah contoh disarankan", cfg.contohCount],
    ["Pilihan jawaban", cfg.optionKeys.join(", ")],
    ["Kunci per soal", cfg.correctCount],
    ["Kolom kunci", keyCols.join(", ")],
    ["Durasi (detik)", sub.durationSec],
  ];
  const wsPet = XLSX.utils.aoa_to_sheet(petunjukRows);
  wsPet["!cols"] = [{ wch: 26 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsPet, "PETUNJUK");

  const headers = headersFor(cfg);
  const colWidths = headers.map((h) => {
    if (h === "prompt") return { wch: 40 };
    if (h === "imageUrl" || h.endsWith("Image")) return { wch: 28 };
    return { wch: 15 };
  });

  // Sheet 2: CONTOH SOAL — kerangka nomor contoh sesuai buklet.
  const contohRows = Array.from({ length: cfg.contohCount }, (_, i) =>
    blankRow(cfg, i + 1, cfg.correctExample),
  );
  const wsContoh = XLSX.utils.json_to_sheet(contohRows, { header: headers });
  wsContoh["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsContoh, "CONTOH SOAL");

  // Sheet 3: SOAL — kerangka semua nomor (tinggal tempel URL gambar + kunci).
  const soalRows = Array.from({ length: cfg.count }, (_, i) => blankRow(cfg, i + 1, []));
  const wsSoal = XLSX.utils.json_to_sheet(soalRows, { header: headers });
  wsSoal["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsSoal, "SOAL");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safe = sub.code.replace(/[^A-Za-z0-9_-]+/g, "-");
  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-CFIT-${safe}.xlsx"`,
    },
  });
}
