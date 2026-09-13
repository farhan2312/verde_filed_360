"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { grouped } from "@/lib/format";
import { SearchIcon, CheckIcon } from "@/components/icons";
import type { StoreListItem, StoreTagMeta } from "./types";
import { StoreTagPills } from "./StoreTagPills";

export function StoreList({
  stores,
  selectedIds,
  onToggle,
  onClear,
  tagMap,
  tagIdsByStore,
}: {
  stores: StoreListItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
  tagMap: Map<number, StoreTagMeta>;
  tagIdsByStore: Record<number, number[]>;
}) {
  const [q, setQ] = useState("");
  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return stores;
    return stores.filter(
      (st) =>
        st.name.toLowerCase().includes(s) ||
        st.code.toLowerCase().includes(s) ||
        (st.zone ?? "").toLowerCase().includes(s),
    );
  }, [stores, q]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[14px] border border-black/[0.04] bg-white shadow-card">
      <div className="border-b border-line px-3.5 pt-3.5 pb-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-bold text-ink">Stores</div>
          {selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-semibold text-brand-700 hover:underline"
            >
              {selectedIds.length} selected · Clear
            </button>
          ) : (
            <div className="text-[11px] font-semibold text-ink-muted">{filtered.length}</div>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
            <SearchIcon />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stores…"
            className="w-full rounded-lg border border-line bg-surface-100 py-2 pl-9 pr-3 text-[12.5px] text-ink outline-none focus:border-brand-400 focus:bg-white"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-ink-muted">No stores match.</div>
        ) : (
          filtered.map((s) => {
            const active = selSet.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onToggle(s.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-surface-200 px-3 py-2.5 text-left transition-colors",
                  active ? "bg-brand-50" : "hover:bg-surface-100",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors",
                    active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white",
                  )}
                >
                  {active && <CheckIcon />}
                </span>
                <span className="h-2.5 w-2.5 flex-none rounded-[2px]" style={{ background: s.color }} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[12.5px]",
                      active ? "font-bold text-brand-700" : "font-semibold text-ink",
                    )}
                  >
                    {s.shortName}
                  </span>
                  <span className="block truncate text-[10.5px] text-ink-muted">
                    {s.zone ?? "—"}
                    {!s.hasGps && " · no GPS"}
                  </span>
                  <span className="mt-1 block">
                    <StoreTagPills tagIds={tagIdsByStore[s.id] ?? s.tagIds} tagMap={tagMap} max={4} />
                  </span>
                </span>
                <span className="flex-none rounded-full bg-surface-200 px-2 py-0.5 text-[10.5px] font-semibold text-ink-600">
                  {grouped(s.farmerCount)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
