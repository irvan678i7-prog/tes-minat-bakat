import type { Metadata } from "next";
import LanjutForm from "@/components/student/LanjutForm";

export const metadata: Metadata = {
  title: "Lanjutkan Tes",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

// Halaman pemulihan sesi.
//   /lanjut          → formulir: token kelas + Kode Lanjut + nama lengkap.
//   /lanjut?t=TOKEN  → link sekali-pakai buatan pengawas (langsung pulih).
export default async function LanjutPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <LanjutForm linkToken={t && t.length > 10 ? t : null} />;
}
