"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { CloseIcon } from "./icons";

/* ── Toggle switch (design: on #7DA02E / off #BDBDBD, knob slides) ── */
export function Toggle({
  checked,
  onChange,
  labels = { on: "Yes", off: "No" },
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labels?: { on: string; off: string };
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className="relative h-[26px] w-[46px] rounded-full transition-colors"
        style={{ background: checked ? "#7DA02E" : "#BDBDBD" }}
      >
        <span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? 22 : 3 }}
        />
      </span>
      <span
        className="text-[12px] font-semibold"
        style={{ color: checked ? "#7DA02E" : "#9E9E9E" }}
      >
        {checked ? labels.on : labels.off}
      </span>
    </button>
  );
}

/* ── Modal (backdrop + centered panel; Esc / backdrop to close) ── */
export function Modal({
  open,
  onClose,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  // Portal to <body> so the overlay always positions against the viewport — never trapped by an
  // ancestor with a transform (e.g. animate-fadeUp), which would make `fixed` resolve to that
  // element's box and push the centred dialog far down a long page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-countUp"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-[560px] max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-modal",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalHeader({
  title,
  subtitle,
  eyebrow,
  eyebrowColor = "#E65100",
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  eyebrowColor?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b border-line px-6 pt-5 pb-4">
      <div>
        {eyebrow && (
          <div
            className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1px]"
            style={{ color: eyebrowColor }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: eyebrowColor }} />
            {eyebrow}
          </div>
        )}
        <div className="text-[19px] font-bold text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 text-[12px] text-ink-muted">{subtitle}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-200 text-ink-500 hover:bg-surface-300"
        aria-label="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
