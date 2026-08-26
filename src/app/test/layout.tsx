import type { ReactNode } from "react";
import { getStudentFromCookies } from "@/lib/auth";
import AnswerSyncAlert from "@/components/student/AnswerSyncAlert";
import { SessionScopeProvider } from "@/components/student/SessionScope";

// Layout tipis untuk seluruh halaman tes minat-bakat.
//
// Dibuat khusus supaya banner peringatan sinkronisasi jawaban bisa dipasang
// di semua halaman tes TANPA menyentuh SubtestRunner.tsx (56 KB) maupun
// halaman /test dan /test/[code]. Banner menentukan sendiri kapan muncul,
// jadi layout ini tidak perlu tahu apa-apa soal state tes.
//
// Layout ini juga menyuntikkan ID SESI TES (Submission.id) ke context, supaya
// antrean jawaban di localStorage dipisah per sesi. Id-nya dibaca dari cookie
// di server, jadi halaman tes maupun runner tidak perlu diubah.
export default async function TestLayout({ children }: { children: ReactNode }) {
  const me = await getStudentFromCookies();
  return (
    <SessionScopeProvider sessionId={me?.sub ?? null}>
      {children}
      <AnswerSyncAlert />
    </SessionScopeProvider>
  );
}
