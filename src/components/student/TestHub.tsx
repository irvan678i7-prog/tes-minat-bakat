"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

type Sub = {
  id: string;
  code: string;
  name: string;
  description: string;
  durationSec: number;
  total: number;
  answered: number;
};

export default function TestHub({
  testKind,
  studentName,
  subtests,
}: {
  testKind: "MINAT" | "BAKAT";
  studentName: string | null;
  subtests: Sub[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const allDone =
    subtests.length > 0 &&
    subtests.every((s) => s.total === 0 || s.answered >= s.total);

  const finish = async () => {
    if (!confirm("Selesaikan tes? Anda tidak dapat mengubah jawaban setelah dikirim.")) return;
    setSubmitting(true);
    const res = await fetch("/api/student/test/finish", { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return toast.error(d.error || "Gagal menyelesaikan tes");
    }
    router.push("/test/done");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black uppercase">
              Tes {testKind}
            </h1>
            <p className="font-semibold">Peserta: {studentName}</p>
          </div>
          <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
            {subtests.length} SUBTES
          </span>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full space-y-4">
        <p className="font-semibold">
          Pilih subtes untuk dikerjakan. Anda dapat resume dari soal terakhir yang dijawab.
          Setelah semua subtes terisi, klik <strong>SELESAIKAN TES</strong>.
        </p>
        <ol className="space-y-3">
          {subtests.map((s, idx) => {
            const done = s.total > 0 && s.answered >= s.total;
            const empty = s.total === 0;
            return (
              <li
                key={s.id}
                className="brut-card flex items-center justify-between gap-4"
                style={{ background: empty ? "#fff" : done ? "#a3e635" : "#22d3ee" }}
              >
                <div className="flex-1">
                  <div className="text-sm font-bold opacity-70">SUBTES {idx + 1}</div>
                  <div className="text-xl font-black uppercase">{s.name}</div>
                  <div className="text-sm font-semibold">{s.description}</div>
                  <div className="text-xs font-bold mt-1">
                    {s.total === 0 ? (
                      <span className="brut-tag" style={{ background: "#ff4d8d" }}>BELUM ADA SOAL</span>
                    ) : (
                      <>
                        {s.answered}/{s.total} terjawab •{" "}
                        Waktu {Math.round(s.durationSec / 60)} menit
                      </>
                    )}
                  </div>
                </div>
                <Link
                  href={`/test/${s.code}`}
                  className={`brut-btn ${done ? "brut-btn-black" : ""} ${empty ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {done ? "REVIEW" : s.answered > 0 ? "LANJUT" : "MULAI"}
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="pt-4">
          <button
            onClick={finish}
            disabled={submitting || !allDone}
            className="brut-btn brut-btn-pink w-full"
            title={allDone ? "" : "Selesaikan semua subtes dulu"}
          >
            {submitting ? "MENGIRIM..." : "SELESAIKAN TES"}
          </button>
          {!allDone && (
            <p className="text-xs font-bold text-center mt-2 opacity-70">
              Tombol aktif setelah semua subtes selesai dikerjakan.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
