/** A multi-select segment chip (one Value tier or one Lifecycle stage). */
export interface SegChipVM {
  label: string;
  /** The segment key (HNI | POTENTIAL_HNI | REGULAR, or NEW | RECENT | AT_RISK | LAPSED). */
  value: string;
  /** Chip colour (from segMeta). */
  color: string;
  /** One-line hover definition (thresholds). */
  title: string;
  active: boolean;
}

/** Dropdown-filter option lists for the farmers page. */
export interface FarmerFacetsVM {
  stores: { id: number; name: string }[];
  /** Distinct store zones (regions). */
  zones: string[];
  /** Canonical crop tags with farmer counts, most common first. */
  crops: { crop: string; count: number }[];
  /** Target pest/disease/weed tags with farmer counts, most common first. */
  pests: { pest: string; count: number }[];
  /** Spend-tier labels; the URL value is the tier's index. */
  spendTiers: string[];
}

/** Currently-selected dropdown filters (URL param values, null = All). */
export interface FarmerSelectedVM {
  store: string | null;
  zone: string | null;
  crop: string | null;
  pest: string | null;
  spend: string | null;
  /** Selected value-segment keys (multi-select). */
  values: string[];
  /** Selected lifecycle keys (multi-select). */
  lifecycles: string[];
  /** WhatsApp opted-in only. */
  wa: boolean;
}

/** A single farmer table row view-model (plain, serialisable). */
export interface FarmerRowVM {
  id: number;
  name: string;
  mobile: string;
  village: string;
  /** Canonical crop tags (sales ∪ visit), first few. */
  crops: string[];
  /** Value-tier display label (HNI, Potential HNI, Regular), or null. */
  segment: string | null;
  segBg: string;
  segColor: string;
  /** Lifecycle display label (New, Recent, At Risk, Lapsed), or null. */
  lifecycle: string | null;
  lifeBg: string;
  lifeColor: string;
  /** Formatted lifetime value, e.g. "₹26,200" or "—". */
  ltv: string;
  /** Formatted last visit date, e.g. "Jun 18" or "—". */
  lastVisit: string;
  storeName: string;
  storeColor: string;
  /** Lead/visit status display label, or null. */
  status: string | null;
  statusBg: string;
  statusColor: string;
  avBg: string;
  init: string;
}
