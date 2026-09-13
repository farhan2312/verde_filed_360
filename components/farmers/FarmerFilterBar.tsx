"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { VALUE_TITLE, LIFECYCLE_TITLE } from "@/lib/campaign-segments";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { SearchableSelect } from "@/components/SearchableSelect";
import type { SegChipVM, FarmerFacetsVM, FarmerSelectedVM } from "./types";

/**
 * Search box (debounced → writes `?q=`) + TWO independent multi-select segment groups —
 * Value tier (HNI/Potential/Regular → `?value=`) and Lifecycle (New/Recent/At Risk/Lapsed →
 * `?lifecycle=`), each a comma list of keys — plus dropdown filters (store, region, crop, pest,
 * spend). Every change resets `?page=` and preserves the other filters.
 */
export function FarmerFilterBar({
  search,
  valueChips,
  lifecycleChips,
  facets,
  selected,
}: {
  search: string;
  valueChips: SegChipVM[];
  lifecycleChips: SegChipVM[];
  facets: FarmerFacetsVM;
  selected: FarmerSelectedVM;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(search);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep input in sync if the URL changes externally
  useEffect(() => setValue(search), [search]);

  /** Build the URL from the current selections, applying one override. */
  function push(overrides: Partial<FarmerSelectedVM & { q: string }>) {
    const params = new URLSearchParams();
    const q = overrides.q !== undefined ? overrides.q : value;
    if (q.trim()) params.set("q", q.trim());
    const values = overrides.values !== undefined ? overrides.values : selected.values;
    if (values.length) params.set("value", values.join(","));
    const lifecycles = overrides.lifecycles !== undefined ? overrides.lifecycles : selected.lifecycles;
    if (lifecycles.length) params.set("lifecycle", lifecycles.join(","));
    const store = overrides.store !== undefined ? overrides.store : selected.store;
    if (store) params.set("store", store);
    const zone = overrides.zone !== undefined ? overrides.zone : selected.zone;
    if (zone) params.set("zone", zone);
    const crop = overrides.crop !== undefined ? overrides.crop : selected.crop;
    if (crop) params.set("crop", crop);
    const pest = overrides.pest !== undefined ? overrides.pest : selected.pest;
    if (pest) params.set("pest", pest);
    const spend = overrides.spend !== undefined ? overrides.spend : selected.spend;
    if (spend) params.set("spend", spend);
    const wa = overrides.wa !== undefined ? overrides.wa : selected.wa;
    if (wa) params.set("wa", "1");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function onSearchChange(next: string) {
    setValue(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => push({ q: next }), 300);
  }

  /** Toggle a single key within its dimension's selection. */
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const anyFilter = selected.store || selected.zone || selected.crop || selected.pest || selected.spend || selected.values.length || selected.lifecycles.length || selected.wa;
  const select = "rounded-xl border-[1.5px] border-[#E0E0E0] bg-white px-3 py-[9px] text-[12.5px] text-[#424242] outline-none focus:border-[#678722]";

  const ChipGroup = ({ title, chips, dim }: { title: string; chips: SegChipVM[]; dim: "values" | "lifecycles" }) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[10.5px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">{title}</span>
      {chips.map((c) => {
        const style = c.active
          ? { background: c.color, color: "#fff", borderColor: "transparent" }
          : { background: "#fff", color: c.color, borderColor: "#E0E0E0" };
        return (
          <button
            key={c.value}
            type="button"
            title={c.title}
            onClick={() => push({ [dim]: toggle(selected[dim], c.value) } as Partial<FarmerSelectedVM>)}
            style={style}
            className="px-3.5 py-[6px] rounded-full text-[11.5px] font-semibold cursor-pointer border-[1.5px] transition-opacity hover:opacity-85"
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, village, or mobile..."
          value={value}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 max-w-[420px] px-[18px] py-[11px] border-[1.5px] border-[#E0E0E0] rounded-xl text-[13px] bg-white box-border outline-none focus:border-[#678722] focus:shadow-[0_0_0_3px_rgba(46,125,50,0.1)]"
        />
        <ChipGroup title={VALUE_TITLE} chips={valueChips} dim="values" />
        <ChipGroup title={LIFECYCLE_TITLE} chips={lifecycleChips} dim="lifecycles" />
      </div>

      {/* Dropdown filters: store · region · crop · spend tier */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect className={`${select} min-w-[150px]`} placeholder="All stores" searchPlaceholder="Search stores…"
          value={selected.store} onChange={(v) => push({ store: v })}
          options={facets.stores.map((s) => ({ value: String(s.id), label: s.name }))} />
        <SearchableSelect className={`${select} min-w-[140px]`} placeholder="All districts" searchPlaceholder="Search districts…"
          value={selected.zone} onChange={(v) => push({ zone: v })}
          options={facets.zones.map((z) => ({ value: z, label: z }))} />
        <SearchableSelect className={`${select} min-w-[150px]`} placeholder="All crops" searchPlaceholder="Search crops…"
          value={selected.crop} onChange={(v) => push({ crop: v })}
          options={facets.crops.map((c) => ({ value: c.crop, label: `${cropLabel(c.crop)} (${c.count.toLocaleString("en-IN")})` }))} />
        <SearchableSelect className={`${select} min-w-[160px]`} placeholder="All pests / diseases" searchPlaceholder="Search pests…"
          value={selected.pest} onChange={(v) => push({ pest: v })}
          options={facets.pests.map((p) => ({ value: p.pest, label: `${tagLabel(p.pest)} (${p.count.toLocaleString("en-IN")})` }))} />
        <select className={select} value={selected.spend ?? ""} onChange={(e) => push({ spend: e.target.value || null })}>
          <option value="">All spend</option>
          {facets.spendTiers.map((t, i) => (
            <option key={t} value={String(i)}>{t}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border-[1.5px] px-3 py-[9px] text-[12.5px] font-semibold"
          style={{ borderColor: selected.wa ? "#0B8A3D" : "#E0E0E0", background: selected.wa ? "#F1F8F1" : "white", color: selected.wa ? "#516A1B" : "#616161" }}>
          <input type="checkbox" checked={!!selected.wa} onChange={(e) => push({ wa: e.target.checked })} style={{ accentColor: "#0B8A3D" }} />
          ⚡ WhatsApp opted-in
        </label>
        {anyFilter && (
          <button
            type="button"
            onClick={() => router.push(value.trim() ? `${pathname}?q=${encodeURIComponent(value.trim())}` : pathname)}
            className="rounded-full border-[1.5px] border-[#E0E0E0] bg-white px-3.5 py-[7px] text-[11.5px] font-semibold text-[#C62828] hover:opacity-85"
          >
            ✕ Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
