"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { glossaryDef } from "@/lib/glossary";

/** Shared floating-tooltip primitive — fixed-positioned via a portal so it never clips inside scroll areas. */
function useTip(def: string) {
  const ref = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140), y: r.top });
  };
  const hide = () => setPos(null);
  const bubble = pos && def && typeof document !== "undefined"
    ? createPortal(
        <span
          style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%,-100%)", zIndex: 200 }}
          className="pointer-events-none max-w-[260px] rounded-lg bg-[#1A1C1A] px-2.5 py-1.5 text-[11.5px] font-medium leading-snug text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
        >
          {def}
        </span>,
        document.body,
      )
    : null;
  return { ref, show, hide, bubble };
}

/** Inline term with a dotted underline + hover/focus/tap definition tooltip. `term` is the glossary key. */
export function InfoTip({ term, children, className }: { term: string; children?: ReactNode; className?: string }) {
  const def = glossaryDef(term);
  const { ref, show, hide, bubble } = useTip(def);
  if (!def) return <>{children ?? term}</>;
  return (
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      tabIndex={0}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      className={`cursor-help border-b border-dotted border-current/50 outline-none ${className ?? ""}`}
    >
      {children ?? term}
      {bubble}
    </span>
  );
}

/** A small ⓘ hint dot next to a label (for headers where underlining the word isn't wanted). */
export function InfoHint({ term, className }: { term: string; className?: string }) {
  const def = glossaryDef(term);
  const { ref, show, hide, bubble } = useTip(def);
  if (!def) return null;
  return (
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      tabIndex={0}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      className={`ml-0.5 inline-flex h-3.5 w-3.5 cursor-help select-none items-center justify-center rounded-full border border-current/40 text-[8.5px] font-bold leading-none opacity-60 outline-none hover:opacity-100 ${className ?? ""}`}
      aria-label={`What is ${term}?`}
    >
      i{bubble}
    </span>
  );
}
