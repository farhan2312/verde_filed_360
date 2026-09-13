import { SEGMENT_BGS, SEGMENT_COLORS, type SegmentLabel } from "@/lib/segments";
import { avatarColor } from "@/lib/format";

/** Selection criteria stored on a Cluster (the `criteria` JSON blob). */
export interface ClusterCriteria {
  layer: string;
  layerLabel: string;
  layerValue: string;
  store: string | null;
  storeName: string;
}

/** A farmer eligible to be matched into a cluster (demo, enriched farmers only). */
export interface ClusterFarmer {
  id: number;
  name: string;
  village: string;
  crop: string;
  land: number;
  segment: string; // display label
  leadStatus: string; // display label
  issues: string[];
  lastVisit: string;
  storeCode: string | null;
}

/** A plain, serialisable cluster passed from the server component to the client. */
export interface ClusterView {
  id: number;
  name: string;
  criteria: ClusterCriteria;
  farmerIds: number[];
  farmerNames: string[];
  farmerCount: number;
  createdDate: string; // "Jun 23"
}

/** A store option for the create-cluster modal. */
export interface StoreOption {
  code: string;
  name: string;
}

export const CLUSTER_PAGE_SIZE = 20;

/** A member farmer of a cluster, fetched on demand (works for real + demo). */
export interface ClusterMemberRow {
  id: number;
  name: string;
  village: string;
  crop: string; // crops joined (legacy consumers)
  crops: string[]; // crop labels ordered by the farmer's spend on each (most → least)
  land: number;
  segment: string; // value tier label (HNI/Potential HNI/Regular) or "—"
  lifecycle: string; // lifecycle label (New/At Risk/Lapsed) or "—"
  lastVisit: string;
  ltv: string; // formatted ₹ or "—"
  /** The farmer's mapped store (short name), or "—". */
  store: string;
}

export interface ClusterMembersResult {
  rows: ClusterMemberRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Header for the spend column: "LTV" normally, or "<Crop> spend" when the cluster is crop-scoped. */
  ltvLabel: string;
}

/* ── criteriaText helpers (two spacing variants — faithful to the DSL) ── */

/** List-row criteria text: `layerLabel[: value] · storeName`. */
export function listCriteriaText(c: ClusterCriteria): string {
  const value = c.layerValue && c.layerValue !== "all" ? `: ${c.layerValue}` : "";
  return `${c.layerLabel}${value} · ${c.storeName}`;
}

/** Detail-panel criteria text: `layerLabel[ : value]  ·  storeName` (wider spacing). */
export function detailCriteriaText(c: ClusterCriteria): string {
  const value = c.layerValue && c.layerValue !== "all" ? ` : ${c.layerValue}` : "";
  return `${c.layerLabel}${value}  ·  ${c.storeName}`;
}

/* ── per-row presentation helpers (data-driven, inline styled) ── */

export function farmerInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** Avatar colour cycles by the farmer's index in the global enriched list. */
export function avatarBg(globalIndex: number): string {
  return avatarColor(globalIndex);
}

export function segBg(segment: string): string {
  return SEGMENT_BGS[segment as SegmentLabel] ?? "#F5F5F5";
}

export function segColor(segment: string): string {
  return SEGMENT_COLORS[segment as SegmentLabel] ?? "#757575";
}
