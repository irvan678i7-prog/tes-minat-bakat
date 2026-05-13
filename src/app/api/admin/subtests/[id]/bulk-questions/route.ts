import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { getSupabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";

// Bulk upload soal berbasis gambar — khusus subtes yang strukturnya
// "1 gambar = 1 soal dengan N kunci jawaban", seperti SISTEMATIS (parts 12)
// dan SPASIAL (parts 5). Admin upload banyak gambar sekaligus + isi kunci
// di form, server upload semua gambar ke Supabase lalu replace seluruh
// Question untuk subtes ini.

const SISTEMATIS_CODE = "BAKAT_7_SISTEMATISASI";
const SPASIAL_CODE = "BAKAT_5_SPASIAL";
const SPASIAL_PARTS = 5;
// Max parts per soal SISTEMATIS. Bumped 12 -> 24 supaya match buku yang
// pakai opsi A-X (24 huruf).
const SISTEMATIS_MAX_PARTS = 24;
const SPASIAL_OPTIONS: { key: string; label: string }[] = [
  { key: "B", label: "Sama (B)" },
  { key: "S", label: "Beda (S)" },
];

type MetaItem = {
  parts?: number;
  kunci?: unknown;
  prompt?: string;
  questionNo?: number;
  isExample?: boolean;
  imageUrl?: string; // gambar yang sudah ada (re-use, tidak upload ulang)
  // Custom label nomor di tiap sel lembar jawaban (override default 1..N).
  // Boleh string angka (mis. "6") atau huruf. Panjang = parts.
  partLabels?: unknown;
};

function isMetaItem(v: unknown): v is MetaItem {
  return !!v && typeof v === "object";
}

function normalizeKunci(raw: unknown, parts: number): string[] {
  const arr: string[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) arr.push(v == null ? "" : String(v).trim());
  }
  while (arr.length < parts) arr.push("");
  return arr.slice(0, parts);
}

// Normalisasi partLabels: array string yang panjangnya = parts. Kalau
// admin tidak isi (atau pakai default 1..N), kita return null supaya
// student view fallback ke label default dari test-config.
function normalizePartLabels(raw: unknown, parts: number): string[] | null {
  if (!Array.isArray(raw)) return null;
  const arr: string[] = [];
  for (const v of raw) arr.push(v == null ? "" : String(v).trim());
  while (arr.length < parts) arr.push("");
  const sliced = arr.slice(0, parts);
  // Default = ["1", "2", …]. Anggap admin pakai default kalau semua sel
  // kosong ATAU semua sel persis cocok 1..parts. Simpan null untuk
  // hemat storage & supaya fallback otomatis terpicu.
  const isAllEmpty = sliced.every((s) => s === "");
  const isDefault = sliced.every((s, i) => s === String(i + 1));
  if (isAllEmpty || isDefault) return null;
  return sliced;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return await handle(req, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bulk-questions] unhandled error:", err);
    return NextResponse.json(
      { error: `Gagal menyimpan: ${msg}` },
      { status: 500 },
    );
  }
}

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sub = await prisma.subtest.findUnique({ where: { id } });
  if (!sub) return NextResponse.json({ error: "Subtest tidak ditemukan" }, { status: 404 });

  // Hanya izinkan untuk subtes yang strukturnya 1 gambar = N parts.
  if (sub.code !== SISTEMATIS_CODE && sub.code !== SPASIAL_CODE) {
    return NextResponse.json(
      {
        error:
          "Upload massal hanya didukung untuk subtes SPASIAL & SISTEMATIS. Subtes lain tetap pakai template Excel.",
      },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const metaRaw = form.get("meta");
  if (typeof metaRaw !== "string") {
    return NextResponse.json({ error: "Field 'meta' wajib (JSON string)" }, { status: 400 });
  }
  let meta: MetaItem[];
  try {
    const parsed = JSON.parse(metaRaw);
    if (!Array.isArray(parsed)) throw new Error("meta must be an array");
    meta = parsed.filter(isMetaItem);
  } catch (e) {
    return NextResponse.json(
      { error: `meta tidak valid: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  if (meta.length === 0) {
    return NextResponse.json({ error: "Minimal 1 soal." }, { status: 400 });
  }

  const isSpasial = sub.code === SPASIAL_CODE;
  const isSistematis = sub.code === SISTEMATIS_CODE;
  const subCode = sub.code;

  const sb = getSupabaseAdmin();

  // Helper upload satu File ke Supabase storage. Return public URL atau null
  // kalau file kosong. Mengembalikan error message kalau gagal supaya caller
  // bisa propagate ke client.
  async function uploadOne(
    f: FormDataEntryValue | null,
    i: number,
    slot: "image" | "image2",
  ): Promise<{ url: string | null; error?: string }> {
    if (!(f instanceof File) || f.size === 0) return { url: null };
    if (!sb) return { url: null, error: "Supabase storage belum dikonfigurasi" };
    const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeExt = ext.length > 0 && ext.length <= 5 ? ext : "png";
    const key = `bulk-${subCode}-${slot}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(key, buf, {
      contentType: f.type || "application/octet-stream",
      upsert: false,
    });
    if (error) return { url: null, error: error.message };
    const { data: pub } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
    return { url: pub.publicUrl };
  }

  // Upload gambar yang dikirim sebagai file. Pastikan setiap meta entry punya
  // imageUrl (entah dari upload baru atau dari nilai yang sudah ada).
  // imageUrl2 hanya didukung untuk SISTEMATIS (gambar soal + gambar pertanyaan).
  const uploadedUrls: (string | null)[] = new Array(meta.length).fill(null);
  const uploadedUrls2: (string | null)[] = new Array(meta.length).fill(null);
  for (let i = 0; i < meta.length; i++) {
    const r1 = await uploadOne(form.get(`image_${i}`), i, "image");
    if (r1.error) {
      return NextResponse.json(
        { error: `Upload gambar ke-${i + 1} gagal: ${r1.error}` },
        { status: 500 },
      );
    }
    if (r1.url !== null) uploadedUrls[i] = r1.url;
    else if (meta[i].imageUrl && typeof meta[i].imageUrl === "string")
      uploadedUrls[i] = meta[i].imageUrl as string;
    else uploadedUrls[i] = null;

    if (isSistematis) {
      const r2 = await uploadOne(form.get(`image2_${i}`), i, "image2");
      if (r2.error) {
        return NextResponse.json(
          { error: `Upload gambar pertanyaan ke-${i + 1} gagal: ${r2.error}` },
          { status: 500 },
        );
      }
      uploadedUrls2[i] = r2.url;
    }
  }

  type Row = {
    subtestId: string;
    questionNo: number;
    prompt: string;
    imageUrl: string | null;
    imageUrl2: string | null;
    parts: number;
    options: object;
    correct: object;
    partLabels: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    scoringTag: string | null;
    isExample: boolean;
    inputMode: string;
  };

  const data: Row[] = meta.map((m, i) => {
    const parts = isSpasial
      ? SPASIAL_PARTS
      : isSistematis
      ? Math.max(1, Math.min(SISTEMATIS_MAX_PARTS, Number(m.parts ?? 12) || 12))
      : Math.max(1, Number(m.parts ?? 1) || 1);
    const kunci = normalizeKunci(m.kunci, parts);
    // SPASIAL kunci selalu upper-case (B/S). SISTEMATIS dibiarkan (huruf
    // A-L akan dinormalisasi case-insensitively saat scoring).
    const correctArr = isSpasial ? kunci.map((s) => s.toUpperCase()) : kunci;
    const opts: object = isSpasial
      ? (SPASIAL_OPTIONS as unknown as object)
      : ([] as unknown as object);
    const partLabelsArr = normalizePartLabels(m.partLabels, parts);
    const partLabels: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      partLabelsArr === null
        ? Prisma.JsonNull
        : (partLabelsArr as unknown as Prisma.InputJsonValue);
    return {
      subtestId: sub.id,
      questionNo: Number(m.questionNo ?? i + 1) || i + 1,
      prompt: typeof m.prompt === "string" ? m.prompt : "",
      imageUrl: uploadedUrls[i],
      imageUrl2: uploadedUrls2[i],
      parts,
      options: opts,
      correct: correctArr as unknown as object,
      partLabels,
      scoringTag: null,
      isExample: !!m.isExample,
      // SPASIAL pakai CHOICE (tombol B/S), SISTEMATIS pakai TEXT (ketik huruf).
      inputMode: isSpasial ? "CHOICE" : "TEXT",
    };
  });

  const replaceAll = form.get("replaceAll");
  const doReplace = typeof replaceAll === "string" && (replaceAll === "1" || replaceAll === "true");

  // Replace seluruh Question subtes ini (default), atau append (kalau diminta).
  // Saat append, questionNo dari client (1..N) akan bentrok dengan questionNo
  // soal lama karena ada unique constraint @@unique([subtestId, questionNo,
  // isExample]). Jadi kita re-base questionNo per group (isExample) dari max
  // yang sudah ada + 1.
  if (doReplace) {
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { question: { subtestId: sub.id } } }),
      prisma.question.deleteMany({ where: { subtestId: sub.id } }),
      prisma.question.createMany({ data: data as unknown as Prisma.QuestionCreateManyInput[] }),
    ]);
  } else {
    const [maxSoal, maxContoh] = await Promise.all([
      prisma.question.findFirst({
        where: { subtestId: sub.id, isExample: false },
        orderBy: { questionNo: "desc" },
        select: { questionNo: true },
      }),
      prisma.question.findFirst({
        where: { subtestId: sub.id, isExample: true },
        orderBy: { questionNo: "desc" },
        select: { questionNo: true },
      }),
    ]);
    let nextSoal = (maxSoal?.questionNo ?? 0) + 1;
    let nextContoh = (maxContoh?.questionNo ?? 0) + 1;
    for (const row of data) {
      if (row.isExample) {
        row.questionNo = nextContoh++;
      } else {
        row.questionNo = nextSoal++;
      }
    }
    await prisma.question.createMany({
      data: data as unknown as Prisma.QuestionCreateManyInput[],
    });
  }

  return NextResponse.json({
    ok: true,
    subtest: { code: sub.code, name: sub.name },
    created: data.length,
    replaced: doReplace,
  });
}
