/** Local helpers wrapping the shared map-layer engine for pin/legend/panel/modal use. */
import { layerColor, LAYER_FILTER_OPTS, type MapLayerKey, type FarmerLike } from "@/lib/map-layers";
import type { MapFarmer } from "./types";

/** Adapt a MapFarmer into the shared FarmerLike shape. */
export function toFarmerLike(f: MapFarmer): FarmerLike {
  return {
    segment: f.segment,
    crop: f.crop,
    issue: f.issue ?? "None",
    leadStatus: f.status,
    daysSinceVisit: f.daysSinceVisit,
  };
}

/** Pin colour for a farmer under the active layer. */
export function colorFor(layer: MapLayerKey, f: MapFarmer): string {
  return layerColor(layer, toFarmerLike(f));
}

/** Human-readable value of the active layer for one farmer (panel + bucketing). */
export function valueFor(layer: MapLayerKey, f: MapFarmer): string {
  switch (layer) {
    case "segment":
      return f.segment ?? "Unsegmented";
    case "crop":
      return f.crop ?? "Unknown";
    case "leadStatus":
      return f.status ?? "Unknown";
    case "issues":
      return f.issue ?? "None";
    case "lastVisit": {
      const d = f.daysSinceVisit;
      if (d === null) return "Never visited";
      if (d <= 7) return "Within 7 days";
      if (d <= 14) return "8–14 days";
      if (d <= 30) return "15–30 days";
      return ">30 days";
    }
  }
}

/** Build the "Narrow by" select options for the active layer. */
export function filterOptsFor(
  layer: MapLayerKey,
  layerLabel: string,
): { value: string; label: string }[] {
  return LAYER_FILTER_OPTS[layer].map((v) =>
    v === "all" ? { value: "all", label: `All — ${layerLabel}` } : { value: v, label: v },
  );
}

/** Does a farmer match the chosen narrow-by value for the active layer? */
export function matchesFilter(layer: MapLayerKey, f: MapFarmer, value: string): boolean {
  if (value === "all") return true;
  switch (layer) {
    case "segment":
      return f.segment === value;
    case "crop":
      return f.crop === value;
    case "leadStatus":
      return f.status === value;
    case "issues":
      if (value === "Active Issues") return !!f.issue;
      if (value === "No Issues") return !f.issue;
      return true;
    case "lastVisit": {
      const d = f.daysSinceVisit;
      if (value === "Recent (< 7 days)") return d !== null && d < 7;
      if (value === "This Month") return d !== null && d <= 30;
      if (value === "Older") return d === null || d > 30;
      return true;
    }
  }
}
