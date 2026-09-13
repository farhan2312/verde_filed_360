"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal, ModalHeader, Toggle } from "@/components/interactive";
import { MAP_LAYER_PILLS, LAYER_FILTER_OPTS, type MapLayerKey } from "@/lib/map-layers";
import { cn } from "@/lib/cn";
import { createClusterAction } from "@/app/actions/clusters";
import type { ClusterFarmer, StoreOption } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  stores: StoreOption[];
  farmers: ClusterFarmer[];
}

function matches(
  layer: MapLayerKey,
  value: string,
  f: ClusterFarmer,
): boolean {
  if (value === "all") return true;
  switch (layer) {
    case "segment":
      return f.segment === value;
    case "crop":
      return f.crop === value;
    case "leadStatus":
      return f.leadStatus === value;
    case "issues":
      if (value === "Active Issues") return f.issues.length > 0;
      if (value === "No Issues") return f.issues.length === 0;
      return true;
    default:
      return true;
  }
}

export function CreateClusterModal({ open, onClose, stores, farmers }: Props) {
  const [name, setName] = useState("");
  const [layer, setLayer] = useState<MapLayerKey>("segment");
  const [layerValue, setLayerValue] = useState("all");
  const [storeCode, setStoreCode] = useState<string>(""); // "" = All Stores
  const [seedProject, setSeedProject] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Live preview of matched demo farmers (server recomputes the canonical set).
  const matched = useMemo(
    () =>
      farmers.filter(
        (f) =>
          (!storeCode || f.storeCode === storeCode) && matches(layer, layerValue, f),
      ),
    [farmers, storeCode, layer, layerValue],
  );

  function pickLayer(k: MapLayerKey) {
    setLayer(k);
    setLayerValue("all");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createClusterAction({
        name,
        layer,
        layerValue,
        storeCode: storeCode || null,
        seedProject,
      });
      if (res.ok) {
        setName("");
        setLayer("segment");
        setLayerValue("all");
        setStoreCode("");
        setSeedProject(true);
        onClose();
      } else {
        setError(res.error ?? "Failed to create cluster");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader
        eyebrow="FARMER CLUSTERS · NEW"
        eyebrowColor="#7DA02E"
        title="Create New Cluster"
        subtitle="Pick a map layer, a filter, and a store to snapshot matching farmers."
        onClose={onClose}
      />

      <div className="flex flex-col gap-5 px-6 py-5">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink">Cluster name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. High-value wheat — Ram Nagar"
            className="w-full rounded-[10px] border border-line px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-brand-600"
          />
        </div>

        {/* Map layer */}
        <div>
          <label className="mb-2 block text-[12px] font-bold text-ink">Map layer</label>
          <div className="flex flex-wrap gap-2">
            {MAP_LAYER_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => pickLayer(p.key)}
                className={cn(
                  "flex items-center gap-2 rounded-[20px] border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  layer === p.key
                    ? "border-brand-600 bg-brand-50 text-brand-600"
                    : "border-line bg-white text-ink-600 hover:bg-surface-150",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.swatch }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Layer filter */}
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink">Layer filter</label>
          <select
            value={layerValue}
            onChange={(e) => setLayerValue(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-brand-600"
          >
            {LAYER_FILTER_OPTS[layer].map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "All values" : opt}
              </option>
            ))}
          </select>
        </div>

        {/* Store */}
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink">Store (optional)</label>
          <select
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-brand-600"
          >
            <option value="">All Stores</option>
            {stores.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Seed project toggle */}
        <div className="flex items-center justify-between rounded-[10px] bg-surface-50 px-3.5 py-3">
          <div>
            <div className="text-[12.5px] font-bold text-ink">Seed a field action</div>
            <div className="text-[11px] text-ink-muted">
              Also create a planned Action Planner project from these farmers.
            </div>
          </div>
          <Toggle checked={seedProject} onChange={setSeedProject} labels={{ on: "Yes", off: "No" }} />
        </div>

        {/* Matched count */}
        <div className="flex items-center gap-2 rounded-[10px] border border-[#E9F2CF] bg-[#F5F9EA] px-3.5 py-2.5">
          <span className="text-[13px] font-bold text-brand-600">{matched.length}</span>
          <span className="text-[12px] font-semibold text-brand-600">
            matching farmer{matched.length === 1 ? "" : "s"} will be saved to this cluster
          </span>
        </div>

        {error && <div className="text-[12px] font-semibold text-danger">{error}</div>}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border border-line px-5 py-2.5 text-[13px] font-bold text-ink-600 hover:bg-surface-150"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-[10px] bg-brand-900 px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create Cluster"}
        </button>
      </div>
    </Modal>
  );
}
