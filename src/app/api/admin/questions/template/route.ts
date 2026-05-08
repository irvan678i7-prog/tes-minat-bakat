import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminFromRequest } from "@/lib/auth";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS } from "@/lib/test-config";

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wb = XLSX.utils.book_new();
  const headers = [
    "subtestCode", "questionNo", "prompt", "imageUrl", "parts",
    ...["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].map((k) => `option${k}`),
    "correctAnswer", "scoringTag",
  ];
  const examples: Record<string, string | number | undefined>[] = [];
  for (const s of BAKAT_SUBTESTS) {
    examples.push({
      subtestCode: s.code,
      questionNo: 1,
      prompt: `Contoh soal ${s.name}`,
      imageUrl: "",
      parts: s.parts,
      optionA: "Pilihan A",
      optionB: "Pilihan B",
      optionC: "Pilihan C",
      optionD: "Pilihan D",
      optionE: "Pilihan E",
      correctAnswer: s.parts > 1 ? "A;B" : "A",
      scoringTag: "",
    });
  }
  for (const s of MINAT_SUBTESTS) {
    examples.push({
      subtestCode: s.code,
      questionNo: 1,
      prompt: s.code === "MINAT_BIDANG" ? "Komunikasi / Seni" : "Programmer / Audio Visual",
      imageUrl: "",
      parts: 1,
      optionA: "Komunikasi",
      optionB: "Seni",
      correctAnswer: "",
      scoringTag: "",
    });
  }
  const ws = XLSX.utils.json_to_sheet(examples, { header: headers });
  XLSX.utils.book_append_sheet(wb, ws, "Soal");

  // Reference sheet
  const ref = [
    ...BAKAT_SUBTESTS.map((s) => ({ kind: "BAKAT", code: s.code, name: s.name, parts: s.parts, expectedQuestions: s.expectedQuestions, durationSec: s.durationSec })),
    ...MINAT_SUBTESTS.map((s) => ({ kind: "MINAT", code: s.code, name: s.name, parts: s.parts, expectedQuestions: s.expectedQuestions, durationSec: s.durationSec })),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ref), "Referensi-Subtes");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-soal-tes-minat-bakat.xlsx"',
    },
  });
}
