"use client";

import { useEffect, useRef } from "react";

/**
 * Inline "please specify" text box, revealed when an "Other" chip is selected
 * (R6) or a Services & Membership toggle is on (R5). Controlled input — the
 * parent owns the value and clears it when the trigger goes away.
 */
export function OtherReveal({
  show,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  show: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputMode?: "text" | "numeric";
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show]);

  if (!show) return null;
  return (
    <input
      ref={ref}
      type="text"
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 w-full rounded-[10px] border-[1.5px] border-[#D3E4AB] bg-[#F1F8F1] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#678722]"
    />
  );
}
