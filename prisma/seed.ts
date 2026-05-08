import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BAKAT_SUBTESTS, MINAT_SUBTESTS } from "../src/lib/test-config";

const prisma = new PrismaClient();

async function main() {
  // ─── Admin user ──────────────────────────────────────────────────────
  const email = process.env.ADMIN_EMAIL || "admin@tmb.test";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const name = process.env.ADMIN_NAME || "Administrator";
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash, name },
    update: { passwordHash, name },
  });
  console.log(`✓ Admin: ${email}`);

  // ─── Subtests (replace timing if changed) ────────────────────────────
  for (const s of [...BAKAT_SUBTESTS, ...MINAT_SUBTESTS]) {
    await prisma.subtest.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        testKind: s.testKind,
        name: s.name,
        description: s.description,
        durationSec: s.durationSec,
        orderIndex: s.orderIndex,
      },
      update: {
        testKind: s.testKind,
        name: s.name,
        description: s.description,
        durationSec: s.durationSec,
        orderIndex: s.orderIndex,
      },
    });
  }
  console.log(`✓ Subtests: ${BAKAT_SUBTESTS.length + MINAT_SUBTESTS.length}`);

  // ─── Sample questions for BAKAT subtests (skip if any exist) ────────
  await seedBakatSamples();
  await seedMinatSamples();

  console.log("Done.");
}

async function seedBakatSamples() {
  const samples: Record<string, { prompt: string; options: { key: string; label: string }[]; correct: string; parts?: number }[]> = {
    BAKAT_1_VISUAL: [
      { prompt: "Pilih bentuk yang paling berbeda dari empat lainnya:", options: [
        { key: "A", label: "Segitiga" }, { key: "B", label: "Persegi" },
        { key: "C", label: "Lingkaran" }, { key: "D", label: "Persegi panjang" }, { key: "E", label: "Trapesium" },
      ], correct: "C" },
      { prompt: "Manakah yang merupakan kelanjutan dari pola: ▲ ▼ ▲ ▼ ?", options: [
        { key: "A", label: "▲" }, { key: "B", label: "▼" }, { key: "C", label: "■" }, { key: "D", label: "●" }, { key: "E", label: "★" },
      ], correct: "A" },
    ],
    BAKAT_2_NUMERIK: [
      { prompt: "12 + 27 = ?", options: [
        { key: "A", label: "37" }, { key: "B", label: "38" }, { key: "C", label: "39" }, { key: "D", label: "40" }, { key: "E", label: "41" },
      ], correct: "C" },
      { prompt: "Jika 3x = 24, maka x = ?", options: [
        { key: "A", label: "6" }, { key: "B", label: "7" }, { key: "C", label: "8" }, { key: "D", label: "9" }, { key: "E", label: "10" },
      ], correct: "C" },
      { prompt: "15% dari 200 = ?", options: [
        { key: "A", label: "20" }, { key: "B", label: "25" }, { key: "C", label: "30" }, { key: "D", label: "35" }, { key: "E", label: "40" },
      ], correct: "C" },
    ],
    BAKAT_3_VERBAL: [
      { prompt: "Sinonim dari 'PANDAI' adalah:", options: [
        { key: "A", label: "Bodoh" }, { key: "B", label: "Cerdas" }, { key: "C", label: "Lambat" }, { key: "D", label: "Diam" }, { key: "E", label: "Lemah" },
      ], correct: "B" },
      { prompt: "Antonim dari 'GELAP' adalah:", options: [
        { key: "A", label: "Hitam" }, { key: "B", label: "Pekat" }, { key: "C", label: "Terang" }, { key: "D", label: "Buram" }, { key: "E", label: "Sepi" },
      ], correct: "C" },
    ],
    BAKAT_4_URUTAN: [
      { prompt: "Lanjutkan dua suku berikutnya: 2, 4, 6, 8, ?, ?", parts: 2, options: [
        { key: "A", label: "9" }, { key: "B", label: "10" }, { key: "C", label: "11" }, { key: "D", label: "12" }, { key: "E", label: "14" },
      ], correct: "B;D" },
    ],
    BAKAT_5_SPASIAL: [
      { prompt: "Apakah pernyataan ini BENAR? 'Lingkaran memiliki 3 sudut.'", options: [
        { key: "B", label: "Benar" }, { key: "S", label: "Salah" },
      ], correct: "S" },
      { prompt: "Apakah pernyataan ini BENAR? 'Kubus memiliki 6 sisi.'", options: [
        { key: "B", label: "Benar" }, { key: "S", label: "Salah" },
      ], correct: "B" },
    ],
    BAKAT_6_3DIMENSI: [
      { prompt: "Sebuah dadu memiliki angka 1–6. Tentukan jawaban benar pada 3 pertanyaan:", parts: 3, options: [
        { key: "A", label: "Benar" }, { key: "B", label: "Salah" },
      ], correct: "A;A;B" },
    ],
    BAKAT_7_SISTEMATISASI: [
      { prompt: "Apakah dua kelompok angka berikut SAMA? '12345' = '12345'", options: [
        { key: "S", label: "Sama" }, { key: "B", label: "Beda" },
      ], correct: "S" },
      { prompt: "Apakah dua kelompok angka berikut SAMA? '78901' = '78910'", options: [
        { key: "S", label: "Sama" }, { key: "B", label: "Beda" },
      ], correct: "B" },
    ],
    BAKAT_8_KOSAKATA: [
      { prompt: "Apa arti kata 'INDUSTRI'?", options: [
        { key: "A", label: "Pertanian" }, { key: "B", label: "Pabrik" }, { key: "C", label: "Hiburan" }, { key: "D", label: "Kesehatan" }, { key: "E", label: "Olahraga" },
      ], correct: "B" },
      { prompt: "Sinonim 'OPTIMISME' adalah:", options: [
        { key: "A", label: "Pesimisme" }, { key: "B", label: "Harapan" }, { key: "C", label: "Keputusasaan" }, { key: "D", label: "Kemarahan" }, { key: "E", label: "Diam" },
      ], correct: "B" },
    ],
    BAKAT_9_FIGURAL: [
      { prompt: "Lanjutkan deret: 1, 4, 9, 16, ?", options: [
        { key: "A", label: "20" }, { key: "B", label: "23" }, { key: "C", label: "25" }, { key: "D", label: "28" }, { key: "E", label: "30" },
      ], correct: "C" },
      { prompt: "Lanjutkan deret: 2, 6, 12, 20, ?", options: [
        { key: "A", label: "28" }, { key: "B", label: "30" }, { key: "C", label: "32" }, { key: "D", label: "34" }, { key: "E", label: "36" },
      ], correct: "B" },
    ],
  };

  for (const [code, list] of Object.entries(samples)) {
    const subtest = await prisma.subtest.findUnique({ where: { code } });
    if (!subtest) continue;
    const existing = await prisma.question.count({ where: { subtestId: subtest.id } });
    if (existing > 0) continue;
    let no = 1;
    for (const q of list) {
      const parts = q.parts ?? 1;
      const correctVal: unknown =
        parts > 1
          ? q.correct.split(/[;,]/).map((s) => s.trim().toUpperCase())
          : q.correct.trim().toUpperCase();
      await prisma.question.create({
        data: {
          subtestId: subtest.id,
          questionNo: no++,
          prompt: q.prompt,
          parts,
          options: q.options as unknown as object,
          correct: correctVal as object,
        },
      });
    }
    console.log(`  ✓ ${code}: ${list.length} sample questions`);
  }
}

async function seedMinatSamples() {
  // Bidang Minat (8 letters) — 28 items, pasangan kata.
  // Untuk demo: 8 contoh pasangan, peserta nyata akan pakai upload XLSX.
  const bidangPairs = [
    ["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"],
    ["E", "F"], ["F", "G"], ["G", "H"], ["H", "A"],
  ];
  const bidangLabels: Record<string, string> = {
    A: "Komunikasi", B: "Seni", C: "Kesehatan", D: "Pariwisata",
    E: "Administrasi", F: "Teknologi", G: "Agribisnis", H: "Teknik",
  };
  const bidang = await prisma.subtest.findUnique({ where: { code: "MINAT_BIDANG" } });
  if (bidang) {
    const existing = await prisma.question.count({ where: { subtestId: bidang.id } });
    if (existing === 0) {
      let no = 1;
      for (const [a, b] of bidangPairs) {
        await prisma.question.create({
          data: {
            subtestId: bidang.id,
            questionNo: no++,
            prompt: "Pilih satu yang paling Anda sukai:",
            parts: 1,
            options: [
              { key: a, label: bidangLabels[a] },
              { key: b, label: bidangLabels[b] },
            ] as unknown as object,
            correct: "" as unknown as object,
          },
        });
      }
      console.log(`  ✓ MINAT_BIDANG: ${bidangPairs.length} sample items`);
    }
  }

  // Program subtests A–H (each 4 sample items)
  for (const letter of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const sub = await prisma.subtest.findUnique({ where: { code: `MINAT_PROG_${letter}` } });
    if (!sub) continue;
    const existing = await prisma.question.count({ where: { subtestId: sub.id } });
    if (existing > 0) continue;
    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    let no = 1;
    for (let i = 0; i < 4; i++) {
      const left = labels[i % labels.length];
      const right = labels[(i + 1) % labels.length];
      await prisma.question.create({
        data: {
          subtestId: sub.id,
          questionNo: no++,
          prompt: `Pilih yang paling sesuai dengan minat Anda (program ${letter}):`,
          parts: 1,
          options: [
            { key: left, label: `Pilihan ${left}` },
            { key: right, label: `Pilihan ${right}` },
          ] as unknown as object,
          correct: "" as unknown as object,
        },
      });
    }
    console.log(`  ✓ MINAT_PROG_${letter}: 4 sample items`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
