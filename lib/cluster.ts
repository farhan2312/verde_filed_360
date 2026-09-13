/** Types + constants for the Cluster Builder (kept out of the "use server" file). */

export const PAGE_SIZE = 25;
export const MAX_CLUSTER = 25_000;

export interface FarmerFilters {
  villages?: string[]; // multi-select villages
  crop?: string; // canonical crop tag (sales ∪ visit crops)
  pest?: string; // Target Pest/Disease/Weed tag (item-code derived)
  campaignSegment?: string; // HNI | POTENTIAL_HNI | REGULAR | AT_RISK | NEW | LAPSED
  spendTier?: number; // index into SPEND_TIERS (P12M spend)
  category?: string; // product category from sales
  q?: string;
}

export interface VillageFacet {
  village: string;
  count: number;
}

export interface CropFacet {
  crop: string; // canonical tag
  count: number;
}

export interface PestFacet {
  pest: string; // pest tag
  count: number;
}

export interface StoreFarmerRow {
  id: number;
  name: string;
  mobile: string | null;
  village: string | null;
  crops: string[]; // canonical crop tags (sales ∪ visit)
  segment: string | null; // campaignSegment key (HNI | AT_RISK | …)
  ltv: number;
  bills: number;
}

export interface StoreFarmersResult {
  rows: StoreFarmerRow[];
  total: number;
  page: number;
  pageSize: number;
  villages: VillageFacet[]; // per-store, with farmer counts, biggest first
  crops: CropFacet[]; // per-store crop tags, most common first
  pests: PestFacet[]; // per-store pest tags, most common first
  categories: string[]; // per-store (products purchased)
}

export interface CreateClusterInput {
  name: string;
  storeIds: number[];
  storeName: string;
  filters: FarmerFilters;
  /** Explicitly checked farmer ids (when not selecting all matching). */
  explicitIds?: number[];
  /** Select every farmer matching the current filters instead of just `explicitIds`. */
  allMatching?: boolean;
}

export interface CreateClusterResult {
  ok: boolean;
  count?: number;
  id?: number; // the created cluster — used by the "Next: create a project →" chain
  error?: string;
}
