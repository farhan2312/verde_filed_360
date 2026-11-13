"use client";

import { useEffect, useRef, useState } from "react";
import { getFilterOptions, type FilterOptions } from "@/app/actions/custom-analytics";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS } from "@/lib/campaign-segments";
import { DATE_PRESET_LABEL, type DatePreset, type PageFilters, type CrossFilter } from "@/lib/custom-analytics/types";

type Opts = FilterOptions;
let cache: Promise<Opts> | null = null;
const loadOpts = () => (cache ??= getFilterOptions().catch((e) => { cache = null; throw e; })); // retry after a failure

/** One row of page filters above the visuals: date range, region, store, RM, value segment, lifecycle. */
export function PageFiltersBar({ filters, onChange, cf, onClearCf }: { filters: PageFilters; onChange: (f: PageFilters) => void; cf: CrossFilter | null; onClearCf: () => void }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  useEffect(() => { loadOpts().then(setOpts).catch(() => setOpts({ stores: [], regions: [], rms: [] })); }, []);
  const preset = filters.datePreset ?? "all";
  const set = (p: Partial<PageFilters>) => onChange({ ...filters, ...p });
  const storeOpts = (opts?.stores ?? []).filter((s) => !filters.regions?.length || (s.zone && filters.regions.includes(s.zone)));
  const active = [filters.regions, filters.storeIds, filters.rmUserIds, filters.valueSegments, filters.lifecycles].some((a) => a?.length) || preset !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={preset} onChange={(e) => set({ datePreset: e.target.value as DatePreset })} aria-label="Date range"
        className="rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[12.5px] text-[#424242]">
        {(Object.keys(DATE_PRESET_LABEL) as DatePreset[]).map((k) => <option key={k} value={k}>📅 {DATE_PRESET_LABEL[k]}</option>)}
      </select>
      {preset === "custom" && (
        <span className="flex items-center gap-1 text-[12px] text-[#757575]">
          <input type="date" value={filters.dateFrom ?? ""} onChange={(e) => set({ dateFrom: e.target.value })} className="rounded-lg border border-[#E0E0E0] px-2 py-1 text-[12px]" />
          →
          <input type="date" value={filters.dateTo ?? ""} onChange={(e) => set({ dateTo: e.target.value })} className="rounded-lg border border-[#E0E0E0] px-2 py-1 text-[12px]" />
        </span>
      )}
      {opts && opts.regions.length > 1 && <Multi label="Region" options={opts.regions.map((r) => ({ v: r, l: r }))} value={filters.regions ?? []} onChange={(v) => set({ regions: v, storeIds: filters.storeIds?.filter((id) => storeOpts.some((s) => s.id === id)) })} />}
      {opts && opts.stores.length > 1 && <Multi label="Store" options={storeOpts.map((s) => ({ v: String(s.id), l: s.name }))} value={(filters.storeIds ?? []).map(String)} onChange={(v) => set({ storeIds: v.map(Number) })} />}
      {/* RMs are user accounts, so the filter value is the User.id — a store with two managers matches both. */}
      {opts && opts.rms.length > 1 && <Multi label="RM" options={opts.rms.map((r) => ({ v: String(r.id), l: r.name }))} value={(filters.rmUserIds ?? []).map(String)} onChange={(v) => set({ rmUserIds: v.map(Number) })} />}
      <Multi label="Value segment" options={VALUE_SEGMENTS.map((s) => ({ v: s, l: segMeta(s).label }))} value={filters.valueSegments ?? []} onChange={(v) => set({ valueSegments: v })} />
      <Multi label="Lifecycle" options={LIFECYCLE_SEGMENTS.map((s) => ({ v: s, l: segMeta(s).label }))} value={filters.lifecycles ?? []} onChange={(v) => set({ lifecycles: v })} />
      {active && <button type="button" onClick={() => onChange({ datePreset: "all" })} className="text-[12px] font-semibold text-[#C62828] hover:underline">Clear filters</button>}
      {cf && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F2FD] py-0.5 pl-2.5 pr-1 text-[11.5px] font-semibold text-[#1565C0]">
          Filtered by click — {cf.label}
          <button type="button" onClick={onClearCf} aria-label="Clear click filter" className="rounded-full px-1 leading-none hover:bg-[#BBDEFB]">×</button>
        </span>
      )}
    </div>
  );
}

function Multi({ label, options, value, onChange }: { label: string; options: { v: string; l: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const shown = options.filter((o) => o.l.toLowerCase().includes(q.trim().toLowerCase()));
  const on = new Set(value);
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((x) => !x)}
        className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] ${value.length ? "border-[#7DA02E] bg-[#F5F9EA] font-semibold text-[#7DA02E]" : "border-[#E0E0E0] bg-white text-[#424242]"}`}>
        {label}{value.length ? ` · ${value.length}` : ""} ▾
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-[230px] overflow-hidden rounded-[10px] border border-[#E0E0E0] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          {options.length > 8 && (
            <div className="border-b border-[#F0F0F0] p-2"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full rounded-md border border-[#E0E0E0] px-2 py-1 text-[12px]" /></div>
          )}
          <div className="flex gap-3 border-b border-[#F0F0F0] px-3 py-1.5 text-[11.5px] font-semibold">
            <button type="button" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.v)])])} className="text-[#7DA02E]">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-[#C62828]">Clear</button>
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {shown.map((o) => (
              <label key={o.v} className="flex cursor-pointer items-center gap-2 px-3 py-1 text-[12.5px] hover:bg-[#F5F7F5]">
                <input type="checkbox" checked={on.has(o.v)} onChange={() => onChange(on.has(o.v) ? value.filter((x) => x !== o.v) : [...value, o.v])} className="h-3.5 w-3.5 accent-[#7DA02E]" />
                <span className="truncate">{o.l}</span>
              </label>
            ))}
            {!shown.length && <div className="px-3 py-2 text-[12px] text-[#9E9E9E]">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
