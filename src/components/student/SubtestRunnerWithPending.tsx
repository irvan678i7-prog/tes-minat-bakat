"use client";

import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import SubtestRunner from "./SubtestRunner";
import { useSessionScope } from "./SessionScope";

// ── PEMULIH TAMPILAN JAWABAN YANG MASIH DI ANTREAN LOKAL ────────────────────
//
// `existingAnswers` dari server HANYA berisi jawaban yang sudah sampai ke
// database. Jawaban yang masih menunggu di antrean localStorage
// (useAnswerSync) sebenarnya AMAN — antrean itu tetap dikirim ulang beberapa
// detik setelah halaman dimuat ulang — tetapi dulu tidak pernah ikut
// ditampilkan. Layarnya tampak kosong, dan siswa yakin jawabannya hilang.
// Paling terasa di tes MINAT karena siswa mengeklik cepat (252 jawaban),
// sehingga saat refresh biasanya masih banyak jawaban di antrean.
//
// Komponen ini membaca antrean itu SETELAH mount (bukan saat render pertama,
// supaya tidak ada hydration mismatch), lalu menyajikan ulang SubtestRunner
// dengan jawaban gabungan. SubtestRunner sendiri TIDAK diubah: state
// jawabannya memang dibangun dari `existingAnswers` pada saat mount, jadi
// `key` diganti supaya runner memulai ulang dengan data gabungan.
//
// PENTING: kunci localStorage di bawah harus SAMA dengan PENDING_PREFIX di
// useAnswerSync.ts. Di sini isinya HANYA DIBACA (read-only, tidak pernah
// ditulis/dihapus), jadi kalau suatu saat kuncinya berubah dan tidak ikut
// diperbarui di sini, akibatnya hanya tampilan kembali seperti semula —
// tidak ada jawaban yang hilang, karena pengiriman antrean tetap ditangani
// useAnswerSync.
const PENDING_PREFIX = "tmb-pending-answers-v2";

type PendingItem = { selected: string | string[]; ts: number };

function readPendingSelections(
  sessionScope: string,
): Record<string, string | string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      `${PENDING_PREFIX}:${sessionScope}`,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PendingItem>;
    const out: Record<string, string | string[]> = {};
    for (const [qid, item] of Object.entries(parsed)) {
      const sel = item?.selected;
      if (sel == null) continue;
      out[qid] = Array.isArray(sel) ? sel.map((v) => String(v)) : String(sel);
    }
    return out;
  } catch {
    return {};
  }
}

// Apakah nilai antrean sama dengan yang sudah ada di server? Kalau sama,
// tidak ada gunanya menyajikan ulang runner.
function sameValue(server: unknown, queued: string | string[]): boolean {
  if (Array.isArray(queued)) {
    if (!Array.isArray(server)) return false;
    const a = server.map((v) => String(v));
    return a.length === queued.length && a.every((v, i) => v === queued[i]);
  }
  if (Array.isArray(server) || server == null) return false;
  return String(server) === queued;
}

type Props = ComponentProps<typeof SubtestRunner>;

export default function SubtestRunnerWithPending(props: Props) {
  // Pemisah penyimpanan lokal per sesi tes (Submission.id dari cookie),
  // sama seperti yang dipakai useAnswerSync.
  const sessionScope = useSessionScope() ?? "anon";
  const [queued, setQueued] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    const pending = readPendingSelections(sessionScope);
    if (Object.keys(pending).length === 0) return;
    // HANYA soal milik subtes ini. Antrean bisa berisi jawaban subtes lain,
    // dan memasukkannya ke `existingAnswers` akan membuat runner menganggap
    // subtes ini sudah dimulai (layar intro terlewati).
    const mine: Record<string, string | string[]> = {};
    for (const q of props.questions) {
      const v = pending[q.id];
      if (v == null) continue;
      if (sameValue(props.existingAnswers[q.id], v)) continue;
      mine[q.id] = v;
    }
    if (Object.keys(mine).length === 0) return;
    setQueued(mine);
  }, [sessionScope, props.questions, props.existingAnswers]);

  const hasQueued = Object.keys(queued).length > 0;
  const mergedAnswers = useMemo(
    () =>
      hasQueued ? { ...props.existingAnswers, ...queued } : props.existingAnswers,
    [hasQueued, props.existingAnswers, queued],
  );

  return (
    <SubtestRunner
      {...props}
      key={hasQueued ? "answers-with-pending" : "answers-from-server"}
      existingAnswers={mergedAnswers}
    />
  );
}
