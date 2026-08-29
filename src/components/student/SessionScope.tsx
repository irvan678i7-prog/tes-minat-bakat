"use client";

import { createContext, useContext, type ReactNode } from "react";

// ID SESI TES AKTIF (Submission.id) untuk tab ini, disuntikkan dari server
// lewat layout /test.
//
// Kenapa perlu: antrean jawaban di localStorage dulu memakai SATU kunci untuk
// semua sesi di satu perangkat. Akibatnya jawaban sisa dari sesi lain — siswa
// lain yang memakai HP yang sama, atau jenis tes lain — ikut terkirim ke sesi
// yang sedang jalan. Kalau jenis tesnya beda, server menolak (403/404) dan
// siswa dituduh kehilangan jawaban yang bukan miliknya. Kalau jenis tesnya
// SAMA, soalnya valid dan jawaban itu benar-benar MASUK ke sesi yang salah.
//
// Dikirim lewat context, bukan prop, supaya SubtestRunner.tsx (56 KB) tidak
// perlu diubah sama sekali: hook useAnswerSync membaca sendiri dari sini.
const SessionScopeContext = createContext<string | null>(null);

export function SessionScopeProvider({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  return (
    <SessionScopeContext.Provider value={sessionId}>
      {children}
    </SessionScopeContext.Provider>
  );
}

// null kalau tidak ada sesi siswa (mis. halaman dibuka tanpa cookie, atau
// komponen dipakai di luar layout /test). Antrean lalu memakai kunci "anon".
export function useSessionScope(): string | null {
  return useContext(SessionScopeContext);
}
