import type { Metadata } from "next";
import LanjutForm from "@/components/student/LanjutForm";

export const metadata: Metadata = {
  title: "Lanjutkan Tes",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

// Halaman pemulihan sesi — untuk KEDUA tes.
//   /lanjut                 → formulir: kode token + Kode Lanjut + nama.
//   /lanjut?t=TOKEN         → link sekali-pakai pengawas (minat-bakat).
//   /lanjut?t=TOKEN&k=cfit  → link sekali-pakai pengawas (tes IQ).
//   /lanjut?k=cfit          → formulir dengan tes IQ sudah terpilih.
export default async function LanjutPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; k?: string }>;
}) {
  const { t, k } = await searchParams;
  const kind = (k ?? "").trim().toLowerCase() === "cfit" ? "cfit" : "minat";
  return <LanjutForm linkToken={t && t.length > 10 ? t : null} kind={kind} />;
}
