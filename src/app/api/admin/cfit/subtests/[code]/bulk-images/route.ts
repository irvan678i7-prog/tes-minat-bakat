import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { getSupabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES, MIME_TO_EXT } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// UNGGAH BANYAK GAMBAR SEKALIGUS untuk satu subtes CFIT.
//
// Admin memilih/menarik banyak file gambar sekaligus; pemetaan gambar → soal
// diambil dari NAMA FILE, jadi tidak perlu menempel URL satu per satu:
//
//   01.png        → gambar SOAL nomor 1
//   01b.png       → gambar PILIHAN b pada soal nomor 1 (boleh 01_b / 01-b)
//   c01.png       → gambar CONTOH nomor 1 (boleh contoh01.png)
//   c01a.png      → gambar pilihan a pada CONTOH nomor 1
//   3A_SERIES_07_d.png → nomor & huruf diambil dari bagian akhir nama file
//
// Kunci jawaban ditempel sekali dalam field `keys`: "1=c, 2=b+d, c1=a".
// Soal asli BARU tanpa kunci ditolak (kunci kosong membuat skor selalu 0),
// dan penolakan terjadi SEBELUM gambar apa pun diunggah.

const DEFAULT_KEYS: Record<string, string[]> = {
  SERIES: ["a", "b", "c", "d", "e", "f"],
  CLASSIFICATION: ["a", "b", "c", "d", "e"],
  MATRICES: ["a", "b", "c", "d", "e", "f"],
  CONDITIONS: ["a", "b", "c", "d", "e"],
};

type OptionItem = { key: string; label: string; imageUrl: string | null };

function normalizeOptions(raw: unknown): OptionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: OptionItem[] = [];
  for (const o of raw) {
    if (typeof o === "string") {
      if (o.trim()) out.push({ key: o.trim().toLowerCase(), label: "", imageUrl: null });
    } else if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      const key = String(obj.key ?? "").trim().toLowerCase();
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

function correctList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  const s = raw === null || raw === undefined ? "" : String(raw).trim().toLowerCase();
  return s ? [s] : [];
}

type ParsedName = { isExample: boolean; questionNo: number; optionKey: string | null };

// Baca nama file → (contoh?, nomor soal, huruf opsi). Nomor & huruf diambil
// dari bagian AKHIR nama file supaya prefiks bebas (mis. "3A_SERIES_07_d").
export function parseImageFileName(fileName: string): ParsedName | null {
  const base = fileName.replace(/\.[^.]+$/, "").trim().toLowerCase();
  if (!base) return null;
  const isExample = /contoh/.test(base) || /(^|[_\-. ])c\s*0*\d/.test(base);
  const m = base.match(/(\d{1,3})\s*[_\-. ]?\s*([a-h])?$/);
  if (!m) return null;
  const questionNo = parseInt(m[1], 10);
  if (!Number.isFinite(questionNo) || questionNo < 1) return null;
  return { isExample, questionNo, optionKey: m[2] ? m[2].toLowerCase() : null };
}

// "1=c, 2=b+d, c1=a" → Map("s:1" → ["c"], "s:2" → ["b","d"], "c:1" → ["a"])
export function parseKeyMap(raw: string): { map: Map<string, string[]>; invalid: string[] } {
  const map = new Map<string, string[]>();
  const invalid: string[] = [];
  const entries = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const m = entry.match(/^(c(?:ontoh)?)?\s*0*(\d{1,3})\s*[=:]\s*(.+)$/i);
    if (!m) {
      invalid.push(entry);
      continue;
    }
    const isExample = !!m[1];
    const no = parseInt(m[2], 10);
    const letters = m[3]
      .toLowerCase()
      .split(/[+/&,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!Number.isFinite(no) || letters.length === 0) {
      invalid.push(entry);
      continue;
    }
    map.set(`${isExample ? "c" : "s"}:${no}`, letters);
  }
  return { map, invalid };
}

type Group = {
  isExample: boolean;
  questionNo: number;
  stemFile: File | null;
  optionFiles: Map<string, File>;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    return await handle(req, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cfit bulk-images] unhandled error:", err);
    return NextResponse.json({ error: `Gagal menyimpan: ${msg}` }, { status: 500 });
  }
}

async function handle(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code: rawCode } = await ctx.params;
  const code = decodeURIComponent(rawCode);
  const sub = await prisma.cfitSubtest.findUnique({ where: { code } });
  if (!sub) return NextResponse.json({ error: "Subtes tidak ditemukan" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 file gambar." }, { status: 400 });
  }

  const keysRaw = typeof form.get("keys") === "string" ? (form.get("keys") as string) : "";
  const { map: keyMap, invalid: invalidKeys } = parseKeyMap(keysRaw);
  if (invalidKeys.length > 0) {
    return NextResponse.json(
      {
        error:
          `Format kunci jawaban tidak dikenali: ${invalidKeys.join(", ")}. ` +
          `Contoh yang benar: 1=c, 2=b+d, c1=a`,
      },
      { status: 400 },
    );
  }

  const replaceRaw = form.get("replaceAll");
  const doReplace = typeof replaceRaw === "string" && (replaceRaw === "1" || replaceRaw === "true");

  // 1) Baca nama semua file dulu — belum ada yang diunggah.
  const groups = new Map<string, Group>();
  const badNames: string[] = [];
  for (const f of files) {
    const parsed = parseImageFileName(f.name);
    if (!parsed) {
      badNames.push(f.name);
      continue;
    }
    const gk = `${parsed.isExample ? "c" : "s"}:${parsed.questionNo}`;
    const g =
      groups.get(gk) ??
      ({
        isExample: parsed.isExample,
        questionNo: parsed.questionNo,
        stemFile: null,
        optionFiles: new Map<string, File>(),
      } satisfies Group);
    if (parsed.optionKey) g.optionFiles.set(parsed.optionKey, f);
    else g.stemFile = f;
    groups.set(gk, g);
  }
  if (badNames.length > 0) {
    return NextResponse.json(
      {
        error:
          `Nama file berikut tidak memuat nomor soal: ${badNames.join(", ")}. ` +
          `Gunakan pola 01.png (gambar soal), 01b.png (pilihan b), c01.png (contoh).`,
      },
      { status: 400 },
    );
  }

  const groupList = [...groups.values()].sort(
    (a, b) => Number(a.isExample) - Number(b.isExample) || a.questionNo - b.questionNo,
  );

  // 2) Soal yang sudah ada (untuk mode gabung, kunci lama tetap dipakai).
  const existingRows = doReplace
    ? []
    : await prisma.cfitQuestion.findMany({ where: { subtestId: sub.id } });
  const existingBy = new Map(
    existingRows.map((q) => [`${q.isExample ? "c" : "s"}:${q.questionNo}`, q]),
  );

  const defaultKeys =
    DEFAULT_KEYS[sub.code.split("_").slice(1).join("_")] ?? ["a", "b", "c", "d", "e", "f"];

  // 3) VALIDASI KUNCI — sebelum satu file pun diunggah, supaya admin tidak
  //    menunggu unggahan lama lalu ditolak. Kunci kosong pada soal asli
  //    membuat skor selalu 0, jadi wajib ada.
  const needKeys: number[] = [];
  const badKeyRefs: string[] = [];
  for (const g of groupList) {
    const gk = `${g.isExample ? "c" : "s"}:${g.questionNo}`;
    const fromInput = keyMap.get(gk) ?? null;
    const old = existingBy.get(gk);
    const effective = fromInput ?? (old ? correctList(old.correct) : []);
    if (!g.isExample && effective.length === 0) needKeys.push(g.questionNo);

    if (fromInput) {
      const optionKeys =
        g.optionFiles.size > 0
          ? [...g.optionFiles.keys()]
          : old
            ? normalizeOptions(old.options).map((o) => o.key)
            : defaultKeys;
      const unknown = fromInput.filter((k) => !optionKeys.includes(k));
      if (unknown.length > 0) {
        badKeyRefs.push(
          `${g.isExample ? "contoh " : "soal "}${g.questionNo}: kunci '${unknown.join(", ")}' bukan pilihan yang tersedia (${optionKeys.join(", ")})`,
        );
      }
    }
  }
  if (badKeyRefs.length > 0) {
    return NextResponse.json({ error: "Kunci tidak valid:\n- " + badKeyRefs.join("\n- ") }, { status: 400 });
  }
  if (needKeys.length > 0) {
    return NextResponse.json(
      {
        error:
          `Kunci jawaban belum ada untuk soal nomor: ${needKeys.join(", ")}. ` +
          `Tambahkan di kotak kunci (mis. ${needKeys[0]}=c) atau tandai sebagai contoh (nama file c${String(needKeys[0]).padStart(2, "0")}.png). ` +
          `Tidak ada gambar yang diunggah.`,
      },
      { status: 400 },
    );
  }

  // 4) Unggah semua gambar ke Supabase Storage.
  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "Supabase storage belum dikonfigurasi." }, { status: 500 });
  }

  async function uploadOne(f: File, tag: string): Promise<{ url?: string; error?: string }> {
    const mime = (f.type || "").toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      return {
        error: `tipe file tidak didukung (${mime || "unknown"}). Hanya: ${Array.from(ALLOWED_IMAGE_MIME).join(", ")}`,
      };
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1);
      return { error: `ukuran melebihi batas ${mb} MB` };
    }
    const ext = MIME_TO_EXT[mime] || "bin";
    // Nama objek dibuat acak (CSPRNG) — tidak memakai nama file dari admin.
    const key = `cfit-${sub!.code}-${tag}-${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error } = await sb!.storage.from(SUPABASE_BUCKET).upload(key, buf, {
      contentType: mime,
      upsert: false,
    });
    if (error) return { error: error.message };
    const { data: pub } = sb!.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
    return { url: pub.publicUrl };
  }

  type Resolved = {
    isExample: boolean;
    questionNo: number;
    stemUrl: string | null;
    optionUrls: Map<string, string>;
  };
  const resolved: Resolved[] = [];
  let uploaded = 0;
  for (const g of groupList) {
    const tagBase = `${g.isExample ? "c" : "q"}${g.questionNo}`;
    let stemUrl: string | null = null;
    if (g.stemFile) {
      const r = await uploadOne(g.stemFile, `${tagBase}-stem`);
      if (r.error) {
        return NextResponse.json(
          { error: `Gagal mengunggah ${g.stemFile.name}: ${r.error}` },
          { status: 500 },
        );
      }
      stemUrl = r.url ?? null;
      uploaded++;
    }
    const optionUrls = new Map<string, string>();
    for (const [letter, f] of g.optionFiles) {
      const r = await uploadOne(f, `${tagBase}-${letter}`);
      if (r.error) {
        return NextResponse.json({ error: `Gagal mengunggah ${f.name}: ${r.error}` }, { status: 500 });
      }
      if (r.url) optionUrls.set(letter, r.url);
      uploaded++;
    }
    resolved.push({ isExample: g.isExample, questionNo: g.questionNo, stemUrl, optionUrls });
  }

  // 5) Tulis ke bank soal. Mode GANTI SEMUA menghapus soal lama subtes ini
  //    (beserta jawaban peserta pada soal-soal tersebut); mode GABUNG hanya
  //    memperbarui gambar/kunci soal yang nomornya sama dan menambah yang baru.
  let created = 0;
  let updated = 0;

  if (doReplace) {
    await prisma.$transaction([
      prisma.cfitAnswer.deleteMany({ where: { question: { subtestId: sub.id } } }),
      prisma.cfitQuestion.deleteMany({ where: { subtestId: sub.id } }),
    ]);
  }

  for (const r of resolved) {
    const gk = `${r.isExample ? "c" : "s"}:${r.questionNo}`;
    const old = doReplace ? undefined : existingBy.get(gk);
    const keyFromInput = keyMap.get(gk) ?? null;

    // Susunan pilihan: gabungkan pilihan lama (kalau ada) dengan gambar baru;
    // kalau belum ada apa pun, pakai huruf standar subtes.
    const baseOptions: OptionItem[] = old
      ? normalizeOptions(old.options)
      : (r.optionUrls.size > 0 ? [...r.optionUrls.keys()].sort() : defaultKeys).map((k) => ({
          key: k,
          label: "",
          imageUrl: null,
        }));
    const byKey = new Map(baseOptions.map((o) => [o.key, o]));
    for (const [letter, url] of r.optionUrls) {
      const cur = byKey.get(letter);
      byKey.set(letter, { key: letter, label: cur?.label ?? "", imageUrl: url });
    }
    const options = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));

    const correctArr = keyFromInput ?? (old ? correctList(old.correct) : []);
    const correct: unknown = correctArr.length === 1 ? correctArr[0] : correctArr;

    if (old) {
      await prisma.cfitQuestion.update({
        where: { id: old.id },
        data: {
          imageUrl: r.stemUrl ?? old.imageUrl,
          options: options as never,
          correct: correct as never,
        },
      });
      updated++;
    } else {
      await prisma.cfitQuestion.create({
        data: {
          subtestId: sub.id,
          questionNo: r.questionNo,
          prompt: "",
          imageUrl: r.stemUrl,
          options: options as never,
          correct: correct as never,
          isExample: r.isExample,
        },
      });
      created++;
    }
  }

  return NextResponse.json({
    ok: true,
    subtest: { code: sub.code, name: sub.name },
    uploaded,
    created,
    updated,
    replaced: doReplace,
  });
}
