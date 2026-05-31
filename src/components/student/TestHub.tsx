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
  started: boolean;
  completed: boolean;
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

  // A subtest is "selesai" when its timer is up or the student finished it.
  // The whole test can be submitted once every subtest that has questions is
  // completed. (Subtes tanpa soal diabaikan.)
  const answerable = subtests.filter((s) => s.total > 0);
  const remainingCount = answerable.filter((s) => !s.completed).length;
  const allDone = answerable.length > 0 && remainingCount === 0;

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
        <div className="brut-card" style={{ background: "#fff" }}>
          <p className="font-semibold">
            Pilih subtes untuk dikerjakan. Setiap subtes memiliki <strong>batas waktu</strong> yang
            mulai berjalan saat subtes pertama kali dibuka dan terus berjalan sampai habis.
          </p>
          <p className="font-semibold mt-2">
            Subtes dianggap <strong>SELESAI</strong> bila waktunya habis atau Anda menekan tombol
            <em> &ldquo;Selesaikan Subtes&rdquo;</em>. Setelah <strong>semua subtes selesai</strong>,
            tombol <strong>SELESAIKAN TES</strong> akan aktif.
          </p>
        </div>
        <ol className="space-y-3">
          {subtests.map((s, idx) => {
            const empty = s.total === 0;
            const done = s.completed;
            const inProgress = s.started && !done && !empty;
            const bg = empty ? "#fff" : done ? "#a3e635" : inProgress ? "#fde047" : "#22d3ee";
            return (
              <li
                key={s.id}
                className="brut-card flex items-center justify-between gap-4"
                style={{ background: bg }}
              >
                <div className="flex-1">
                  <div className="text-sm font-bold opacity-70">SUBTES {idx + 1}</div>
                  <div className="text-xl font-black uppercase">{s.name}</div>
                  <div className="text-sm font-semibold">{s.description}</div>
                  <div className="text-xs font-bold mt-1 flex flex-wrap gap-2 items-center">
                    {empty ? (
                      <span className="brut-tag" style={{ background: "#ff4d8d" }}>BELUM ADA SOAL</span>
                    ) : (
                      <>
                        <span>{s.answered}/{s.total} terjawab</span>
                        <span>• Waktu {Math.round(s.durationSec / 60)} menit</span>
                        {done && (
                          <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>SELESAI</span>
                        )}
                        {inProgress && (
                          <span className="brut-tag" style={{ background: "#ff4d8d", color: "#fff" }}>
                            SEDANG BERJALAN
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <Link
                  href={`/test/${s.code}`}
                  className={`brut-btn ${done ? "brut-btn-black" : ""} ${empty ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {done ? "TINJAU" : inProgress ? "LANJUT" : "MULAI"}
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
              {answerable.length === 0
                ? "Belum ada soal pada tes ini."
                : `Masih ada ${remainingCount} subtes yang belum selesai.`}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
