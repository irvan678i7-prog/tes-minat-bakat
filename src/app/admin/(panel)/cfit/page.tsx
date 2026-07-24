import { redirect } from "next/navigation";

// Panel CFIT sekarang menyatu di dashboard admin utama (tab “Tes IQ (CFIT)”).
// Route lama ini dipertahankan sebagai redirect supaya link/bookmark tetap jalan.
export default function CfitAdminRedirect() {
  redirect("/admin#cfit");
}
