import type { ReactNode } from "react";
import AnswerSyncAlert from "@/components/student/AnswerSyncAlert";

// Layout tipis untuk seluruh halaman tes minat-bakat.
//
// Dibuat khusus supaya banner peringatan sinkronisasi jawaban bisa dipasang
// di semua halaman tes TANPA menyentuh SubtestRunner.tsx (56 KB) maupun
// halaman /test dan /test/[code]. Banner menentukan sendiri kapan muncul,
// jadi layout ini tidak perlu tahu apa-apa soal state tes.
export default function TestLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AnswerSyncAlert />
    </>
  );
}
