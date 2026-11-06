"use client";

import { useEffect, useRef, useState } from "react";

export interface ClusterOption { id: number; name: string; count: number }

const n = (x: number) => x.toLocaleString("en-IN");

/**
 * Searchable multi-select for a campaign's clusters. Trigger shows a summary; the panel has a search box,
 * Select all / Clear (acting on the filtered list), and a checkbox list with each cluster's live count.
 * Picked clusters also show as removable chips under the trigger. `noun` + the labels let it filter other lists (e.g. stores).
 */
export function ClusterMultiSelect({ options, value, onChange, noun = "clusters", emptyLabel = "Pick clusters…", allLabel }: {
  options: ClusterOption[]; value: number[]; onChange: (ids: number[]) => void; noun?: string; emptyLabel?: string; allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    search.current?.focus();
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const picked = new Set(value);
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = options.filter((o) => terms.every((t) => o.name.toLowerCase().includes(t)));
  const toggle = (id: number) => onChange(picked.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const selectShown = () => onChange([...new Set([...value, ...shown.map((o) => o.id)])]);
  const clearShown = () => { const drop = new Set(shown.map((o) => o.id)); onChange(value.filter((id) => !drop.has(id))); };

  const all = options.length > 0 && value.length === options.length;
  const summary = value.length === 0 ? emptyLabel : all ? allLabel ?? `Whole project · all ${options.length} ${noun}` : `${value.length} of ${options.length} ${noun}`;
  const chips = options.filter((o) => picked.has(o.id));

  return (
    <div ref={box} className="relative mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-2 text-left text-[13px] ${open ? "border-[#7DA02E]" : "border-[#E0E0E0]"}`}>
        <span className={value.length ? "font-semibold text-[#1A1C1A]" : "text-[#9E9E9E]"}>{summary}</span>
        <span className="text-[10px] text-[#757575]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-[10px] border border-[#E0E0E0] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <div className="border-b border-[#F0F0F0] p-2">
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${noun}…`}
              className="w-full rounded-md border border-[#E0E0E0] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#7DA02E]" />
            <div className="mt-1.5 flex items-center gap-3 text-[11.5px] font-semibold">
              <button type="button" onClick={selectShown} disabled={!shown.length} className="text-[#7DA02E] disabled:opacity-40">{terms.length ? `Select ${shown.length} shown` : "Select all"}</button>
              <button type="button" onClick={clearShown} disabled={!shown.some((o) => picked.has(o.id))} className="text-[#C62828] disabled:opacity-40">{terms.length ? "Clear shown" : "Clear"}</button>
              <span className="ml-auto font-normal text-[#9E9E9E]">{value.length} selected</span>
            </div>
          </div>
          <ul className="max-h-[260px] overflow-y-auto py-1">
            {shown.map((o) => {
              const on = picked.has(o.id);
              return (
                <li key={o.id}>
                  <label className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-[#F5F7F5] ${on ? "bg-[#F1F8F1]" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="h-4 w-4 accent-[#7DA02E]" />
                    <span className="min-w-0 flex-1 truncate" title={o.name}>{o.name}</span>
                    <span className="shrink-0 tabular-nums text-[12px] text-[#757575]">{n(o.count)}</span>
                  </label>
                </li>
              );
            })}
            {!shown.length && <li className="px-3 py-3 text-center text-[12.5px] text-[#9E9E9E]">No {noun} match "{q}".</li>}
          </ul>
        </div>
      )}

      {chips.length > 0 && !all && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((o) => (
            <span key={o.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#F5F9EA] py-0.5 pl-2.5 pr-1 text-[11.5px] font-semibold text-[#7DA02E]">
              <span className="truncate">{o.name}</span>
              <button type="button" onClick={() => toggle(o.id)} aria-label={`Remove ${o.name}`} className="rounded-full px-1 text-[13px] leading-none hover:bg-[#E9F2CF]">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
