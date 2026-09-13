"use client";

import { useMemo, useState, useTransition } from "react";
import { LEGEND_META, type MapLayerKey } from "@/lib/map-layers";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui";
import type { MapFarmer, MapStore, StoreListItem, StoreTagMeta } from "./types";
import { colorFor, valueFor } from "./layer-util";
import { MapCanvas } from "./MapCanvas";
import { FarmerDetailPanel } from "./FarmerDetailPanel";
import { StoreList } from "./StoreList";
import { StoreFarmersPanel } from "./StoreFarmersPanel";
import { StoreTagBoard } from "./StoreTagBoard";
import { applyStoreTagBulk } from "@/app/actions/store-tags";

type MapTab = "map" | "tags";

export function MapView({
  farmers,
  stores,
  allStores,
  storeTags,
  canChain = false,
}: {
  farmers: MapFarmer[];
  stores: MapStore[];
  allStores: StoreListItem[];
  storeTags: StoreTagMeta[];
  canChain?: boolean;
}) {
  const [tab, setTab] = useState<MapTab>("map");
  const [layer] = useState<MapLayerKey>("segment");
  const [, startTag] = useTransition();

  // Live per-store tag ids — shared by the Map-tab list pills and the Store-Tags board so edits reflect everywhere.
  const [tagIdsByStore, setTagIdsByStore] = useState<Record<number, number[]>>(
    () => Object.fromEntries(allStores.map((s) => [s.id, s.tagIds])),
  );
  const tagMap = useMemo(() => new Map(storeTags.map((t) => [t.id, t])), [storeTags]);

  // Assign/unassign one tag across N stores (server-enforced scope). Optimistic, reverts on failure.
  const applyTag = (storeIds: number[], tagId: number, on: boolean) => {
    const prev = tagIdsByStore;
    setTagIdsByStore((cur) => {
      const next = { ...cur };
      for (const id of storeIds) {
        const set = new Set(next[id] ?? []);
        on ? set.add(tagId) : set.delete(tagId);
        next[id] = [...set];
      }
      return next;
    });
    startTag(async () => {
      const r = await applyStoreTagBulk(storeIds, tagId, on);
      if (!r.ok) { setTagIdsByStore(prev); alert(r.error ?? "Could not update tags."); }
    });
  };
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<number>>(new Set());
  const [showStorePins, setShowStorePins] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [selectedFarmerId, setSelectedFarmerId] = useState<number | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const selectedFarmer = useMemo(
    () => farmers.find((f) => f.id === selectedFarmerId) ?? null,
    [farmers, selectedFarmerId],
  );
  const selectedStores = useMemo(
    () => allStores.filter((s) => selectedStoreIds.has(s.id)),
    [allStores, selectedStoreIds],
  );
  const selectedIdList = useMemo(() => [...selectedStoreIds], [selectedStoreIds]);
  const activeLayerLabel = LEGEND_META[layer].label;

  const legendItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of farmers) {
      const c = colorFor(layer, f);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return LEGEND_META[layer].items
      .map((it) => ({ ...it, count: counts.get(it.color) ?? 0 }))
      .filter((it) => it.count > 0);
  }, [farmers, layer]);

  const toggleStore = (id: number, fromMap = false) => {
    setSelectedStoreIds((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setSelectedFarmerId(null);
    // Selecting from the list re-frames the map; clicking pins keeps the current view.
    if (!fromMap) setFitNonce((k) => k + 1);
  };
  const clearStores = () => {
    setSelectedStoreIds(new Set());
    setSelectedFarmerId(null);
    setFitNonce((k) => k + 1);
  };
  const fitToSelection = () => setFitNonce((k) => k + 1);

  if (allStores.length === 0) {
    return (
      <div className="animate-[fadeUp_0.4s_ease-out]">
        <EmptyState
          title="No stores yet"
          hint="Import the store master data to build clusters."
        />
      </div>
    );
  }

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {/* Tabs: Map ↔ Store Tags */}
      <div className="mb-3 inline-flex rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
        {([["map", "🗺️ Map"], ["tags", "🏷️ Store Tags"]] as [MapTab, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className="rounded-[8px] px-5 py-2 text-[12.5px] font-bold transition-colors"
            style={{ background: tab === k ? "#fff" : "transparent", color: tab === k ? "#7DA02E" : "#9E9E9E", boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "tags" ? (
        <StoreTagBoard stores={allStores} tags={storeTags} tagMap={tagMap} tagIdsByStore={tagIdsByStore} onApply={applyTag} />
      ) : (
      <>
      {/* Map display controls */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={fitToSelection}
          className="flex items-center gap-1.5 rounded-[20px] border-[1.5px] border-[#E0E0E0] bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" />
          </svg>
          Fit to selection
        </button>
        <button
          type="button"
          onClick={() => setShowHeat((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-[20px] border-[1.5px] px-3.5 py-1.5 text-[11.5px] font-semibold",
            showHeat
              ? "border-[#E9F2CF] bg-[#F5F9EA] text-[#7DA02E]"
              : "border-[#E0E0E0] bg-[#F5F5F5] text-[#616161] hover:bg-[#EEEEEE]",
          )}
        >
          🔥 Heatmap
        </button>
        <button
          type="button"
          onClick={() => setShowStorePins((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-[20px] border-[1.5px] px-3.5 py-1.5 text-[11.5px] font-semibold",
            showStorePins
              ? "border-[#E9F2CF] bg-[#F5F9EA] text-[#7DA02E]"
              : "border-[#E0E0E0] bg-[#F5F5F5] text-[#616161] hover:bg-[#EEEEEE]",
          )}
        >
          Store Pins
        </button>
      </div>

      {/* Store list + map */}
      <div className="flex flex-col gap-3.5 lg:flex-row">
        <div className="h-[420px] w-full lg:h-[520px] lg:w-[300px] lg:flex-none">
          <StoreList
            stores={allStores}
            selectedIds={selectedIdList}
            onToggle={toggleStore}
            onClear={clearStores}
            tagMap={tagMap}
            tagIdsByStore={tagIdsByStore}
          />
        </div>

        <div className="relative flex min-w-0 flex-1 overflow-hidden rounded-[14px] border border-black/[0.04] bg-white shadow-card">
          <div className="relative h-[420px] min-w-0 flex-1 overflow-hidden lg:h-[520px]">
            <MapCanvas
              farmers={farmers}
              stores={stores}
              layer={layer}
              selectedStoreIds={selectedIdList}
              fitNonce={fitNonce}
              showStorePins={showStorePins}
              showHeat={showHeat}
              selectedFarmerId={selectedFarmerId}
              onSelectFarmer={(f) => setSelectedFarmerId(f.id)}
              onToggleStore={(id) => toggleStore(id, true)}
            />
          </div>
          {selectedFarmer && (
            <FarmerDetailPanel
              farmer={selectedFarmer}
              layerLabel={activeLayerLabel}
              layerValue={valueFor(layer, selectedFarmer)}
              layerColor={colorFor(layer, selectedFarmer)}
              onClose={() => setSelectedFarmerId(null)}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5 rounded-[12px] border border-black/[0.03] bg-white px-[18px] py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {showHeat && (
          <div className="mr-3 flex items-center gap-2 border-r border-[#EEE] pr-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.7px] text-[#9E9E9E]">
              🔥 Farmer Density
            </span>
            <span
              className="h-[10px] w-[80px] rounded-full"
              style={{
                background:
                  "linear-gradient(90deg,#66852A,#BDD67F,#D4E157,#FFB300,#E53935)",
              }}
            />
            <span className="text-[10px] text-[#9E9E9E]">fewer → more</span>
          </div>
        )}
        <div className="mr-1.5 flex-none text-[9.5px] font-bold uppercase tracking-[0.7px] text-[#9E9E9E]">
          👤 {activeLayerLabel}
        </div>
        {legendItems.length === 0 ? (
          <span className="text-[11px] text-[#9E9E9E]">
            Farmer overlay shows geo-tagged farmers only — select a store below to work with its full list.
          </span>
        ) : (
          legendItems.map((li) => (
            <span
              key={li.label}
              className="my-0.5 flex items-center gap-1.5 rounded-[20px] bg-[#F5F5F5] px-[9px] py-[3px]"
            >
              <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: li.color }} />
              <span className="text-[11px] font-medium text-[#616161]">{li.label}</span>
              <span className="text-[10px] font-bold text-[#9E9E9E]">({li.count})</span>
            </span>
          ))
        )}
      </div>

      {/* Selected stores' farmers + cluster builder */}
      {selectedStores.length > 0 ? (
        <StoreFarmersPanel key={selectedIdList.join(",")} stores={selectedStores} canChain={canChain} />
      ) : (
        <div className="mt-3.5 rounded-[14px] border border-dashed border-line bg-white px-6 py-10 text-center">
          <div className="text-[14px] font-semibold text-ink">Select one or more stores to build a cluster</div>
          <div className="mt-1 text-[12px] text-ink-muted">
            Tick stores in the list (or click pins on the map) to see their farmers, filter by village,
            crop, purchase behaviour or segment, and save a cluster for later action.
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
