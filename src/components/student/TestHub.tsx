"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import TestRules from "@/components/student/TestRules";

type Sub = {
  id: string;
  code: string;
  name: string;
  description: string;
  durationSec: number;
  total: number;
  answered: number;
};

// Try the finish call up to a few times with exponential backoff so a flaky
// connection on the last screen doesn't lose the student's submission.
async function attemptFinish(maxAttempts = 4): Promise<{ ok: boolean; error?: string }> {
  let delay = 800;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch("/api/student/test/finish", { method: "POST" });
      if (res.ok) return { ok: true };
      // 4xx is a real error from the server — don't retry.
      if (res.status >= 400 && res.status < 500) {
        const d = await res.json().catch(() => ({}));
        return { ok: false, error: d.error || `Gagal (${res.status})` };
      }
    } catch {
      // network error — fall through to retry
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 6000);
    }
  }
  return { ok: false, error: "Koneksi gagal. Coba lagi." };
}

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const allDone =
    subtests.length > 0 &&
    subtests.every((s) => s.total === 0 || s.answered >= s.total);

  // Tampilkan aturan tes sekali per submission. Setelah siswa klik
  // "Saya Mengerti", flag disimpan di localStorage supaya reload tidak
  // memunculkan aturan lagi. Siswa tetap bisa membuka kembali dari
  // tombol di header.
  const RULES_KEY = `test_rules_ack_${testKind}`;
  // Pakai useSyncExternalStore supaya tidak ada setState-in-effect dan
  // tidak ada hydration flicker. SSR default = belum di-ack (tampilkan
  // modal) supaya kalau JS sempat delay, modal sudah terlihat dari HTML.
  const ackFromStorage = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem(RULES_KEY) === "1" ? "1" : "0";
      } catch {
        return "0";
      }
    },
    () => "0",
  );
  const [manuallyShown, setManuallyShown] = useState(false);
  const [acked, setAcked] = useState(false);
  const showRules = manuallyShown || (!acked && ackFromStorage !== "1");

  const acknowledgeRules = () => {
    try {
      window.localStorage.setItem(RULES_KEY, "1");
    } catch {
      // Abaikan, modal akan tertutup tetap.
    }
    setAcked(true);
    setManuallyShown(false);
  };

  const finish = async () => {
    if (!confirm("Selesaikan tes? Anda tidak dapat mengubah jawaban setelah dikirim.")) return;
    setSubmitting(true);
    setSubmitError(null);
    const r = await attemptFinish();
    setSubmitting(false);
    if (!r.ok) {
      setSubmitError(r.error || "Gagal menyelesaikan tes");
      toast.error(r.error || "Gagal menyelesaikan tes");
      return;
    }
    router.push("/test/done");
  };

  const retryFinish = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const r = await attemptFinish(6);
    setSubmitting(false);
    if (!r.ok) {
      setSubmitError(r.error || "Masih gagal. Periksa koneksi internet lalu coba lagi.");
      toast.error(r.error || "Gagal menyelesaikan tes");
      return;
    }
    router.push("/test/done");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {showRules && (
        <TestRules
          testKind={testKind}
          onAcknowledge={acknowledgeRules}
          onClose={
            // Modal dapat ditutup hanya kalau dibuka manual via tombol di
            // header (siswa sudah pernah setuju sebelumnya).
            manuallyShown && ackFromStorage === "1"
              ? () => setManuallyShown(false)
              : undefined
          }
        />
      )}
      <header className="border-b-4 border-black bg-yellow-300">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-black uppercase">
              Tes {testKind}
            </h1>
            <p className="font-semibold">Peserta: {studentName}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setManuallyShown(true)}
              className="brut-btn brut-btn-white text-xs"
              title="Lihat aturan tes"
            >
              ⚑ ATURAN TES
            </button>
            <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
              {subtests.length} SUBTES
            </span>
          </div>
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
          {submitError && (
            <div
              className="brut-card mt-3"
              style={{ background: "#ff4d8d", color: "#fff" }}
            >
              <p className="font-black uppercase mb-1">Gagal mengirim hasil</p>
              <p className="text-sm font-semibold mb-3">{submitError}</p>
              <p className="text-xs font-bold mb-2 opacity-90">
                Jawaban Anda masih tersimpan di server. Tunggu sebentar lalu klik
                tombol di bawah, atau hubungi pengawas jika masih gagal.
              </p>
              <button
                onClick={retryFinish}
                disabled={submitting}
                className="brut-btn brut-btn-white w-full"
              >
                {submitting ? "MENCOBA…" : "COBA SUBMIT ULANG"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
