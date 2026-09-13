"use client";

import { useEffect, useMemo, useState } from "react";
import { grouped } from "@/lib/format";
import { SearchIcon } from "@/components/icons";
import type { StoreListItem, StoreTagMeta } from "./types";
import { StoreTagPills } from "./StoreTagPills";

/**
 * Dedicated store-tagging tab: a searchable table of every in-scope store with its current tags.
 * Tick stores, then click a tag in the action bar to add/remove it across the whole selection
 * (tri-state: fills all / clears all). A per-row "＋" adds a single tag; clicking a pill removes it.
 * Filter by tag to find stores. Catalog CRUD stays in Settings.
 */
export function StoreTagBoard({ stores, tags, tagMap, tagIdsByStore, onApply }: {
  stores: StoreListItem[];
  tags: StoreTagMeta[];
  tagMap: Map<number, StoreTagMeta>;
  tagIdsByStore: Record<number, number[]>;
  onApply: (storeIds: number[], tagId: number, on: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [filterTags, setFilterTags] = useState<Set<number>>(new Set());
  const [untagged, setUntagged] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Close any open per-row "＋" tag popover when clicking outside it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      document.querySelectorAll("details[open]").forEach((d) => { if (!d.contains(e.target as Node)) (d as HTMLDetailsElement).open = false; });
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const tagsOf = (id: number) => tagIdsByStore[id] ?? [];

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return stores.filter((st) => {
      if (s && !(st.name.toLowerCase().includes(s) || st.code.toLowerCase().includes(s) || (st.zone ?? "").toLowerCase().includes(s))) return false;
      const t = tagsOf(st.id);
      if (untagged && filterTags.size === 0) return t.length === 0;
      if (filterTags.size) { const has = t.some((id) => filterTags.has(id)); return untagged ? (has || t.length === 0) : has; }
      return true;
    });
  }, [stores, q, filterTags, untagged, tagIdsByStore]); // eslint-disable-line react-hooks/exhaustive-deps

  const selList = [...selected];
  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleAllShown = () => setSelected(allShownSelected ? new Set() : new Set(filtered.map((s) => s.id)));

  // Bulk chip state across the current selection.
  const countInSel = (tagId: number) => selList.reduce((k, id) => k + (tagsOf(id).includes(tagId) ? 1 : 0), 0);
  const bulkApply = (tagId: number) => {
    if (!selList.length) return;
    const allOn = countInSel(tagId) >= selList.length;
    onApply(selList, tagId, !allOn);
  };

  if (tags.length === 0) {
    return (
      <div className="rounded-[14px] border border-[#F5CE8E] bg-[#FEF6E9] px-4 py-10 text-center text-[13px] text-[#8D6E00]">
        No store tags defined yet. A system admin can add them in <b>Settings → Store Tags</b>.
      </div>
    );
  }

  const chip = "inline-flex items-center gap-1 rounded-full border-[1.5px] px-2.5 py-[3px] text-[11px] font-semibold transition-colors";

  return (
    <div className="animate-[fadeUp_0.35s_ease-out] flex flex-col gap-3">
      {/* Toolbar */}
      <div className="rounded-[14px] border border-black/[0.04] bg-white p-3.5 shadow-card">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-[240px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"><SearchIcon /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stores…"
              className="w-full rounded-lg border border-line bg-surface-100 py-2 pl-9 pr-3 text-[12.5px] text-ink outline-none focus:border-brand-400 focus:bg-white" />
          </div>
          <div className="ml-auto text-[11.5px] font-medium text-ink-muted">{filtered.length} of {stores.length} stores</div>
        </div>
        {/* Filter by tag */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.4px] text-ink-muted">Filter:</span>
          {tags.map((t) => {
            const on = filterTags.has(t.id);
            return (
              <button key={t.id} type="button" onClick={() => setFilterTags((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
                className={chip} style={{ background: on ? t.color : "#fff", color: on ? "#fff" : t.color, borderColor: t.color }}>
                {t.name}
              </button>
            );
          })}
          <button type="button" onClick={() => setUntagged((v) => !v)}
            className={chip} style={{ background: untagged ? "#607D8B" : "#fff", color: untagged ? "#fff" : "#607D8B", borderColor: "#B0BEC5" }}>
            Untagged
          </button>
          {(filterTags.size > 0 || untagged) && (
            <button type="button" onClick={() => { setFilterTags(new Set()); setUntagged(false); }} className="text-[11px] font-semibold text-[#C62828] hover:underline">Reset</button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selList.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-[14px] border border-brand-200 bg-[#F3FAF3] p-3 shadow-card">
          <span className="text-[12px] font-bold text-brand-800">{selList.length} selected — click a tag to add / remove for all:</span>
          {tags.map((t) => {
            const c = countInSel(t.id);
            const allOn = c >= selList.length;
            const some = c > 0 && c < selList.length;
            return (
              <button key={t.id} type="button" onClick={() => bulkApply(t.id)}
                title={`${c} of ${selList.length} selected have “${t.name}”`}
                className={chip} style={{ background: allOn ? t.color : "#fff", color: allOn ? "#fff" : t.color, borderColor: t.color, borderStyle: some ? "dashed" : "solid" }}>
                {allOn ? "✓ " : ""}{t.name}{some ? ` · ${c}/${selList.length}` : ""}
              </button>
            );
          })}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[11.5px] font-semibold text-[#C62828] hover:underline">Clear selection</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-black/[0.04] bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[#9E9E9E]">
                <th className="w-9 px-3 py-2.5 text-center">
                  <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} style={{ accentColor: "#678722" }} aria-label="Select all shown" />
                </th>
                <th className="px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.3px]">Store</th>
                <th className="px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.3px]">District</th>
                <th className="px-3 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.3px]">Farmers</th>
                <th className="px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.3px]">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-[12px] text-ink-muted">No stores match.</td></tr>
              ) : filtered.map((s) => {
                const t = tagsOf(s.id);
                const checked = selected.has(s.id);
                return (
                  <tr key={s.id} className={`border-b border-[#F5F5F5] ${checked ? "bg-brand-50/50" : "hover:bg-surface-100"}`}>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={checked} onChange={() => toggleSel(s.id)} style={{ accentColor: "#678722" }} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 flex-none rounded-[2px]" style={{ background: s.color }} />
                        <span className="text-[12.5px] font-semibold text-ink">{s.shortName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px] text-ink-muted">{s.zone ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right text-[11.5px] tabular-nums text-ink-600">{grouped(s.farmerCount)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {t.map((id) => { const tag = tagMap.get(id); if (!tag) return null; return (
                          <button key={id} type="button" onClick={() => onApply([s.id], id, false)} title={`Remove “${tag.name}”`}
                            className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold leading-none"
                            style={{ background: `${tag.color}1A`, color: tag.color, boxShadow: `inset 0 0 0 1px ${tag.color}55` }}>
                            {tag.name}<span className="opacity-50 group-hover:opacity-100">×</span>
                          </button>
                        ); })}
                        <AddTagMenu tags={tags} has={t} onAdd={(tagId) => onApply([s.id], tagId, true)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Per-row "＋" popover listing tags not yet on this store. */
function AddTagMenu({ tags, has, onAdd }: { tags: StoreTagMeta[]; has: number[]; onAdd: (tagId: number) => void }) {
  const remaining = tags.filter((t) => !has.includes(t.id));
  if (remaining.length === 0) return null;
  return (
    <details className="group relative">
      <summary className="flex h-[19px] cursor-pointer list-none items-center rounded-full border border-dashed border-[#BDBDBD] px-2 text-[11px] font-bold text-[#9E9E9E] hover:border-brand-400 hover:text-brand-600">＋</summary>
      <div className="absolute left-0 z-20 mt-1 w-[180px] rounded-lg border border-[#E0E0E0] bg-white p-1 shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
        {remaining.map((t) => (
          <button key={t.id} type="button" onClick={(e) => { onAdd(t.id); (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] font-semibold hover:bg-[#F5F7F5]">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: t.color }} />
            <span className="truncate" style={{ color: t.color }}>{t.name}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
