"use client";

import type { ReactNode } from "react";

// Dialog konfirmasi ala brutalism — pengganti window.confirm() bawaan
// browser supaya konsisten dengan UI. Render kondisional: open=false → null.
export default function CfitConfirm(props: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.65)" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="brut-card max-w-md w-full space-y-4" style={{ background: props.danger ? "#ffe4e6" : "#fff" }}>
        <h2 className="text-xl font-black uppercase">{props.title}</h2>
        {props.children ? (
          <div className="text-sm font-semibold whitespace-pre-wrap">{props.children}</div>
        ) : null}
        <div className="flex flex-col md:flex-row gap-3 md:justify-end">
          <button type="button" className="brut-btn brut-btn-white" onClick={props.onCancel} disabled={props.pending}>
            {props.cancelLabel ?? "BATAL"}
          </button>
          <button
            type="button"
            className={`brut-btn ${props.danger ? "brut-btn-pink" : "brut-btn-black"}`}
            onClick={props.onConfirm}
            disabled={props.pending}
          >
            {props.pending ? "MEMPROSES..." : props.confirmLabel ?? "YA, LANJUTKAN"}
          </button>
        </div>
      </div>
    </div>
  );
}
