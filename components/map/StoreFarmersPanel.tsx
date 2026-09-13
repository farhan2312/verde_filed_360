"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { inr, grouped, initials } from "@/lib/format";
import { SEGMENT_COLUMNS, segMeta } from "@/lib/campaign-segments";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { SPEND_TIERS } from "@/lib/spend-tiers";
import { Badge } from "@/components/ui";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Modal, ModalHeader } from "@/components/interactive";
import { getStoreFarmers, createClusterFromSelection } from "@/app/actions/cluster-builder";
import { ChainNext } from "@/components/ChainNext";
import type { FarmerFilters, StoreFarmersResult } from "@/lib/cluster";
import type { StoreListItem } from "./types";

const EMPTY_FILTERS: FarmerFilters = {};
const selectClass =
  "rounded-lg border border-line bg-white px-2.5 py-2 text-[12px] font-medium text-ink-600 outline-none focus:border-brand-400";

export function StoreFarmersPanel({
  stores,
  canChain = false,
}: {
  stores: StoreListItem[];
  canChain?: boolean;
}) {
  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);
  const storeKey = storeIds.join(",");
  const storeLabel = stores.length === 1 ? stores[0].name : `${stores.length} stores`;
  const storeShort = stores.length === 1 ? stores[0].shortName : `${stores.length} stores`;

  const [filters, setFilters] = useState<FarmerFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StoreFarmersResult | null>(null);
  const [loading, startLoad] = useTransition();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null); // chain: cluster → project
  const [clusterName, setClusterName] = useState("");
  const [saving, startSave] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [villageQuery, setVillageQuery] = useState("");

  // Reset everything when the store selection changes.
  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    setSelected(new Set());
    setAllMatching(false);
  }, [storeKey]);

  // Fetch (debounced) whenever stores / filters / page change.
  useEffect(() => {
    const t = setTimeout(() => {
      startLoad(async () => {
        const res = await getStoreFarmers(storeIds, filters, page);
        setData(res);
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, filters, page]);

  const resetSelection = () => {
    setPage(1);
    setAllMatching(false);
    setSelected(new Set());
  };
  const setFilter = (k: keyof FarmerFilters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
    resetSelection();
  };
  const setSpendTier = (v: string) => {
    setFilters((f) => ({ ...f, spendTier: v === "" ? undefined : Number(v) }));
    resetSelection();
  };
  const selectedVillages = useMemo(() => filters.villages ?? [], [filters.villages]);
  const villageSet = useMemo(() => new Set(selectedVillages), [selectedVillages]);
  const toggleVillage = (v: string) => {
    const s = new Set(selectedVillages);
    s.has(v) ? s.delete(v) : s.add(v);
    setFilters((f) => ({ ...f, villages: s.size ? [...s] : undefined }));
    resetSelection();
  };
  const hasFilters = !!(
    filters.q?.trim() ||
    filters.category ||
    filters.crop ||
    filters.pest ||
    filters.campaignSegment ||
    filters.spendTier != null ||
    selectedVillages.length
  );
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    resetSelection();
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.pageSize ?? 25)));
  const selectedCount = allMatching ? total : selected.size;

  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleRow = (id: number) => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const togglePage = () => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      if (pageAllSelected) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.add(r.id));
      return n;
    });
  };

  const activeFilterText = useMemo(() => {
    const parts: string[] = [];
    if (selectedVillages.length)
      parts.push(`${selectedVillages.length} village${selectedVillages.length > 1 ? "s" : ""}`);
    if (filters.category) parts.push(filters.category);
    if (filters.crop) parts.push(cropLabel(filters.crop));
    if (filters.pest) parts.push(tagLabel(filters.pest));
    if (filters.campaignSegment) parts.push(segMeta(filters.campaignSegment).label);
    if (filters.spendTier != null && SPEND_TIERS[filters.spendTier]) parts.push(SPEND_TIERS[filters.spendTier].label);
    if (filters.q?.trim()) parts.push(`"${filters.q.trim()}"`);
    return parts.length ? parts.join(" · ") : "no filters";
  }, [filters, selectedVillages.length]);

  const openCluster = () => {
    setClusterName(`${storeShort} — ${new Date().getFullYear()}`);
    setCreatedId(null);
    setModalOpen(true);
  };

  const saveCluster = () => {
    startSave(async () => {
      const res = await createClusterFromSelection({
        name: clusterName,
        storeIds,
        storeName: storeShort,
        filters,
        explicitIds: allMatching ? undefined : [...selected],
        allMatching,
      });
      if (res.ok) {
        setSelected(new Set());
        setAllMatching(false);
        if (canChain && res.id != null) {
          setCreatedId(res.id); // keep the modal open with the chain-to-project box
        } else {
          setModalOpen(false);
          setToast(`Cluster "${clusterName}" created with ${grouped(res.count ?? 0)} farmers.`);
          setTimeout(() => setToast(null), 5000);
        }
      } else {
        setToast(res.error ?? "Could not create cluster.");
        setTimeout(() => setToast(null), 5000);
      }
    });
  };

  return (
    <div className="mt-3.5 overflow-hidden rounded-[14px] border border-black/[0.04] bg-white shadow-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div>
          <div className="text-[15px] font-bold text-ink">
            {storeLabel}
            <span className="ml-2 text-[12px] font-medium text-ink-muted">
              {grouped(total)} farmers{activeFilterText !== "no filters" ? " (filtered)" : ""}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-muted">{activeFilterText}</div>
        </div>{/* header text */}
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-700">
              {grouped(selectedCount)} selected
            </span>
          )}
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={openCluster}
            className="rounded-[10px] bg-brand-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            + Create cluster
          </button>
        </div>
      </div>


      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-50 px-5 py-3">
        <input
          value={filters.q ?? ""}
          onChange={(e) => setFilter("q", e.target.value)}
          placeholder="Search name / mobile / village…"
          className="min-w-[220px] flex-1 rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand-400"
        />
        <SearchableSelect className={selectClass} placeholder="Any purchase" searchPlaceholder="Search category…"
          value={filters.category ?? null} onChange={(v) => setFilter("category", v ?? "")}
          options={(data?.categories ?? []).map((c) => ({ value: c, label: c }))} />
        <SearchableSelect className={selectClass} placeholder="Any crop" searchPlaceholder="Search crops…"
          value={filters.crop ?? null} onChange={(v) => setFilter("crop", v ?? "")}
          options={(data?.crops ?? []).map((c) => ({ value: c.crop, label: `${cropLabel(c.crop)} (${grouped(c.count)})` }))} />
        <SearchableSelect className={selectClass} placeholder="Any pest / disease" searchPlaceholder="Search pests…"
          value={filters.pest ?? null} onChange={(v) => setFilter("pest", v ?? "")}
          options={(data?.pests ?? []).map((p) => ({ value: p.pest, label: `${tagLabel(p.pest)} (${grouped(p.count)})` }))} />
        <SearchableSelect className={selectClass} placeholder="Any segment" searchPlaceholder="Search segment…"
          value={filters.campaignSegment ?? null} onChange={(v) => setFilter("campaignSegment", v ?? "")}
          options={SEGMENT_COLUMNS.map((s) => ({ value: s, label: segMeta(s).label }))} />
        <select value={filters.spendTier != null ? String(filters.spendTier) : ""} onChange={(e) => setSpendTier(e.target.value)} className={selectClass}>
          <option value="">Any spend (P12M)</option>
          {SPEND_TIERS.map((t, i) => (
            <option key={t.label} value={i}>{t.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasFilters}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink-600 transition-colors hover:bg-surface-100 disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
          Clear filters
        </button>
      </div>

      {/* Village picker — the store's villages (nearby), quick multi-add */}
      {(data?.villages.length ?? 0) > 0 && (
        <div className="border-b border-line px-5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink-600">
              Nearby villages
            </span>
            <span className="text-[11px] text-ink-muted">
              {grouped(data?.villages.length ?? 0)} in {stores.length === 1 ? "this store" : "these stores"}
              {selectedVillages.length > 0 && ` · ${selectedVillages.length} selected`}
            </span>
            {selectedVillages.length > 0 && (
              <button
                type="button"
                onClick={() => { setFilters((f) => ({ ...f, villages: undefined })); resetSelection(); }}
                className="text-[11px] font-semibold text-brand-700 hover:underline"
              >
                Clear villages
              </button>
            )}
            <input
              value={villageQuery}
              onChange={(e) => setVillageQuery(e.target.value)}
              placeholder="Find a village…"
              className="ml-auto w-[180px] rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-brand-400"
            />
          </div>
          <div className="flex max-h-[132px] flex-wrap gap-1.5 overflow-y-auto">
            {(data?.villages ?? [])
              .filter((v) => !villageQuery.trim() || v.village.toLowerCase().includes(villageQuery.trim().toLowerCase()))
              .slice(0, 120)
              .map((v) => {
                const on = villageSet.has(v.village);
                return (
                  <button
                    key={v.village}
                    type="button"
                    onClick={() => toggleVillage(v.village)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                      on
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-line bg-white text-ink-600 hover:border-brand-400 hover:bg-brand-50",
                    )}
                  >
                    {v.village}
                    <span className={cn("text-[10px] font-bold", on ? "text-white/70" : "text-ink-400")}>
                      {grouped(v.count)}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Select-all-matching banner */}
      {total > rows.length && (
        <div className="flex items-center justify-center gap-2 bg-brand-50/60 px-5 py-2 text-[12px] text-ink-600">
          {allMatching ? (
            <>
              All <b>{grouped(total)}</b> matching farmers are selected.
              <button type="button" onClick={() => setAllMatching(false)} className="font-semibold text-brand-700 hover:underline">
                Clear
              </button>
            </>
          ) : (
            <>
              {selected.size > 0 ? `${selected.size} on this page selected. ` : ""}
              <button
                type="button"
                onClick={() => { setAllMatching(true); setSelected(new Set()); }}
                className="font-semibold text-brand-700 hover:underline"
              >
                Select all {grouped(total)} matching
              </button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-line text-[10px] font-bold uppercase tracking-[0.5px] text-ink-muted">
              <th className="w-10 px-5 py-2.5">
                <input type="checkbox" checked={pageAllSelected} onChange={togglePage} className="accent-brand-600" />
              </th>
              <th className="py-2.5">Farmer</th>
              <th className="py-2.5">Village</th>
              <th className="py-2.5">Crop / Segment</th>
              <th className="py-2.5 text-right">Lifetime Value</th>
              <th className="py-2.5 pr-5 text-right">Bills</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-[12px] text-ink-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-[12px] text-ink-muted">No farmers match these filters.</td></tr>
            ) : (
              rows.map((f) => {
                const checked = allMatching || selected.has(f.id);
                return (
                  <tr key={f.id} className={cn("border-b border-surface-200 text-[12.5px]", checked && "bg-brand-50/40")}>
                    <td className="px-5 py-2.5">
                      <input type="checkbox" checked={checked} disabled={allMatching} onChange={() => toggleRow(f.id)} className="accent-brand-600" />
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                          {initials(f.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{f.name}</div>
                          <div className="text-[11px] text-ink-muted">{f.mobile ?? "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 text-ink-600">{f.village ?? "—"}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {f.crops.map((c) => (
                          <span key={c} className="rounded-full bg-[#F5F7F5] px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">{cropLabel(c)}</span>
                        ))}
                        {f.segment && (
                          <Badge bg={segMeta(f.segment).bg} color={segMeta(f.segment).color}>
                            {segMeta(f.segment).label}
                          </Badge>
                        )}
                        {f.crops.length === 0 && !f.segment && <span className="text-[11px] text-ink-400">—</span>}
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-semibold text-ink">{f.ltv > 0 ? inr(f.ltv) : "—"}</td>
                    <td className="py-2.5 pr-5 text-right text-ink-600">{f.bills || "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12px] text-ink-600">
          <span>Page {page} of {grouped(pages)}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-line px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-surface-100">Prev</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-line px-3 py-1.5 font-semibold disabled:opacity-40 hover:bg-surface-100">Next</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-brand-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-modal animate-fadeUp">
          {toast}
        </div>
      )}

      {/* Create-cluster modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} className="max-w-[460px]">
        <ModalHeader
          eyebrow="Cluster Builder"
          eyebrowColor="#7DA02E"
          title="Create farmer cluster"
          subtitle={`${storeLabel} · ${grouped(selectedCount)} farmers`}
          onClose={() => setModalOpen(false)}
        />
        <div className="px-6 py-5">
          {createdId != null ? (
            <ChainNext message={`Cluster "${clusterName}" created`} nextLabel="Next: create a project →"
              nextHref={`/projects?withCluster=${createdId}`} onDone={() => { setCreatedId(null); setModalOpen(false); }} />
          ) : (<>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-ink-600">
            Cluster name
          </label>
          <input
            value={clusterName}
            onChange={(e) => setClusterName(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-100 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand-400 focus:bg-white"
            placeholder="e.g. Ram Nagar — pesticide buyers"
          />
          <div className="mt-2 text-[11.5px] text-ink-muted">
            {activeFilterText === "no filters" ? "All selected farmers" : `Filters — ${activeFilterText}`}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-ink-600 hover:bg-surface-100">
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCluster}
              disabled={saving || !clusterName.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : `Save cluster (${grouped(selectedCount)})`}
            </button>
          </div>
          </>)}
        </div>
      </Modal>
    </div>
  );
}
