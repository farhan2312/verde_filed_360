"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A single-select dropdown with a built-in search box — a drop-in replacement for a native
 * <select> on filters with many options. Keyboard-free, click-driven, closes on outside click.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "All",
  className = "",
  searchPlaceholder = "Search…",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options;
  }, [options, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-2 ${className}`}
      >
        <span className={`truncate ${selected ? "text-[#424242]" : "text-[#9E9E9E]"}`}>{selected ? selected.label : placeholder}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" className="flex-none text-[#9E9E9E]"><path d="M2 3.5L5 6.5 8 3.5" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-[300px] w-[max(100%,220px)] overflow-hidden rounded-xl border border-[#E0E0E0] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <div className="border-b border-[#F0F0F0] p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#678722]"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-[#F5F7F5] ${value == null ? "font-semibold text-[#678722]" : "text-[#616161]"}`}>
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-[#9E9E9E]">No matches</div>
            ) : filtered.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                className={`block w-full truncate px-3 py-1.5 text-left text-[12.5px] hover:bg-[#F5F7F5] ${o.value === value ? "font-semibold text-[#678722]" : "text-[#424242]"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
