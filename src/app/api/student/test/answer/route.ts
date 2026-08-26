import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudentFromRequest } from "@/lib/auth";
import { projectSubtestTime, TIME_UP_GRACE_SEC } from "@/lib/subtestLock";

// JAWABAN SUSULAN (late sync)
//
// Jawaban yang DIPILIH sebelum subtes terkunci tapi baru sampai ke server
// setelah terkunci tetap DISIMPAN. Ini terjadi setiap kali antrean lokal
// belum habis saat subtes ditutup: mati lampu, jaringan putus, atau siswa
// menekan "SELESAIKAN SUBTES" saat masih ada jawaban di antrean. Sebelumnya
// jawaban seperti itu ditolak 409 lalu dicatat sebagai kehilangan data,
// padahal siswa benar-benar sudah mengerjakannya — itulah sumber badge
// "GAGAL SYNC" dan laporan "jawaban tidak tersimpan".
//
// Yang dikirim klien adalah USIA jawaban (dipilih berapa milidetik yang lalu),
// BUKAN jam perangkat. Ini penting: jam perangkat sekolah sering tidak akurat,
// dan membandingkan jam perangkat dengan jam server akan menolak jawaban yang
// sah. Selisih dua Date.now() di perangkat yang sama tetap benar walau jam
// perangkatnya salah.
//
// Penjagaan supaya ini TIDAK bisa dipakai menambah jawaban setelah waktu
// habis:
//   1. waktu pilih harus sebelum subtes terkunci (+ TIME_UP_GRACE_SEC)
//   2. susulan hanya diterima dalam LATE_SYNC_WINDOW_SEC setelah terkunci
//   3. usia jawaban dibatasi MAX_ANSWER_AGE_MS
//   4. waktu pilih hasil hitungan disimpan di Answer.answeredAt, jadi
//      pengawas tetap bisa memeriksa kapan jawaban itu dipilih
const LATE_SYNC_WINDOW_SEC = 15 * 60;
const MAX_ANSWER_AGE_MS = 24 * 60 * 60 * 1000;

const Body = z.object({
  questionId: z.string().min(1),
  selected: z.union([z.string(), z.array(z.string())]),
  // Jawaban ini dipilih berapa milidetik yang lalu (Date.now() - waktu pilih).
  // Opsional supaya klien versi lama tetap bisa mengirim jawaban.
  answeredAgoMs: z.number().int().min(0).max(MAX_ANSWER_AGE_MS).optional(),
});

function pickedBeforeLock(
  answeredAgoMs: number | undefined,
  lockedAt: Date | null | undefined,
  now: Date,
): Date | null {
  if (answeredAgoMs === undefined || !lockedAt) return null;
  if (!Number.isFinite(answeredAgoMs) || answeredAgoMs < 0) return null;
  if (answeredAgoMs > MAX_ANSWER_AGE_MS) return null;
  const answeredAt = new Date(now.getTime() - answeredAgoMs);
  if (answeredAt.getTime() > lockedAt.getTime() + TIME_UP_GRACE_SEC * 1000) {
    return null;
  }
  if (now.getTime() - lockedAt.getTime() > LATE_SYNC_WINDOW_SEC * 1000) {
    return null;
  }
  return answeredAt;
}

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Fetch submission + question + subtestProgress in ONE parallel batch
  // (3 queries, 1 round-trip) instead of the previous 3 sequential round-trips
  // (sub+q → computeSubtestLock → upsert). For the progress lookup we use
  // the student's submissionId + question's subtestId via a raw findFirst
  // since we don't know subtestId yet — but Prisma runs them in parallel.
  const [sub, q] = await Promise.all([
    prisma.submission.findUnique({
      where: { id: student.sub },
      select: { id: true, finishedAt: true, testKind: true },
    }),
    prisma.question.findUnique({
      where: { id: parsed.data.questionId },
      select: {
        id: true,
        subtestId: true,
        isExample: true,
        subtest: { select: { testKind: true, durationSec: true } },
      },
    }),
  ]);
  if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  if (!q) return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });

  if (q.subtest.testKind !== sub.testKind) {
    return NextResponse.json(
      { error: "Soal tidak sesuai dengan jenis tes" },
      { status: 403 },
    );
  }

  const now = new Date();
  const submissionId = sub.id;
  const questionId = q.id;
  const subtestId = q.subtestId;
  const durationSec = q.subtest.durationSec;

  // Satu pintu penyimpanan supaya jalur normal dan jalur susulan tidak bisa
  // berbeda perilaku.
  const saveAnswer = async (answeredAt: Date) => {
    await prisma.answer.upsert({
      where: { submissionId_questionId: { submissionId, questionId } },
      create: {
        submissionId,
        questionId,
        selected: parsed.data.selected as never,
        answeredAt,
      },
      update: { selected: parsed.data.selected as never, answeredAt },
    });
  };

  // Seluruh tes sudah ditutup. Jawaban yang dipilih sebelum tes ditutup tetap
  // diterima sebagai susulan.
  if (sub.finishedAt) {
    const late = pickedBeforeLock(parsed.data.answeredAgoMs, sub.finishedAt, now);
    if (late) {
      await saveAnswer(late);
      return NextResponse.json({ ok: true, lateSync: true });
    }
    return NextResponse.json({ error: "Tes sudah selesai" }, { status: 400 });
  }

  // Inline lock check + upsert in ONE parallel batch (2 queries, 1 round-trip)
  // instead of sequential computeSubtestLock (1-2 queries) → upsert (1 query).
  const progress = await prisma.subtestProgress.findUnique({
    where: { submissionId_subtestId: { submissionId, subtestId } },
    select: {
      startedAt: true,
      finishedAt: true,
      finishReason: true,
      consumedSec: true,
      lastSeenAt: true,
      pausedSec: true,
      pauseCount: true,
    },
  });

  // Subtes BELUM dimulai (tidak ada SubtestProgress) → jawaban ditolak.
  // Tanpa penjagaan ini, peserta bisa mengirim jawaban lewat API sebelum
  // timer subtes berjalan ("pre-answering") karena semua pemeriksaan waktu
  // di bawah hanya berlaku saat `progress` ada. Soal contoh dikecualikan,
  // sama seperti pada alur CFIT.
  if (!progress && !q.isExample) {
    return NextResponse.json(
      {
        error: "Subtes belum dimulai. Buka subtes terlebih dahulu.",
        locked: true,
        finishReason: null,
      },
      { status: 409 },
    );
  }

  if (progress?.finishedAt) {
    // SUSULAN: dipilih sebelum subtes terkunci → tetap disimpan, tidak dibuang.
    const late = pickedBeforeLock(
      parsed.data.answeredAgoMs,
      progress.finishedAt,
      now,
    );
    if (late) {
      await saveAnswer(late);
      return NextResponse.json({ ok: true, lateSync: true });
    }
    return NextResponse.json(
      {
        error:
          progress.finishReason === "TIME_UP"
            ? "Waktu subtes sudah habis. Jawaban tidak bisa diubah."
            : "Subtes sudah diselesaikan. Jawaban tidak bisa diubah.",
        locked: true,
        finishReason: progress.finishReason,
      },
      { status: 409 },
    );
  }
  if (progress) {
    // TIMER SADAR-JEDA: yang dipakai adalah waktu AKTIF (consumedSec), bukan
    // jam dinding. Jadi jawaban yang tertahan di antrian offline karena mati
    // lampu tidak otomatis ditolak sebagai "waktu habis" saat dikirim ulang.
    const projected = projectSubtestTime(progress, durationSec, now);
    if (projected.consumedSec >= durationSec + TIME_UP_GRACE_SEC) {
      // Auto-lock (fire-and-forget) and reject.
      prisma.subtestProgress.updateMany({
        where: { submissionId, subtestId, finishedAt: null },
        data: {
          finishedAt: now,
          finishReason: "TIME_UP",
          consumedSec: Math.min(projected.consumedSec, durationSec),
          pausedSec: projected.pausedSec,
          pauseCount: projected.pauseCount,
          lastSeenAt: now,
        },
      }).catch(() => {});
      // Batas waktu sebenarnya = saat waktu aktif menyentuh durationSec,
      // bukan "sekarang". Jawaban yang dipilih sebelum batas itu tetap
      // disimpan sebagai susulan.
      const deadline = new Date(
        now.getTime() - Math.max(0, projected.consumedSec - durationSec) * 1000,
      );
      const late = pickedBeforeLock(parsed.data.answeredAgoMs, deadline, now);
      if (late) {
        await saveAnswer(late);
        return NextResponse.json({ ok: true, lateSync: true });
      }
      return NextResponse.json(
        { error: "Waktu subtes sudah habis. Jawaban tidak bisa diubah.", locked: true, finishReason: "TIME_UP" },
        { status: 409 },
      );
    }
    // Kirim jawaban = bukti siswa masih mengerjakan → sekalian jadi denyut.
    // Fire-and-forget supaya latensi menyimpan jawaban tidak bertambah.
    prisma.subtestProgress.updateMany({
      where: { submissionId, subtestId, finishedAt: null },
      data: {
        consumedSec: Math.min(projected.consumedSec, durationSec),
        pausedSec: projected.pausedSec,
        pauseCount: projected.pauseCount,
        lastSeenAt: now,
      },
    }).catch(() => {});
  }

  await saveAnswer(now);
  return NextResponse.json({ ok: true });
}

// Jawaban mana yang BENAR-BENAR sudah tersimpan di server?
//
// Dipakai useAnswerSync saat halaman tes dibuka: catatan "gagal sync" yang
// ternyata jawabannya sudah ada di server (mis. percobaan lain berhasil, atau
// diterima sebagai susulan) dibuang, supaya badge "GAGAL SYNC" dan banner
// merah hanya muncul untuk kehilangan data yang nyata.
export async function GET(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ saved: [] });

  const rows = await prisma.answer.findMany({
    where: { submissionId: student.sub, questionId: { in: ids } },
    select: { questionId: true },
  });
  return NextResponse.json({ saved: rows.map((r) => r.questionId) });
}
