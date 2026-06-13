"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Brutalism-styled konfirmasi pengganti `window.confirm`. Selain mengikuti
// tema (border tebal, drop-shadow, warna aksen), modal ini juga:
// - Bisa dipanggil sebagai Promise<boolean>: `await confirm({ ... })`.
// - Memerangkap fokus & menutup pakai ESC.
// - Tidak memblokir thread JS (beda dengan confirm() native yang freeze tab).
// - Animasi enter cepat (~120ms) supaya kerasa snappy, bukan lambat.

export type BrutConfirmTone = "danger" | "warning" | "info" | "success";

export type BrutConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: BrutConfirmTone;
  // Nada ikon di header. Default ⚠ untuk warning/danger, ✓ untuk success, ℹ untuk info.
  icon?: string;
};

type PendingState = {
  options: BrutConfirmOptions;
  resolve: (value: boolean) => void;
} | null;

const TONE_BG: Record<BrutConfirmTone, string> = {
  danger: "#ff4d8d",
  warning: "#facc15",
  info: "#22d3ee",
  success: "#a3e635",
};

const TONE_BTN: Record<BrutConfirmTone, string> = {
  danger: "brut-btn-pink",
  warning: "brut-btn",
  info: "brut-btn-cyan",
  success: "brut-btn-lime",
};

const DEFAULT_ICON: Record<BrutConfirmTone, string> = {
  danger: "⚠",
  warning: "⚠",
  info: "ℹ",
  success: "✓",
};

export function useBrutConfirm() {
  const [pending, setPending] = useState<PendingState>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback(
    (options: BrutConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve });
      }),
    [],
  );

  const close = useCallback(
    (result: boolean) => {
      setPending((p) => {
        if (p) p.resolve(result);
        return null;
      });
    },
    [],
  );

  // Fokus tombol konfirmasi saat modal terbuka — supaya Enter langsung
  // mengonfirmasi tanpa harus klik. Juga handle ESC = cancel.
  useEffect(() => {
    if (!pending) return;
    // Focus the confirm button shortly after mount so the modal animation
    // settles first.
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [pending, close]);

  const tone = pending?.options.tone ?? "danger";
  const headerBg = TONE_BG[tone];
  const confirmBtnClass = TONE_BTN[tone];
  const icon = pending?.options.icon ?? DEFAULT_ICON[tone];
  const title = pending?.options.title ?? "Konfirmasi";
  const confirmLabel = pending?.options.confirmLabel ?? "LANJUTKAN";
  const cancelLabel = pending?.options.cancelLabel ?? "Batal";

  const ConfirmModal = pending ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 overflow-y-auto brut-confirm-overlay"
      style={{ background: "rgba(0,0,0,0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="brut-confirm-title"
      onMouseDown={(e) => {
        // Tutup kalau klik di backdrop (tapi tidak kalau klik di modal).
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div
        className="brut-card brut-confirm-card w-full max-w-md"
        style={{ background: "#fff", padding: 0 }}
      >
        <div
          className="px-5 py-3 flex items-center gap-3 border-b-4 border-black"
          style={{ background: headerBg }}
        >
          <span
            aria-hidden
            className="inline-flex items-center justify-center font-black"
            style={{
              width: 40,
              height: 40,
              border: "3px solid #000",
              background: "#fff",
              fontSize: 22,
              boxShadow: "3px 3px 0 0 #000",
            }}
          >
            {icon}
          </span>
          <h2
            id="brut-confirm-title"
            className="text-xl font-black uppercase leading-tight"
          >
            {title}
          </h2>
        </div>
        <div className="px-5 py-5">
          <p className="font-semibold leading-relaxed whitespace-pre-line">
            {pending.options.message}
          </p>
        </div>
        <div
          className="px-5 py-4 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end border-t-4 border-black"
          style={{ background: "#fef9c3" }}
        >
          <button
            type="button"
            onClick={() => close(false)}
            className="brut-btn brut-btn-white text-sm"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => close(true)}
            className={`brut-btn ${confirmBtnClass} text-sm`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        .brut-confirm-overlay {
          animation: brut-confirm-fade 120ms ease-out;
        }
        .brut-confirm-card {
          animation: brut-confirm-pop 140ms cubic-bezier(.2,.9,.3,1.2);
        }
        @keyframes brut-confirm-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes brut-confirm-pop {
          from { transform: translateY(8px) scale(.96); opacity: 0; }
          to   { transform: translateY(0)   scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  ) : null;

  return { confirm, ConfirmModal };
}
