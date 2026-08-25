"use client";

import { useEffect, useState } from "react";
import {
  ANSWER_REJECTED_EVENT,
  SESSION_DEAD_EVENT,
  readRejectedAnswers,
  type RejectedAnswer,
} from "./useAnswerSync";

// BANNER PERINGATAN SINKRONISASI JAWABAN.
//
// Menjawab audit #9: dulu siswa yang sesinya mati hanya melihat "ANTRI 3" —
// angka yang tidak berarti apa-apa baginya, tanpa petunjuk bahwa ada fitur
// pemulihan. Sekarang dia diberi tahu APA yang terjadi dan APA yang harus
// dilakukan.
//
// z-[70] SENGAJA lebih tinggi dari modal aturan (z-50) supaya peringatan
// kehilangan jawaban tidak pernah tertutup apa pun.
//
// Komponen ini tidak berbagi instance hook dengan SubtestRunner — ia membaca
// localStorage dan mendengar event, jadi bisa dipasang dari layout tanpa
// menyentuh file tes yang sudah besar.
export default function AnswerSyncAlert() {
  const [rejected, setRejected] = useState<RejectedAnswer[]>([]);
  const [sessionDead, setSessionDead] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setRejected(readRejectedAnswers());

    const onRejected = () => {
      setRejected(readRejectedAnswers());
      setDismissed(false);
    };
    const onDead = () => {
      setSessionDead(true);
      setDismissed(false);
    };
    window.addEventListener(ANSWER_REJECTED_EVENT, onRejected);
    window.addEventListener(SESSION_DEAD_EVENT, onDead);
    // Jaring pengaman kalau event terlewat (mis. komponen baru dipasang).
    const id = setInterval(() => setRejected(readRejectedAnswers()), 5000);
    return () => {
      window.removeEventListener(ANSWER_REJECTED_EVENT, onRejected);
      window.removeEventListener(SESSION_DEAD_EVENT, onDead);
      clearInterval(id);
    };
  }, []);

  if (dismissed) return null;
  if (!sessionDead && rejected.length === 0) return null;

  const reasons = Array.from(new Set(rejected.map((r) => r.error))).slice(0, 2);

  return (
    <div className="fixed inset-x-0 top-0 z-[70] border-b-4 border-black bg-red-600 px-4 py-3 text-white shadow-lg">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          {sessionDead ? (
            <>
              <div className="text-sm font-black uppercase tracking-wide">
                Sesi kamu berakhir — jawaban baru belum tersimpan
              </div>
              <p className="text-xs font-bold leading-snug">
                Jawabanmu masih tersimpan di perangkat ini dan akan dikirim
                begitu sesi dipulihkan. Buka halaman{" "}
                <span className="underline">/lanjut</span>, masukkan Kode
                Lanjutmu, lalu kembali ke tes. JANGAN menutup tab ini sebelum
                dipulihkan.
              </p>
            </>
          ) : (
            <>
              <div className="text-sm font-black uppercase tracking-wide">
                {rejected.length} jawaban TIDAK tersimpan
              </div>
              <p className="text-xs font-bold leading-snug">
                {reasons.length > 0
                  ? reasons.join(" · ")
                  : "Server menolak menyimpan jawaban tersebut."}{" "}
                Laporkan ke pengawas sekarang — jangan lanjut sendiri.
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {sessionDead ? (
            <a
              href="/lanjut"
              className="border-4 border-black bg-white px-3 py-2 text-xs font-black uppercase text-black"
            >
              Buka /lanjut
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="border-4 border-black bg-black px-3 py-2 text-xs font-black uppercase text-white"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
