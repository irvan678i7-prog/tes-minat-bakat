import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formsFor, getCfitFromRequest } from "@/lib/cfit/auth";
import { computeCfitSubtestLock, ensureCfitSubtestStarted, type CfitSubtestLockInfo } from "@/lib/cfit/lock";
import { cfitBreakRemainingSec, cfitBreakSecBetween } from "@/lib/cfit/breaks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// phase:
// - "example" → tahap CONTOH SOAL: TANPA TIMER, timer server tidak dinyalakan.
// - "test"    → tahap soal asli: timer server mulai berjalan.
const Body = z.object({
  subtestCode: z.string().min(1),
  phase: z.enum(["example", "test"]).optional(),
});

// Normalisasi opsi ke bentuk { key, label, imageUrl } — mendukung format lama
// (array string huruf) dan format baru (array objek dengan gambar per opsi).
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

// ── ACAK URUTAN PILIHAN JAWABAN (bukan urutan soal!) ──
// Urutan SOAL mengikuti questionNo booklet standar dan TIDAK PERNAH diubah.
// Urutan OPSI diacak deterministik memakai randomSeed milik submission:
// - konsisten: refresh / lanjut sesi → urutan opsi sama persis;
// - beda antar peserta → menyulitkan kerja sama ("jawabannya yang C");
// - penilaian tidak terpengaruh: kunci menempel pada `key` opsi, bukan posisi.
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Opsi hanya boleh diacak kalau tiap opsi membawa kontennya sendiri (gambar
// atau label). Opsi format lama (huruf polos yang merujuk posisi pilihan di
// GAMBAR SOAL) tidak boleh diacak — hurufnya sekadar penunjuk posisi standar.
function shuffleOptionsIfSafe(opts: NormOption[], seed: string, isExample: boolean): NormOption[] {
  if (isExample) return opts; // contoh soal: urutan asli, sering dirujuk instruksi
  if (opts.length < 2) return opts;
  const allSelfContained = opts.every((o) => o.imageUrl || o.label);
  if (!allSelfContained) return opts;
  return seededShuffle(opts, seed);
}

// Mulai (atau resume) satu subtes. Kunci jawaban TIDAK PERNAH dikirim ke
// peserta. Kalau subtes sudah terkunci → 423.
export async function POST(req: NextRequest) {
  const p = getCfitFromRequest(req);
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  const requestedPhase = parsed.data.phase ?? "test";

  const submission = await prisma.cfitSubmission.findUnique({ where: { id: p.sub } });
  if (!submission) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (submission.finishedAt) {
    return NextResponse.json({ error: "Tes sudah diselesaikan." }, { status: 409 });
  }
  if (!submission.fullName) {
    return NextResponse.json({ error: "Isi biodata terlebih dahulu." }, { status: 409 });
  }

  const subtest = await prisma.cfitSubtest.findUnique({
    where: { code: parsed.data.subtestCode },
  });
  if (!subtest || !formsFor(submission.form as never).includes(subtest.form as never)) {
    return NextResponse.json({ error: "Subtes tidak ditemukan untuk bentuk tes ini." }, { status: 404 });
  }

  // WAJIB BERURUTAN (sesuai prosedur CFIT): subtes hanya boleh dibuka kalau
  // semua subtes dengan urutan lebih kecil sudah TERKUNCI (waktu habis).
  // Mencegah timer beberapa subtes berjalan bersamaan.
  const earlier = await prisma.cfitSubtest.findMany({
    where: {
      form: { in: formsFor(submission.form as never) },
      orderIndex: { lt: subtest.orderIndex },
    },
    orderBy: { orderIndex: "asc" },
  });
  // Subtes tepat sebelum ini — dipakai untuk menghitung jeda otomatis.
  let prevLock: CfitSubtestLockInfo | null = null;
  let prevForm: string | null = null;
  for (const s of earlier) {
    const l = await computeCfitSubtestLock({
      submissionId: submission.id,
      subtestId: s.id,
      durationSec: s.durationSec,
    });
    if (!l.locked) {
      return NextResponse.json(
        { error: `Kerjakan subtes secara berurutan. Selesaikan "${s.name}" terlebih dahulu.` },
        { status: 409 },
      );
    }
    prevLock = l;
    prevForm = s.form;
  }

  const current = await computeCfitSubtestLock({
    submissionId: submission.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });
  if (current.locked) {
    return NextResponse.json(
      { error: "Subtes ini sudah terkunci.", finishReason: current.finishReason },
      { status: 423 },
    );
  }

  // JEDA OTOMATIS antar subtes: 2 menit, dan 3 menit saat berganti bentuk
  // (3A → 3B). Hanya berlaku sebelum subtes dimulai — resume tidak terganggu.
  if (!current.started && prevLock?.finishedAt && prevForm) {
    const breakSec = cfitBreakSecBetween(prevForm, subtest.form);
    const breakRemainingSec = cfitBreakRemainingSec(prevLock.finishedAt, breakSec);
    if (breakRemainingSec > 0) {
      return NextResponse.json(
        {
          error: "Masih dalam jeda antar subtes. Tunggu sampai jeda selesai.",
          breakSec,
          breakRemainingSec,
        },
        { status: 425 },
      );
    }
  }

  const meta = {
    code: subtest.code,
    name: subtest.name,
    description: subtest.description,
    instructions: subtest.instructions,
    durationSec: subtest.durationSec,
  };

  const questionSelect = {
    id: true,
    questionNo: true,
    prompt: true,
    imageUrl: true,
    options: true,
    isExample: true,
    correct: true,
  } as const;

  // KUNCI JAWABAN (`correct`) SENGAJA TIDAK DIKIRIM ke peserta — hanya
  // jumlah jawaban yang diminta (expectedAnswers) untuk soal multi-jawaban.
  const toClient = (
    rows: Array<{
      id: string;
      questionNo: number;
      prompt: string;
      imageUrl: string | null;
      options: unknown;
      isExample: boolean;
      correct: unknown;
    }>,
  ) =>
    rows.map(({ correct, options, ...q }) => ({
      ...q,
      options: shuffleOptionsIfSafe(
        normalizeOptions(options),
        `${submission.randomSeed}:${q.id}`,
        q.isExample,
      ),
      expectedAnswers: Array.isArray(correct) ? (correct as unknown[]).length : 1,
    }));

  const savedFor = (ids: string[]) =>
    prisma.cfitAnswer.findMany({
      where: { submissionId: submission.id, questionId: { in: ids } },
      select: { questionId: true, selected: true },
    });

  // ── TAHAP CONTOH SOAL: TANPA TIMER ──
  // Timer server TIDAK dinyalakan di tahap ini. Kalau timer sudah berjalan
  // (peserta refresh di tengah subtes), permintaan dialihkan ke tahap tes.
  if (requestedPhase === "example" && !current.started) {
    const rows = await prisma.cfitQuestion.findMany({
      where: { subtestId: subtest.id, isExample: true },
      orderBy: { questionNo: "asc" },
      select: questionSelect,
    });
    const saved = await savedFor(rows.map((q) => q.id));
    return NextResponse.json({
      phase: "example",
      alreadyStarted: false,
      subtest: meta,
      startedAt: null,
      remainingSec: null,
      questions: toClient(rows),
      savedAnswers: saved,
    });
  }

  // ── TAHAP SOAL ASLI: timer mulai / lanjut berjalan ──
  const lock = await ensureCfitSubtestStarted({
    submissionId: submission.id,
    subtestId: subtest.id,
    durationSec: subtest.durationSec,
  });
  if (lock.locked) {
    return NextResponse.json(
      { error: "Subtes ini sudah terkunci.", finishReason: lock.finishReason },
      { status: 423 },
    );
  }

  const rows = await prisma.cfitQuestion.findMany({
    where: { subtestId: subtest.id, isExample: false },
    // Urutan SOAL standar booklet (questionNo) — JANGAN diacak.
    orderBy: { questionNo: "asc" },
    select: questionSelect,
  });

  // Jawaban yang sudah tersimpan (resume setelah refresh).
  const saved = await savedFor(rows.map((q) => q.id));

  // SISA WAKTU SADAR-JEDA. Dulu di sini dihitung dari jam dinding
  // (startedAt + durationSec - now), sehingga waktu mati lampu ikut termakan.
  // Sekarang sumbernya lock: durationSec - consumedSec.
  //
  // `startedAt` yang dikirim ke klien juga BUKAN startedAt asli, melainkan
  // timerStartedAt (= now - consumedSec). Dengan begitu hitungan mundur di
  // layar — yang menghitung dari startedAt — otomatis MELANJUTKAN sisa waktu
  // dan tidak pernah berselisih dengan hitungan server.
  const remainingSec = lock.remainingSec;

  return NextResponse.json({
    phase: "test",
    alreadyStarted: current.started,
    subtest: meta,
    startedAt: lock.timerStartedAt ?? lock.startedAt,
    remainingSec,
    questions: toClient(rows),
    savedAnswers: saved,
  });
}
