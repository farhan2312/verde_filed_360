"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VisitFilterOptions, VisitFilterState } from "./types";

const PERIOD_PILLS: { label: string; key: string }[] = [
  { label: "Today", key: "today" },
  { label: "This Week", key: "week" },
  { label: "This Month", key: "month" },
  { label: "All Time", key: "all" },
];

const SELECT_CLASS =
  "px-3 py-[6px] border-[1.5px] border-[#E0E0E0] rounded-lg text-xs bg-white outline-none text-[#616161] cursor-pointer";

export function VisitFilterBar({
  filter,
  options,
  total,
}: {
  filter: VisitFilterState;
  options: VisitFilterOptions;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (params: URLSearchParams) => {
      params.delete("page"); // any filter/search change resets to page 1
      const qs = params.toString();
      router.push(qs ? `/visits?${qs}` : "/visits");
      router.refresh(); // force the server component to re-run (defeats any stale client router cache)
    },
    [router],
  );

  // Dropdown filters: "all" means "no filter", so drop the param entirely.
  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete(key);
      else params.set(key, value);
      navigate(params);
    },
    [navigate, searchParams],
  );

  // Period pills: "all" (All Time) is a real state, NOT an absent filter — always set it explicitly,
  // or the page falls back to its "month" default and All Time can never stay selected.
  // Choosing a period clears any explicit date search (the two are mutually exclusive).
  const setPeriod = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      ["date", "from", "to"].forEach((k) => params.delete(k));
      params.set("period", value);
      navigate(params);
    },
    [navigate, searchParams],
  );

  // Explicit visit-date search (exact day or range). Overrides the period preset (period param dropped).
  const hasDate = !!(filter.date || filter.from || filter.to);
  const [dateMode, setDateMode] = useState<"exact" | "range">(filter.from || filter.to ? "range" : "exact");
  const applyDate = useCallback(
    (patch: Record<string, string | undefined>, clear: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      clear.forEach((k) => params.delete(k));
      params.delete("period");
      for (const [k, v] of Object.entries(patch)) { if (v) params.set(k, v); else params.delete(k); }
      navigate(params);
    },
    [navigate, searchParams],
  );
  const clearDates = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    ["date", "from", "to"].forEach((k) => params.delete(k));
    navigate(params);
  }, [navigate, searchParams]);

  // Debounced free-text search (farmer name / mobile / village / officer).
  const [q, setQ] = useState(filter.q);
  useEffect(() => setQ(filter.q), [filter.q]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (val: string) => {
    setQ(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (val.trim()) params.set("q", val.trim()); else params.delete("q");
      navigate(params);
    }, 350);
  };

  return (
    <div className="bg-white rounded-xl px-5 py-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] mb-4">
      <div className="flex items-center gap-[10px] flex-wrap">
        {/* Search */}
        <input
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search farmer, phone, village, officer…"
          aria-label="Search visits"
          className="w-[240px] rounded-lg border-[1.5px] border-[#E0E0E0] px-3 py-[6px] text-xs outline-none focus:border-[#7DA02E]"
        />
        <div className="w-px h-6 bg-[#F0F0F0] mx-1" />

        {/* Period pills */}
        {PERIOD_PILLS.map((p) => {
          const active = !hasDate && filter.period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className="px-[14px] py-[6px] rounded-[20px] text-xs font-semibold cursor-pointer transition-all hover:opacity-85"
              style={{
                background: active ? "#5C7D22" : "white",
                color: active ? "white" : "#616161",
                border: `1.5px solid ${active ? "#5C7D22" : "#E0E0E0"}`,
              }}
            >
              {p.label}
            </button>
          );
        })}

        <div className="w-px h-6 bg-[#F0F0F0] mx-1" />

        {/* Visit-date search: exact day OR range (mutually exclusive with the period pills) */}
        <div className="inline-flex overflow-hidden rounded-lg border border-[#E0E0E0]">
          {(["exact", "range"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setDateMode(m)}
              className="px-2.5 py-[6px] text-[11px] font-semibold transition-colors"
              style={{ background: dateMode === m ? "#5C7D22" : "#fff", color: dateMode === m ? "#fff" : "#616161" }}>
              {m === "exact" ? "On date" : "Range"}
            </button>
          ))}
        </div>
        {dateMode === "exact" ? (
          <input type="date" value={filter.date} aria-label="Visits on date"
            onChange={(e) => applyDate({ date: e.target.value || undefined }, ["from", "to"])} className={SELECT_CLASS} />
        ) : (
          <>
            <input type="date" value={filter.from} max={filter.to || undefined} aria-label="Visit date from"
              onChange={(e) => applyDate({ from: e.target.value || undefined, to: filter.to || undefined }, ["date"])} className={SELECT_CLASS} />
            <span className="text-xs text-[#9E9E9E]">→</span>
            <input type="date" value={filter.to} min={filter.from || undefined} aria-label="Visit date to"
              onChange={(e) => applyDate({ from: filter.from || undefined, to: e.target.value || undefined }, ["date"])} className={SELECT_CLASS} />
          </>
        )}
        {hasDate && (
          <button type="button" onClick={clearDates} title="Clear date filter"
            className="rounded-full px-2 py-1 text-xs leading-none text-[#9E9E9E] hover:text-[#C62828]">✕</button>
        )}

        <div className="w-px h-6 bg-[#F0F0F0] mx-1" />

        {/* Officer filter */}
        <select
          value={filter.officer}
          onChange={(e) => setParam("officer", e.target.value)}
          className={SELECT_CLASS}
          aria-label="Filter by officer"
        >
          <option value="all">All Officers</option>
          {options.officers.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        {/* Store filter */}
        <select
          value={filter.store}
          onChange={(e) => setParam("store", e.target.value)}
          className={SELECT_CLASS}
          aria-label="Filter by store"
        >
          <option value="all">All Stores</option>
          {options.stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Regional Manager filter */}
        <select
          value={filter.rm}
          onChange={(e) => setParam("rm", e.target.value)}
          className={SELECT_CLASS}
          aria-label="Filter by regional manager"
        >
          <option value="all">All RMs</option>
          {options.rms.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {/* Visit type filter */}
        <select
          value={filter.type}
          onChange={(e) => setParam("type", e.target.value)}
          className={SELECT_CLASS}
          aria-label="Filter by visit type"
        >
          <option value="all">All Types</option>
          {options.types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Review status filter */}
        <select
          value={filter.review}
          onChange={(e) => setParam("review", e.target.value)}
          className={SELECT_CLASS}
          aria-label="Filter by review status"
        >
          <option value="all">All Reviews</option>
          <option value="reviewed">✓ Reviewed</option>
          <option value="pending">Not reviewed</option>
        </select>

        <div className="ml-auto text-xs text-[#9E9E9E] font-medium">
          {total} visits found
        </div>
      </div>
    </div>
  );
}
