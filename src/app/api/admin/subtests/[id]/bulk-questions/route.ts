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

export async function POST(
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

  const sb = getSupabaseAdmin();

  // Upload gambar yang dikirim sebagai file. Pastikan setiap meta entry punya
  // imageUrl (entah dari upload baru atau dari nilai yang sudah ada).
  const uploadedUrls: (string | null)[] = new Array(meta.length).fill(null);
  for (let i = 0; i < meta.length; i++) {
    const f = form.get(`image_${i}`);
    if (f instanceof File && f.size > 0) {
      if (!sb) {
        return NextResponse.json(
          { error: "Supabase storage belum dikonfigurasi" },
          { status: 500 },
        );
      }
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const safeExt = ext.length > 0 && ext.length <= 5 ? ext : "png";
      const key = `bulk-${sub.code}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      const buf = Buffer.from(await f.arrayBuffer());
      const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(key, buf, {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      });
      if (error) {
        return NextResponse.json(
          { error: `Upload gambar ke-${i + 1} gagal: ${error.message}` },
          { status: 500 },
        );
      }
      const { data: pub } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
      uploadedUrls[i] = pub.publicUrl;
    } else if (meta[i].imageUrl && typeof meta[i].imageUrl === "string") {
      uploadedUrls[i] = meta[i].imageUrl as string;
    } else {
      // Belum ada gambar untuk index ini. Kita tetap bolehkan supaya admin bisa
      // simpan draft tanpa gambar — tapi soal tanpa gambar TIDAK terlihat oleh
      // siswa kalau prompt juga kosong.
      uploadedUrls[i] = null;
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
    scoringTag: string | null;
    isExample: boolean;
    inputMode: string;
  };

  const data: Row[] = meta.map((m, i) => {
    const parts = isSpasial
      ? SPASIAL_PARTS
      : isSistematis
      ? Math.max(1, Math.min(12, Number(m.parts ?? 12) || 12))
      : Math.max(1, Number(m.parts ?? 1) || 1);
    const kunci = normalizeKunci(m.kunci, parts);
    // SPASIAL kunci selalu upper-case (B/S). SISTEMATIS dibiarkan (huruf
    // A-L akan dinormalisasi case-insensitively saat scoring).
    const correctArr = isSpasial ? kunci.map((s) => s.toUpperCase()) : kunci;
    const opts: object = isSpasial
      ? (SPASIAL_OPTIONS as unknown as object)
      : ([] as unknown as object);
    return {
      subtestId: sub.id,
      questionNo: Number(m.questionNo ?? i + 1) || i + 1,
      prompt: typeof m.prompt === "string" ? m.prompt : "",
      imageUrl: uploadedUrls[i],
      imageUrl2: null,
      parts,
      options: opts,
      correct: correctArr as unknown as object,
      scoringTag: null,
      isExample: !!m.isExample,
      // SPASIAL pakai CHOICE (tombol B/S), SISTEMATIS pakai TEXT (ketik huruf).
      inputMode: isSpasial ? "CHOICE" : "TEXT",
    };
  });

  const replaceAll = form.get("replaceAll");
  const doReplace = typeof replaceAll === "string" && (replaceAll === "1" || replaceAll === "true");

  // Replace seluruh Question subtes ini (default), atau append (kalau diminta).
  if (doReplace) {
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { question: { subtestId: sub.id } } }),
      prisma.question.deleteMany({ where: { subtestId: sub.id } }),
      prisma.question.createMany({ data: data as unknown as Prisma.QuestionCreateManyInput[] }),
    ]);
  } else {
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
