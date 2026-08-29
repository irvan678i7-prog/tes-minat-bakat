"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// BANNER "KODE LANJUT" TES IQ.
//
// Sebelum ini, sesi tes IQ yang cookie-nya hilang TIDAK BISA dipulihkan oleh
// siapa pun. Banner ini menampilkan kode pemulihan peserta di halaman hub
// (/cfit/test) supaya dicatat SEBELUM ada masalah.
//
// Sengaja hanya di halaman hub: di halaman soal, banner justru mengganggu dan
// bisa dipakai peserta untuk mengulur waktu.
export default function CfitResumeBanner() {
  const pathname = usePathname();
  const onHub = pathname === "/cfit/test" || pathname === "/cfit/test/";
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!onHub) return;
    let alive = true;
    fetch("/api/cfit/resume-code", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.resumeCode) setCode(String(d.resumeCode));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onHub]);

  if (!onHub || !code) return null;

  return (
    <div className="sticky top-0 z-[60] border-b-4 border-black bg-yellow-300 px-4 py-3 text-black">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-wide">
            Kode Lanjut Tes IQ — catat sekarang
          </div>
          <div className="font-mono text-2xl font-black tracking-widest">
            {code}
          </div>
        </div>
        <p className="text-xs font-bold leading-snug sm:max-w-sm">
          Kalau listrik mati atau komputer mereset sendiri, buka{" "}
          <a className="underline" href="/lanjut?k=cfit">
            /lanjut
          </a>{" "}
          lalu masukkan kode ini untuk melanjutkan tes dari subtes terakhir.
          Waktu yang hilang saat mati lampu tidak dihitung.
        </p>
      </div>
    </div>
  );
}
