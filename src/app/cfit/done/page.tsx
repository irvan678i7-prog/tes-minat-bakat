"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type StartStatus = {
  finishedAt: string | null;
  subtests?: Array<{ locked: boolean }>;
};

export default function CfitDonePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // GUARD: halaman ini hanya memfinalisasi tes kalau tes memang sudah
  // selesai (finishedAt terisi) atau semua subtes sudah terkunci. Tanpa
  // guard, peserta yang tidak sengaja membuka /cfit/done di tengah tes akan
  // langsung mengunci seluruh tesnya.
  useEffect(() => {
    (async () => {
      const st = await fetch("/api/cfit/test/start", { cache: "no-store" });
      if (st.status === 401) {
        router.replace("/cfit");
        return;
      }
      const data = (await st.json().catch(() => ({}))) as StartStatus;
      if (!st.ok) {
        router.replace("/cfit/test");
        return;
      }
      const allLocked =
        Array.isArray(data.subtests) && data.subtests.length > 0 && data.subtests.every((s) => s.locked);
      if (!data.finishedAt && !allLocked) {
        toast.error("Tes belum selesai — lanjutkan dulu subtes yang tersisa.");
        router.replace("/cfit/test");
        return;
      }
      // Finalisasi idempoten: kunci semua subtes + hitung & simpan hasil.
      // Skor IQ TIDAK ditampilkan ke peserta — hasil diolah oleh admin/guru
      // (sama seperti kebijakan tes minat-bakat).
      await fetch("/api/cfit/test/finish", { method: "POST" }).catch(() => null);
      setReady(true);
    })();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="brut-card font-black uppercase brut-blink">Menyimpan hasil...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="brut-card max-w-lg w-full text-center space-y-4" style={{ background: "#a3e635" }}>
        <div className="text-5xl">🎉</div>
        <h1 className="text-3xl font-black uppercase">Tes Selesai!</h1>
        <p className="font-semibold">
          Semua jawaban kamu sudah tersimpan dan dinilai otomatis.
          Hasil tes IQ akan diolah dan disampaikan oleh admin / guru pembimbing.
        </p>
        <Link href="/cfit" className="brut-btn brut-btn-black inline-block">
          KE HALAMAN AWAL
        </Link>
      </div>
    </div>
  );
}
