// Validasi kunci jawaban soal. Dipakai di dua tempat:
//  - saat admin menyimpan / mengunggah soal (blokir sebelum masuk DB)
//  - saat scoring (jadi peringatan pada payload hasil)
//
// Latar belakang audit:
//  - Soal BAKAT dengan `correct` kosong dulu membuat SEMUA peserta dapat
//    poin penuh secara diam-diam.
//  - Skor maksimum subtes dihitung dari `parts`, tetapi penilaian mengulang
//    `correct.length`. Kalau keduanya beda, `raw` tidak akan pernah mencapai
//    `max` sehingga persentase subtes bias turun permanen.

export type QuestionKeyInput = {
  questionNo?: number;
  parts?: number | null;
  correct: unknown;
  inputMode?: string | null;
  testKind: "BAKAT" | "MINAT";
  isExample?: boolean;
};

export type QuestionKeyIssue = {
  level: "error" | "warning";
  message: string;
};

function isFilled(v: unknown): boolean {
  if (v == null) return false;
  return String(v).trim().length > 0;
}

export function validateQuestionKey(q: QuestionKeyInput): QuestionKeyIssue[] {
  const issues: QuestionKeyIssue[] = [];
  const label = q.questionNo != null ? `Soal #${q.questionNo}` : "Soal";
  if (q.isExample) return issues; // soal contoh tidak dinilai

  const parts = Math.max(1, q.parts || 1);

  if (q.testKind === "MINAT") {
    // MINAT memang tidak punya kunci benar/salah — setiap jawaban dihitung.
    const terisi = Array.isArray(q.correct)
      ? q.correct.length > 0
      : isFilled(q.correct);
    if (terisi) {
      issues.push({
        level: "warning",
        message: `${label}: soal MINAT tidak memerlukan kunci jawaban, tetapi kunci terisi. Nilai ini akan diabaikan.`,
      });
    }
    return issues;
  }

  // ── BAKAT ───────────────────────────────────────────────────────────────
  if (parts > 1) {
    if (!Array.isArray(q.correct)) {
      issues.push({
        level: "error",
        message: `${label}: parts = ${parts} sehingga kunci jawaban harus berupa array berisi ${parts} nilai.`,
      });
      return issues;
    }
    if (q.correct.length !== parts) {
      issues.push({
        level: "error",
        message: `${label}: jumlah kunci (${q.correct.length}) tidak sama dengan parts (${parts}). Skor maksimum dihitung dari parts, jadi selisih ini membuat skor subtes bias turun.`,
      });
    }
    q.correct.forEach((c, i) => {
      if (!isFilled(c)) {
        issues.push({
          level: "error",
          message: `${label}: kunci jawaban bagian ke-${i + 1} kosong.`,
        });
      }
    });
    return issues;
  }

  // parts === 1
  const single = Array.isArray(q.correct) ? q.correct[0] : q.correct;
  if (Array.isArray(q.correct) && q.correct.length > 1) {
    issues.push({
      level: "warning",
      message: `${label}: parts = 1 tetapi kunci berisi ${q.correct.length} nilai. Hanya nilai pertama yang dipakai.`,
    });
  }
  if (!isFilled(single)) {
    issues.push({
      level: "error",
      message: `${label}: kunci jawaban kosong. Soal BAKAT tanpa kunci akan dianggap benar untuk semua peserta.`,
    });
  }
  return issues;
}

/** Kembalikan pesan error pertama, atau null bila lolos. Untuk guard di API. */
export function firstQuestionKeyError(q: QuestionKeyInput): string | null {
  const err = validateQuestionKey(q).find((i) => i.level === "error");
  return err ? err.message : null;
}

/** Validasi sekumpulan soal sekaligus (mis. untuk impor massal). */
export function validateQuestionKeys(
  qs: QuestionKeyInput[],
): QuestionKeyIssue[] {
  return qs.flatMap((q) => validateQuestionKey(q));
}
