"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Pengirim denyut untuk TES IQ — sejajar dengan TimerHeartbeat milik
// minat-bakat.
//
// Dipasang dari src/app/cfit/test/layout.tsx supaya dua halaman tes IQ yang
// sudah besar tidak perlu diubah sama sekali. Kode subtes diambil dari URL
// (/cfit/test/<KODE>), jadi komponen ini tidak butuh props dan tidak perlu
// menunggu params.
//
// CATATAN: denyut TETAP dikirim walau tab tidak aktif. Berpindah tab bukan
// "jeda" — itu justru dicatat anti-cheat sebagai pelanggaran. Yang dianggap
// jeda hanya kalau halaman benar-benar mati (listrik mati / tab ditutup),
// karena saat itu denyut ikut berhenti dengan sendirinya.
const PING_MS = 15_000;

export default function CfitTimerHeartbeat() {
  const pathname = usePathname();
  const match = /^\/cfit\/test\/([^/?#]+)/.exec(pathname ?? "");
  const subtestCode = match ? decodeURIComponent(match[1]) : null;

  useEffect(() => {
    // Halaman hub (/cfit/test) tidak punya timer → tidak perlu denyut.
    if (!subtestCode) return;

    let stopped = false;
    const ping = () => {
      if (stopped) return;
      fetch("/api/cfit/test/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtestCode }),
        keepalive: true,
      }).catch(() => {
        // Jaringan mati → diamkan. Selisih denyut yang hilang otomatis
        // dihitung sebagai jeda oleh server.
      });
    };

    ping();
    const id = setInterval(ping, PING_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [subtestCode]);

  return null;
}
