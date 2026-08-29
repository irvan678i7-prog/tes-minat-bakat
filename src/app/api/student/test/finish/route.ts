import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStudentFromRequest, clearStudentCookie } from "@/lib/auth";
import {
  computeScoringPayload,
  findMatchingMinatBidangScores,
  loadSubtestMeta,
} from "@/lib/scoring";

/**
 * Batas waktu pencarian cross-link MINAT (hanya untuk peserta BAKAT).
 *
 * `findMatchingMinatBidangScores` memindai sampai 5000 submission MINAT
 * secara berpaginasi (hingga 10 query berurutan), lalu memuat SELURUH
 * jawaban + soal milik submission yang cocok. Di sekolah dengan data besar,
 * pemindaian ini sendirian bisa melewati batas waktu fungsi serverless.
 *
 * Cross-link hanyalah penyempurna: ia mengoreksi penjurusan IPA/IPS memakai
 * skor minat peserta yang sama. Kalau lambat atau gagal, tes TETAP wajib
 * tersimpan. Sebelumnya tidak ada batas waktu sama sekali, sehingga
 * kegagalan di sini menjatuhkan seluruh proses simpan tes.
 */
const CROSSLINK_TIMEOUT_MS = 6000;

/**
 * Jalankan sebuah promise dengan batas waktu. Bila lewat batas atau promise
 * ditolak, kembalikan `fallback` alih-alih melempar error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (value: T) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    timer = setTimeout(() => done(fallback), ms);
    promise.then(done, () => done(fallback));
  });
}

/** Response sukses + hapus cookie sesi siswa (tes tidak boleh diulang). */
function finishedResponse(extra: Record<string, unknown> = {}) {
  const res = NextResponse.json({ ok: true, ...extra });
  clearStudentCookie(res);
  return res;
}

export async function POST(req: NextRequest) {
  const student = getStudentFromRequest(req);
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Ambil HANYA kolom yang dipakai penilaian. Sebelumnya seluruh baris
    // Question ikut termuat (prompt, options, imageUrl, imageUrl2,
    // partLabels, ...) untuk setiap jawaban — ratusan baris berisi teks dan
    // JSON besar yang tidak pernah dibaca oleh scoring, dan itu memperbesar
    // risiko kehabisan waktu tepat di langkah paling kritis.
    const sub = await prisma.submission.findUnique({
      where: { id: student.sub },
      select: {
        id: true,
        finishedAt: true,
        testKind: true,
        fullName: true,
        school: true,
        grade: true,
        answers: {
          select: {
            selected: true,
            question: {
              select: {
                subtestId: true,
                parts: true,
                correct: true,
                scoringTag: true,
                isExample: true,
                subtest: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!sub) return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
    if (sub.finishedAt) return finishedResponse({ alreadyFinished: true });

    // Load paralel: cross-link MINAT bidang (untuk BAKAT) + subtestMeta
    // (jumlah soal asli per subtes — sumber otoritatif untuk `max` di
    // perSubtest, supaya peserta yang skip soal tidak mendapat ratio
    // raw/max = 100% yang menginflasi IQ).
    const [minatBidang, subtestMeta] = await Promise.all([
      sub.testKind === "BAKAT"
        ? withTimeout(
            findMatchingMinatBidangScores({
              fullName: sub.fullName,
              school: sub.school,
              grade: sub.grade,
            }),
            CROSSLINK_TIMEOUT_MS,
            null,
          )
        : Promise.resolve(null),
      loadSubtestMeta(sub.testKind),
    ]);

    // Compute scoring entirely in memory — no DB round-trips per answer.
    const payload = computeScoringPayload(
      {
        testKind: sub.testKind,
        answers: sub.answers.map((a) => ({
          selected: a.selected,
          question: {
            subtestId: a.question.subtestId,
            subtest: { code: a.question.subtest.code, name: a.question.subtest.name },
            parts: a.question.parts,
            correct: a.question.correct,
            scoringTag: a.question.scoringTag,
            isExample: a.question.isExample,
          },
        })),
        fullName: sub.fullName,
        school: sub.school,
        grade: sub.grade,
      },
      subtestMeta,
      minatBidang,
    );
    const topProfiles = payload.bakat?.topProfiles.map((p) => p.name);
    const topPrograms = payload.minat?.programs.map((p) => p.bidang);

    // Kolom iqEstimate bertipe Float. Menulis NaN / Infinity ke sana akan
    // ditolak database dan menggagalkan seluruh penyimpanan, jadi nilai yang
    // tidak masuk akal disimpan sebagai null.
    const iqEstimate =
      typeof payload.iqEstimate === "number" && Number.isFinite(payload.iqEstimate)
        ? payload.iqEstimate
        : null;

    // Mark finished + write result in a single transaction (2 statements only).
    await prisma.$transaction([
      prisma.submission.update({
        where: { id: sub.id },
        data: { finishedAt: new Date() },
      }),
      prisma.result.upsert({
        where: { submissionId: sub.id },
        create: {
          submissionId: sub.id,
          payload: payload as unknown as Prisma.InputJsonValue,
          iqEstimate,
          topProfiles: topProfiles ?? Prisma.JsonNull,
          topPrograms: topPrograms ?? Prisma.JsonNull,
        },
        update: {
          payload: payload as unknown as Prisma.InputJsonValue,
          iqEstimate,
          topProfiles: topProfiles ?? Prisma.JsonNull,
          topPrograms: topPrograms ?? Prisma.JsonNull,
        },
      }),
    ]);

    // Sign out the student session — they cannot redo the test.
    return finishedResponse();
  } catch (err) {
    // Dulu tidak ada try/catch sama sekali: satu kegagalan apa pun keluar
    // sebagai 500 tanpa keterangan, `finishedAt` tidak pernah tertulis, dan
    // siswa gagal terus dengan cara yang sama setiap kali menekan tombol.
    console.error("[test/finish] gagal menyimpan tes:", err);

    // Klik ganda atau percobaan ulang otomatis bisa membuat dua permintaan
    // berjalan bersamaan. Kalau salah satunya sudah berhasil menutup
    // submission, jangan tampilkan "gagal" pada permintaan yang kalah cepat.
    const check = await prisma.submission
      .findUnique({ where: { id: student.sub }, select: { finishedAt: true } })
      .catch(() => null);
    if (check?.finishedAt) return finishedResponse({ alreadyFinished: true });

    const detail =
      err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
    return NextResponse.json(
      {
        error:
          "Gagal menyimpan hasil tes. Jawaban kamu tidak hilang — laporkan ke pengawas, lalu coba lagi.",
        code: "FINISH_FAILED",
        detail,
      },
      { status: 500 },
    );
  }
}
