/** Map View layer colour engine, legend, and layer pills (from the design). */

export type MapLayerKey = "segment" | "crop" | "lastVisit" | "issues" | "leadStatus";

export const MAP_LAYER_PILLS: { key: MapLayerKey; label: string; swatch: string }[] = [
  { key: "segment", label: "Farmer Segment", swatch: "#678722" },
  { key: "crop", label: "Crop", swatch: "#EDA942" },
  { key: "lastVisit", label: "Last Visited", swatch: "#E65100" },
  { key: "issues", label: "Issues & Concerns", swatch: "#C62828" },
  { key: "leadStatus", label: "Lead Status", swatch: "#7B1FA2" },
];

export const LAYER_LABELS: Record<MapLayerKey, string> = {
  segment: "Farmer Segment",
  crop: "Crop Type",
  lastVisit: "Last Visited",
  issues: "Issues & Concerns",
  leadStatus: "Lead Status",
};

const SEGMENT_FN: Record<string, string> = {
  "High Value": "#678722", "Medium Value": "#1565C0", "New/Low": "#D4881F", Dormant: "#9E9E9E",
};
const CROP_FN: Record<string, string> = {
  Wheat: "#EDA942", Rice: "#B3D170", Sugarcane: "#678722", Potato: "#8D6E63",
  Mustard: "#FF8F00", Millets: "#78909C", Barley: "#E0921F", Paddy: "#B3D170",
};
const ISSUE_FN: Record<string, string> = {
  "Pest Infestation": "#C62828", "Disease Infection": "#E65100", "Irrigation Issue": "#1565C0",
  "Nutrient Deficiency": "#7B1FA2", "Weed Problem": "#D4881F", None: "#678722",
};
const LEAD_FN: Record<string, string> = {
  New: "#678722", Contacted: "#1565C0", "Follow-up": "#E65100", Converted: "#7B1FA2", Lost: "#757575",
};

function lastVisitColor(daysAgo: number | null): string {
  if (daysAgo === null) return "#C62828";
  if (daysAgo <= 7) return "#678722";
  if (daysAgo <= 14) return "#EDA942";
  if (daysAgo <= 30) return "#E65100";
  return "#C62828";
}

export interface FarmerLike {
  segment?: string | null; // display label
  crop?: string | null;
  issue?: string | null; // primary issue label or "None"
  leadStatus?: string | null; // display label
  daysSinceVisit?: number | null;
}

/** Pin colour for a farmer under the active layer. */
export function layerColor(layer: MapLayerKey, f: FarmerLike): string {
  switch (layer) {
    case "segment": return SEGMENT_FN[f.segment || ""] ?? "#9E9E9E";
    case "crop": return CROP_FN[f.crop || ""] ?? "#9E9E9E";
    case "issues": return ISSUE_FN[f.issue || "None"] ?? "#678722";
    case "leadStatus": return LEAD_FN[f.leadStatus || ""] ?? "#757575";
    case "lastVisit": return lastVisitColor(f.daysSinceVisit ?? null);
  }
}

export const LEGEND_META: Record<MapLayerKey, { label: string; items: { label: string; color: string }[] }> = {
  segment: { label: "Farmer Segment", items: [
    { label: "High Value", color: "#678722" }, { label: "Medium Value", color: "#1565C0" },
    { label: "New/Low", color: "#D4881F" }, { label: "Dormant", color: "#9E9E9E" }] },
  crop: { label: "Main Crop", items: [
    { label: "Wheat", color: "#EDA942" }, { label: "Sugarcane", color: "#678722" },
    { label: "Rice/Paddy", color: "#B3D170" }, { label: "Potato", color: "#8D6E63" },
    { label: "Mustard", color: "#FF8F00" }, { label: "Millets", color: "#78909C" },
    { label: "Barley", color: "#E0921F" }] },
  lastVisit: { label: "Last Visited", items: [
    { label: "Within 7 days", color: "#678722" }, { label: "8–14 days", color: "#EDA942" },
    { label: "15–30 days", color: "#E65100" }, { label: ">30 days", color: "#C62828" }] },
  issues: { label: "Issues & Concerns", items: [
    { label: "Pest", color: "#C62828" }, { label: "Disease", color: "#E65100" },
    { label: "Irrigation", color: "#1565C0" }, { label: "Nutrient", color: "#7B1FA2" },
    { label: "Weed", color: "#D4881F" }, { label: "None", color: "#678722" }] },
  leadStatus: { label: "Lead Status", items: [
    { label: "New", color: "#678722" }, { label: "Contacted", color: "#1565C0" },
    { label: "Follow-up", color: "#E65100" }, { label: "Converted", color: "#7B1FA2" },
    { label: "Lost", color: "#757575" }] },
};

export const LAYER_FILTER_OPTS: Record<MapLayerKey, string[]> = {
  segment: ["all", "High Value", "Medium Value", "New/Low"],
  crop: ["all", "Wheat", "Rice", "Sugarcane", "Potato", "Mustard"],
  lastVisit: ["all", "Recent (< 7 days)", "This Month", "Older"],
  issues: ["all", "Active Issues", "No Issues"],
  leadStatus: ["all", "New", "Contacted", "Follow-up", "Converted", "Lost"],
};
