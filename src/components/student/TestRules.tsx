"use client";

import { useEffect, useState } from "react";

// Aturan tes — di-render sebagai modal/overlay full-screen sebelum siswa
// masuk ke daftar subtes. Wajib dibaca & disetujui sekali per submission.

type RuleItem = {
  icon: string;
  title: string;
  desc: string;
};

const FORBIDDEN: RuleItem[] = [
  {
    icon: "✕",
    title: "Pindah tab / aplikasi",
    desc: "Membuka tab baru, pindah ke browser/aplikasi lain, atau split-screen di HP terdeteksi sebagai pelanggaran.",
  },
  {
    icon: "✕",
    title: "Keluar dari mode full-screen",
    desc: "Setelah mode full-screen aktif, jangan tekan Esc atau tombol keluar full-screen.",
  },
  {
    icon: "✕",
    title: "Menyalin / menempel / memotong teks",
    desc: "Aksi copy, paste, dan cut (Ctrl/Cmd + C/V/X) dilarang.",
  },
  {
    icon: "✕",
    title: "Klik kanan",
    desc: "Menu klik-kanan dinonaktifkan selama tes berlangsung.",
  },
  {
    icon: "✕",
    title: "Mengambil screenshot",
    desc: "PrintScreen, Cmd+Shift+3/4/5, Win+Shift+S, dan sejenisnya akan dicatat sebagai pelanggaran.",
  },
  {
    icon: "✕",
    title: "Merekam layar",
    desc: "Menggunakan aplikasi atau ekstensi perekam layar dilarang.",
  },
  {
    icon: "✕",
    title: "Pintasan keyboard terlarang",
    desc: "Pintasan untuk developer tools (F12, Ctrl+Shift+I/J), print, simpan halaman, dsb. diblokir.",
  },
];

const ALLOWED: RuleItem[] = [
  {
    icon: "✓",
    title: "Layar mati / device sleep",
    desc: "Layar yang mati otomatis karena idle TIDAK dihitung sebagai pelanggaran. Sistem juga akan mencoba menjaga layar tetap menyala selama tes.",
  },
  {
    icon: "✓",
    title: "Reload halaman",
    desc: "Anda boleh menyegarkan halaman jika perlu — jawaban tersimpan otomatis ke server.",
  },
  {
    icon: "✓",
    title: "Resume dari soal terakhir",
    desc: "Jika koneksi terputus, Anda dapat melanjutkan dari soal terakhir yang dijawab.",
  },
];

const TIPS: string[] = [
  "Tutup aplikasi/tab lain sebelum mulai supaya tidak terganggu.",
  "Pastikan baterai cukup atau colok charger.",
  "Gunakan koneksi internet stabil.",
  "Siapkan tempat tenang dan bebas gangguan.",
];

export default function TestRules({
  testKind,
  onAcknowledge,
  onClose,
}: {
  testKind: "MINAT" | "BAKAT";
  onAcknowledge: () => void;
  // Kalau diisi, modal bisa ditutup tanpa harus klik "Saya Mengerti" lagi
  // (mode "baca ulang" setelah pernah setuju).
  onClose?: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const readOnly = !!onClose;

  // Cegah body scroll saat modal terbuka.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-rules-title"
    >
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-6">
        <div
          className="brut-card w-full max-w-3xl"
          style={{ background: "#fff", borderColor: "#000" }}
        >
          <div
            className="border-b-4 border-black px-4 sm:px-6 py-4 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4"
            style={{ background: "#facc15" }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2
                id="test-rules-title"
                className="text-2xl sm:text-3xl font-black uppercase"
              >
                ⚑ Aturan Tes {testKind}
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className="brut-tag"
                  style={{ background: "#000", color: "#fff" }}
                >
                  {readOnly ? "BACA ULANG" : "WAJIB DIBACA"}
                </span>
                {readOnly && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="brut-btn brut-btn-white text-xs"
                    aria-label="Tutup"
                  >
                    ✕ TUTUP
                  </button>
                )}
              </div>
            </div>
            <p className="font-semibold text-sm mt-2">
              Selama mengerjakan, sistem akan otomatis mendeteksi aktivitas
              mencurigakan. Bacalah aturan berikut sebelum mulai.
            </p>
          </div>

          <section className="mb-4">
            <h3 className="text-lg font-black uppercase mb-2">
              ✕ Yang Dilarang
            </h3>
            <p className="text-xs font-bold opacity-70 mb-3">
              Setiap pelanggaran dicatat. Setelah <strong>5 pelanggaran</strong>,
              tes akan diselesaikan otomatis dan Anda ditandai{" "}
              <strong>“dicurigai mencurangi”</strong> di laporan admin.
            </p>
            <ul className="space-y-2">
              {FORBIDDEN.map((r, i) => (
                <li
                  key={i}
                  className="border-2 border-black p-3 flex gap-3 items-start"
                  style={{ background: "#fee2e2" }}
                >
                  <span
                    className="brut-tag font-black"
                    style={{ background: "#ef4444", color: "#fff" }}
                  >
                    {r.icon}
                  </span>
                  <div>
                    <div className="font-black uppercase text-sm">{r.title}</div>
                    <div className="text-sm font-semibold leading-relaxed">
                      {r.desc}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-4">
            <h3 className="text-lg font-black uppercase mb-2">
              ✓ Yang Diizinkan
            </h3>
            <ul className="space-y-2">
              {ALLOWED.map((r, i) => (
                <li
                  key={i}
                  className="border-2 border-black p-3 flex gap-3 items-start"
                  style={{ background: "#dcfce7" }}
                >
                  <span
                    className="brut-tag font-black"
                    style={{ background: "#16a34a", color: "#fff" }}
                  >
                    {r.icon}
                  </span>
                  <div>
                    <div className="font-black uppercase text-sm">{r.title}</div>
                    <div className="text-sm font-semibold leading-relaxed">
                      {r.desc}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="border-2 border-black p-3 mb-4"
            style={{ background: "#dbeafe" }}
          >
            <h3 className="text-base font-black uppercase mb-2">
              ⓘ Tips Sebelum Mulai
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-sm font-semibold leading-relaxed">
              {TIPS.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>

          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="brut-btn brut-btn-black w-full text-lg"
            >
              TUTUP
            </button>
          ) : (
            <>
              <label className="brut-checkbox flex items-start gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1"
                />
                <span className="font-bold text-sm">
                  Saya sudah membaca dan memahami aturan di atas. Saya bersedia
                  mengikuti tes dengan jujur dan menerima konsekuensi jika
                  melanggar.
                </span>
              </label>

              <button
                type="button"
                onClick={onAcknowledge}
                disabled={!agreed}
                className="brut-btn brut-btn-pink w-full text-lg"
              >
                SAYA MENGERTI, MULAI TES ▶
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
