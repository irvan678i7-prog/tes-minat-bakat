"use client";

import { useEffect, useState } from "react";
import { SESSION_DEAD_EVENT } from "./useAnswerSync";

// BANNER SESI BERAKHIR.
//
// Menjawab audit #9: dulu siswa yang sesinya mati hanya melihat "ANTRI 3" —
// angka yang tidak berarti apa-apa baginya, tanpa petunjuk bahwa ada fitur
// pemulihan. Sekarang dia diberi tahu APA yang terjadi dan APA yang harus
// dilakukan.
//
// KENAPA BANNER "N JAWABAN TIDAK TERSIMPAN" DIHAPUS DARI SINI:
// sejak server menerima jawaban susulan (jawaban yang dipilih sebelum subtes
// terkunci tetap disimpan walau sampai terlambat), penolakan yang masih bisa
// terjadi adalah kejadian yang TIDAK BISA ditindaklanjuti siswa sendiri di
// tengah ujian — dan banner merah permanen di layar hanya membuat panik,
// terutama karena catatannya bertahan di perangkat lintas sesi. Penolakan
// tetap dicatat (localStorage per sesi + console.warn) supaya pengawas masih
// bisa memeriksanya; yang hilang hanya tampilannya di layar siswa.
//
// Banner sesi berakhir DIPERTAHANKAN karena ini satu-satunya peringatan yang
// bisa langsung ditindaklanjuti siswa: buka /lanjut, masukkan Kode Lanjut.
//
// z-[70] SENGAJA lebih tinggi dari modal aturan (z-50) supaya peringatan ini
// tidak pernah tertutup apa pun.
export default function AnswerSyncAlert() {
  const [sessionDead, setSessionDead] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onDead = () => {
      setSessionDead(true);
      setDismissed(false);
    };
    window.addEventListener(SESSION_DEAD_EVENT, onDead);
    return () => {
      window.removeEventListener(SESSION_DEAD_EVENT, onDead);
    };
  }, []);

  if (dismissed || !sessionDead) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[70] border-b-4 border-black bg-red-600 px-4 py-3 text-white shadow-lg">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-black uppercase tracking-wide">
            Sesi kamu berakhir — jawaban baru belum tersimpan
          </div>
          <p className="text-xs font-bold leading-snug">
            Jawabanmu masih tersimpan di perangkat ini dan akan dikirim begitu
            sesi dipulihkan. Buka halaman{" "}
            <span className="underline">/lanjut</span>, masukkan Kode Lanjutmu,
            lalu kembali ke tes. JANGAN menutup tab ini sebelum dipulihkan.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href="/lanjut"
            className="border-4 border-black bg-white px-3 py-2 text-xs font-black uppercase text-black"
          >
            Buka /lanjut
          </a>
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
