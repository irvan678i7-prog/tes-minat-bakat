import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";
import { getAdminFromRequest } from "@/lib/auth";
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES, MIME_TO_EXT } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase storage belum dikonfigurasi" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File required" }, { status: 400 });

  // Validasi MIME — JANGAN percaya ekstensi dari nama file (mudah di-spoof).
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Tipe file tidak didukung. Hanya: ${Array.from(ALLOWED_IMAGE_MIME).join(", ")}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1);
    return NextResponse.json(
      { error: `Ukuran file melebihi batas ${mb} MB.` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File kosong." }, { status: 400 });
  }

  const ext = MIME_TO_EXT[mime] || "bin";
  // Nama file random — pakai randomBytes (CSPRNG), bukan nama dari user.
  const key = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(key, buf, {
    contentType: mime,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: pub } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
  return NextResponse.json({ url: pub.publicUrl, key });
}
