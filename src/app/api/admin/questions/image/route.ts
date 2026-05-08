import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";
import { getAdminFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase storage belum dikonfigurasi" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File required" }, { status: 400 });

  const ext = file.name.split(".").pop() || "png";
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(key, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: pub } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
  return NextResponse.json({ url: pub.publicUrl, key });
}
