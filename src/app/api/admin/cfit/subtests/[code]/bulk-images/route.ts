import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { getSupabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES, MIME_TO_EXT } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UPLOAD MASSAL GAMBAR CFIT — gambar otomatis terpasang ke soal/pilihan
// berdasarkan NAMA FILE. Syarat: soal (nomor + kunci) sudah dibuat lewat
// upload XLSX subtes ini terlebih dahulu.
//
// Pola nama file (huruf besar/kecil bebas; pemisah -, _, spasi opsional):
//   1.png            -> gambar soal nomor 1
//   1a.png / 1-a.png -> gambar pilihan 'a' soal nomor 1
//   c1.png           -> gambar soal CONTOH nomor 1 (boleh: contoh1.png)
//   c1a.png          -> gambar pilihan 'a' soal contoh nomor 1
// File yang tidak cocok pola / soalnya belum ada akan DILEWATI dan
// dilaporkan ke admin (tidak menggagalkan file lain).

type NormOption = { key: string; label: string; imageUrl: string | null };

function normalizeOptions(raw: unknown): NormOption[] {
  if (!Array.isArray(raw)) return [];
  const out: NormOption[] = [];
  for (const o of raw) {
    if (typeof o === "string") {
      if (o.trim()) out.push({ key: o.trim(), label: "", imageUrl: null });
    } else if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      const key = String(obj.key ?? "").trim();
      if (key) {
        out.push({
          key,
          label: obj.label ? String(obj.label) : "",
          imageUrl: obj.imageUrl ? String(obj.imageUrl) : null,
        });
      }
    }
  }
  return out;
}

type ParsedName = { isExample: boolean; questionNo: number; optionKey: string | null };

function parseFileName(name: string): ParsedName | null {
  const base = (name.split("/").pop() || name)
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase();
  const m = /^(contoh|c)?[-_ ]*(\d{1,3})[-_ ]*([a-h])?$/.exec(base);
  if (!m) return null;
  const questionNo = parseInt(m[2], 10);
  if (!Number.isFinite(questionNo) || questionNo < 1) return null;
  return { isExample: !!m[1], questionNo, optionKey: m[3] || null };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    return await handle(req, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cfit bulk-images] unhandled error:", err);
    return NextResponse.json({ error: `Gagal upload massal: ${msg}` }, { status: 500 });
  }
}

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "Supabase storage belum dikonfigurasi" }, { status: 500 });
  }

  const { code } = await ctx.params;
  const subtest = await prisma.cfitSubtest.findUnique({ where: { code } });
  if (!subtest) {
    return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });
  }

  const form = await req.formData();
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Tidak ada file gambar yang dikirim." }, { status: 400 });
  }

  const questions = await prisma.cfitQuestion.findMany({
    where: { subtestId: subtest.id },
    select: { id: true, questionNo: true, isExample: true, options: true },
  });
  const qMap = new Map(questions.map((q) => [`${q.isExample ? "c" : "q"}${q.questionNo}`, q]));

  type Pending = { imageUrl?: string; optionImages: Map<string, string> };
  const pending = new Map<string, Pending>();
  const skipped: Array<{ file: string; reason: string }> = [];
  let assigned = 0;

  for (const f of files) {
    const parsed = parseFileName(f.name);
    if (!parsed) {
      skipped.push({
        file: f.name,
        reason: "Nama file tidak sesuai pola (contoh benar: 1.png, 1a.png, c1.png, c1a.png)",
      });
      continue;
    }
    const q = qMap.get(`${parsed.isExample ? "c" : "q"}${parsed.questionNo}`);
    if (!q) {
      skipped.push({
        file: f.name,
        reason: `${parsed.isExample ? "Soal contoh" : "Soal"} nomor ${parsed.questionNo} belum ada di subtes ini — upload XLSX (nomor & kunci) terlebih dahulu.`,
      });
      continue;
    }

    // Validasi MIME — JANGAN percaya ekstensi dari nama file.
    const mime = (f.type || "").toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      skipped.push({
        file: f.name,
        reason: `Tipe file tidak didukung (${mime || "unknown"}). Hanya: ${Array.from(ALLOWED_IMAGE_MIME).join(", ")}`,
      });
      continue;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1);
      skipped.push({ file: f.name, reason: `Ukuran melebihi batas ${mb} MB.` });
      continue;
    }

    const ext = MIME_TO_EXT[mime] || "bin";
    // Nama key random pakai randomBytes (CSPRNG) — jangan ambil dari nama file.
    const key = `cfit-${subtest.code}-${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(key, buf, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      skipped.push({ file: f.name, reason: `Gagal upload ke storage: ${error.message}` });
      continue;
    }
    const { data: pub } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(key);

    const p = pending.get(q.id) ?? { optionImages: new Map<string, string>() };
    if (parsed.optionKey) p.optionImages.set(parsed.optionKey, pub.publicUrl);
    else p.imageUrl = pub.publicUrl;
    pending.set(q.id, p);
    assigned++;
  }

  // Terapkan ke database — satu update per soal.
  let updatedQuestions = 0;
  for (const [qid, p] of pending) {
    const q = questions.find((x) => x.id === qid);
    if (!q) continue;
    const data: { imageUrl?: string; options?: Prisma.InputJsonValue } = {};
    if (p.imageUrl) data.imageUrl = p.imageUrl;
    if (p.optionImages.size > 0) {
      const opts = normalizeOptions(q.options);
      for (const [k, url] of p.optionImages) {
        const hit = opts.find((o) => o.key.toLowerCase() === k);
        if (hit) hit.imageUrl = url;
        else opts.push({ key: k, label: "", imageUrl: url });
      }
      opts.sort((a, b) => a.key.localeCompare(b.key));
      data.options = opts as unknown as Prisma.InputJsonValue;
    }
    await prisma.cfitQuestion.update({ where: { id: qid }, data });
    updatedQuestions++;
  }

  return NextResponse.json({
    ok: true,
    subtest: { code: subtest.code, name: subtest.name },
    assigned,
    updatedQuestions,
    skipped,
  });
}
