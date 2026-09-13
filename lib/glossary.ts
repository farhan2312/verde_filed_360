import { segDef, segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS } from "./campaign-segments";

/** Resolve a segment display label ("Potential HNI", "At Risk") back to its key so tooltips work on labels too. */
const LABEL_TO_KEY: Record<string, string> = {};
for (const k of [...VALUE_SEGMENTS, ...LIFECYCLE_SEGMENTS]) LABEL_TO_KEY[segMeta(k).label.toUpperCase()] = k;

/**
 * One-line, plain-language definitions for the portal's acronyms & attributes — surfaced as hover
 * tooltips via <InfoTip> / <InfoHint>. Segment/lifecycle terms fall back to segDef() so their wording
 * lives in one place; everything else is defined here.
 */
export const GLOSSARY: Record<string, string> = {
  LTV: "Lifetime Value — the farmer's total base (pre-tax) spend, all-time.",
  BASE: "Base / pre-tax price. Every calculation in the portal uses this figure.",
  GST: "GST-inclusive final price — shown on the farmer detail page only; never used in any calculation.",
  "VALUE SEGMENT": "Value tier by lifetime spend: HNI (≥ ₹12k), Potential HNI (₹8k–12k), or Regular (< ₹8k).",
  SEGMENT: "Value tier by lifetime spend: HNI (≥ ₹12k), Potential HNI (₹8k–12k), or Regular (< ₹8k).",
  LIFECYCLE: "How recently the farmer bought: New, Recent, At Risk, or Lapsed.",
  "SPEND TIER": "A bracket of all-time base spend — its ends line up with the ₹8k / ₹12k segment thresholds.",
  SPEND: "All-time base (pre-tax) spend.",
  DISTRICT: "A store region — 15 districts (e.g. Lucknow, Ayodhya). A Regional Manager covers one district.",
  CLUSTER: "A saved group of farmers matching chosen criteria — the audience for a campaign.",
  MTD: "Month-to-date.",
  P12M: "The past 12 months.",
};

/** Definition for a term/key (segment key like "HNI"/"NEW", or a glossary key like "LTV"). "" if unknown. */
export function glossaryDef(term: string): string {
  const key = (term ?? "").trim();
  if (!key) return "";
  const U = key.toUpperCase();
  const seg = segDef(U) || segDef(LABEL_TO_KEY[U] ?? ""); // by segment key OR by display label
  if (seg) return seg;
  return GLOSSARY[U] ?? "";
}
