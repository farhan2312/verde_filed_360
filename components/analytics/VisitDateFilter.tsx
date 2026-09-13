"use client";

import { useMemo } from "react";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Visit date filter: quick buckets + two date pickers (From / To). */
export function VisitDateFilter({ minDate, from, to, onChange }: {
  minDate: string | null;
  from?: string; to?: string;
  onChange: (from?: string, to?: string) => void;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = iso(today);
  const minIso = minDate ?? iso(new Date(today.getTime() - 365 * DAY));

  const bucket = (kind: number | "month" | "all") => {
    if (kind === "all") return onChange(undefined, undefined);
    if (kind === "month") return onChange(iso(new Date(today.getFullYear(), today.getMonth(), 1)), todayIso);
    return onChange(iso(new Date(today.getTime() - kind * DAY)), todayIso);
  };

  const active = from != null || to != null;
  const BUCKETS: [string, number][] = [["Last 7 days", 7], ["Last 30 days", 30], ["Last 90 days", 90]];
  const INPUT = "rounded-[8px] border border-[#E0E0E0] bg-white px-2.5 py-1 text-[12px] text-[#1A1C1A] outline-none focus:border-[#7DA02E]";

  return (
    <div className="mb-3 rounded-[12px] border border-black/[0.04] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">Visit dates:</span>
        {BUCKETS.map(([label, d]) => (
          <button key={label} type="button" onClick={() => bucket(d)}
            className="rounded-full border border-[#E0E0E0] px-3 py-1 text-[11.5px] font-semibold text-[#616161] hover:border-[#7DA02E] hover:text-[#7DA02E]">{label}</button>
        ))}
        <button type="button" onClick={() => bucket("month")}
          className="rounded-full border border-[#E0E0E0] px-3 py-1 text-[11.5px] font-semibold text-[#616161] hover:border-[#7DA02E] hover:text-[#7DA02E]">This month</button>
        <button type="button" onClick={() => bucket("all")}
          className="rounded-full border px-3 py-1 text-[11.5px] font-semibold"
          style={{ borderColor: active ? "#E0E0E0" : "#7DA02E", color: active ? "#616161" : "#7DA02E", background: active ? "#fff" : "#F5F9EA" }}>All time</button>

        {/* From / To date pickers — bounds keep the range valid (From ≤ To ≤ today). */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <label className="text-[11px] font-semibold text-[#9E9E9E]">From</label>
          <input type="date" className={INPUT} value={from ?? ""} min={minIso} max={to ?? todayIso}
            onChange={(e) => onChange(e.target.value || undefined, to)} />
          <span className="text-[#9E9E9E]">→</span>
          <label className="text-[11px] font-semibold text-[#9E9E9E]">To</label>
          <input type="date" className={INPUT} value={to ?? ""} min={from ?? minIso} max={todayIso}
            onChange={(e) => onChange(from, e.target.value || undefined)} />
          {active && (
            <button type="button" onClick={() => bucket("all")} title="Clear dates"
              className="rounded-full px-2 py-1 text-[13px] leading-none text-[#9E9E9E] hover:text-[#C62828]">✕</button>
          )}
        </div>
      </div>
    </div>
  );
}
