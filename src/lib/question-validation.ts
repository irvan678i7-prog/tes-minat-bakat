// Validasi integritas kunci jawaban soal, dipakai di sisi ADMIN sebelum
// soal disimpan ke database.
//
// Dua masalah yang dicegah di sini:
//
// 1. Soal BAKAT dengan `correct` kosong. Saat scoring, cabang "kunci kosong"
//    memang sengaja ada untuk MINAT (setiap jawaban dihitung sebagai
//    keterisian). Kalau soal BAKAT lolos tanpa kunci, dulu SEMUA peserta
//    dapat poin penuh tanpa peringatan. Sekarang scoring memberi 0 + warning,
//    dan penyimpanan soalnya ditolak di sini.
//
// 2. `correct.length` tidak sama dengan `parts`. Skor maksimum subtes diambil
//    dari `parts` (lewat loadSubtestMeta.totalParts), sedangkan penilaian
//    mengulang sepanjang kunci. Kalau keduanya beda, raw tidak akan pernah
//    mencapai max sehingga persentase subtes bias turun permanen.

export type QuestionKeyInput = {
  testKind: "BAKAT" | "MINAT";
  parts?: number | null;
  correct: unknown;
  isExample?: boolean;
  /** Untuk pesan error, mis. 12 atau "Contoh 2". */
  label?: string | number;
};

export type QuestionKeyValidation =
  | { ok: true }
  | { ok: false; error: string };

function isFilled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return Number.isFinite(v);
  return String(v).trim().length > 0;
}

/**
 * Kembalikan `{ ok: false, error }` bila soal tidak boleh disimpan.
 * Soal contoh (isExample) dan seluruh soal MINAT selalu lolos.
 */
export function validateQuestionKey(q: QuestionKeyInput): QuestionKeyValidation {
  if (q.isExample) return { ok: true };
  // MINAT memang tidak punya kunci benar/salah — setiap pilihan valid.
  if (q.testKind !== "BAKAT") return { ok: true };

  const label = q.label != null ? `Soal ${q.label}: ` : "";
  const parts = Math.max(1, Number(q.parts ?? 1) || 1);
  const correct = q.correct;

  if (parts > 1) {
    if (!Array.isArray(correct)) {
      return {
        ok: false,
        error: `${label}soal dengan ${parts} bagian wajib punya kunci berbentuk daftar ${parts} jawaban.`,
      };
    }
    if (correct.length !== parts) {
      return {
        ok: false,
        error: `${label}jumlah kunci (${correct.length}) tidak sama dengan jumlah bagian/parts (${parts}).`,
      };
    }
    const kosong: number[] = [];
    correct.forEach((c, i) => {
      if (!isFilled(c)) kosong.push(i + 1);
    });
    if (kosong.length > 0) {
      return {
        ok: false,
        error: `${label}kunci jawaban BAKAT tidak boleh kosong. Bagian yang masih kosong: ${kosong.join(", ")}.`,
      };
    }
    return { ok: true };
  }

  // parts === 1
  if (Array.isArray(correct)) {
    if (correct.length === 0 || !isFilled(correct[0])) {
      return { ok: false, error: `${label}kunci jawaban BAKAT wajib diisi.` };
    }
    return { ok: true };
  }
  if (!isFilled(correct)) {
    return { ok: false, error: `${label}kunci jawaban BAKAT wajib diisi.` };
  }
  return { ok: true };
}

/** Validasi banyak soal sekaligus; kembalikan daftar pesan error. */
export function validateQuestionKeys(list: QuestionKeyInput[]): string[] {
  const errors: string[] = [];
  for (const q of list) {
    const r = validateQuestionKey(q);
    if (!r.ok) errors.push(r.error);
  }
  return errors;
}
