import type { ReactNode } from "react";
import CfitResumeBanner from "@/components/cfit/CfitResumeBanner";
import CfitTimerHeartbeat from "@/components/cfit/CfitTimerHeartbeat";

// Layout tipis untuk seluruh halaman tes IQ.
//
// Dibuat khusus supaya dua hal berikut bisa dipasang TANPA menyentuh halaman
// hub (page.tsx) dan halaman soal ([code]/page.tsx) yang sudah besar:
//   - CfitTimerHeartbeat → denyut timer sadar-jeda (hanya di halaman soal).
//   - CfitResumeBanner   → banner Kode Lanjut (hanya di halaman hub).
// Kedua komponen menentukan sendiri kapan aktif dari URL, jadi layout ini
// tidak perlu membaca params.
export default function CfitTestLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CfitResumeBanner />
      <CfitTimerHeartbeat />
      {children}
    </>
  );
}
