"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Brutalism-styled pengganti `window.alert` — hanya tombol "OK", tidak ada
// pilihan batal. Pola Promise-based mirip `useBrutConfirm`.

export type BrutAlertTone = "danger" | "warning" | "info" | "success";

export type BrutAlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  tone?: BrutAlertTone;
  icon?: string;
};

type PendingState = {
  options: BrutAlertOptions;
  resolve: () => void;
} | null;

const TONE_BG: Record<BrutAlertTone, string> = {
  danger: "#ff4d8d",
  warning: "#facc15",
  info: "#22d3ee",
  success: "#a3e635",
};

const TONE_BTN: Record<BrutAlertTone, string> = {
  danger: "brut-btn-pink",
  warning: "brut-btn",
  info: "brut-btn-cyan",
  success: "brut-btn-lime",
};

const DEFAULT_ICON: Record<BrutAlertTone, string> = {
  danger: "✕",
  warning: "⚠",
  info: "ℹ",
  success: "✓",
};

export function useBrutAlert() {
  const [pending, setPending] = useState<PendingState>(null);
  const okBtnRef = useRef<HTMLButtonElement | null>(null);

  const alert = useCallback(
    (options: BrutAlertOptions) =>
      new Promise<void>((resolve) => {
        setPending({ options, resolve });
      }),
    [],
  );

  const close = useCallback(() => {
    setPending((p) => {
      if (p) p.resolve();
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => okBtnRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        close();
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

  const tone = pending?.options.tone ?? "info";
  const headerBg = TONE_BG[tone];
  const btnClass = TONE_BTN[tone];
  const icon = pending?.options.icon ?? DEFAULT_ICON[tone];
  const title = pending?.options.title ?? "Pemberitahuan";
  const okLabel = pending?.options.okLabel ?? "OK";

  const AlertModal = pending ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 overflow-y-auto brut-alert-overlay"
      style={{ background: "rgba(0,0,0,0.55)" }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="brut-alert-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="brut-card brut-alert-card w-full max-w-md"
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
            id="brut-alert-title"
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
          className="px-5 py-4 flex justify-end border-t-4 border-black"
          style={{ background: "#fef9c3" }}
        >
          <button
            ref={okBtnRef}
            type="button"
            onClick={close}
            className={`brut-btn ${btnClass} text-sm`}
          >
            {okLabel}
          </button>
        </div>
      </div>
      <style>{`
        .brut-alert-overlay {
          animation: brut-alert-fade 120ms ease-out;
        }
        .brut-alert-card {
          animation: brut-alert-pop 140ms cubic-bezier(.2,.9,.3,1.2);
        }
        @keyframes brut-alert-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes brut-alert-pop {
          from { transform: translateY(8px) scale(.96); opacity: 0; }
          to   { transform: translateY(0)   scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  ) : null;

  return { alert, AlertModal };
}
