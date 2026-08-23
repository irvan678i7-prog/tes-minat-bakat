"use client";

import { useEffect, useRef } from "react";

// DENYUT TIMER — komponen tak terlihat (render null) yang dipasang sebagai
// "saudara" SubtestRunner di halaman /test/[code]. Sengaja dipisah supaya
// SubtestRunner.tsx tidak perlu disentuh sama sekali.
//
// Tugasnya satu: tiap ±15 detik kirim POST /api/student/test/heartbeat.
// Server memakai denyut ini untuk menambah waktu AKTIF subtes. Begitu denyut
// berhenti (listrik mati, tab ditutup, laptop mati), server menganggap sesi
// TERJEDA dan tidak menghabiskan waktu subtes — maksimal 10 menit per subtes.
//
// Semua error diabaikan: kalau jaringan mati, denyut berikutnya menyusul, dan
// selisihnya nanti diperhitungkan server sebagai jeda.

const DEFAULT_PING_MS = 15_000;
const MIN_PING_MS = 5_000;

export default function TimerHeartbeat({
  subtestCode,
  intervalMs = DEFAULT_PING_MS,
}: {
  subtestCode: string;
  intervalMs?: number;
}) {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!subtestCode) return;
    let stopped = false;

    const ping = async () => {
      if (stopped || inFlight.current) return;
      inFlight.current = true;
      try {
        await fetch("/api/student/test/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subtestCode }),
          // keepalive: denyut tetap terkirim walau halaman sedang ditutup.
          keepalive: true,
        });
      } catch {
        // Offline / server tidak terjangkau — diamkan.
      } finally {
        inFlight.current = false;
      }
    };

    // Denyut pertama langsung, supaya lastSeenAt segar sejak halaman dibuka.
    void ping();
    const timer = setInterval(() => {
      void ping();
    }, Math.max(MIN_PING_MS, intervalMs));

    // Browser sering menahan setInterval di tab background. Begitu tab
    // kembali terlihat / internet kembali nyambung, kirim denyut segera.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void ping();
    };
    const onOnline = () => {
      void ping();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [subtestCode, intervalMs]);

  return null;
}
