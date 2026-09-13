/** CRM pilot — exclusive campaign segments + crop tags (shared client/server). */

export const CAMPAIGN_SEGMENTS = [
  "HNI", "POTENTIAL_HNI", "REGULAR", "AT_RISK", "NEW", "LAPSED",
] as const;
export type CampaignSegment = (typeof CAMPAIGN_SEGMENTS)[number];

export interface SegMeta {
  label: string;
  priority: number;
  color: string;
  bg: string;
  /** Default outreach medium from the sample communication plan. */
  medium: string;
}

export const SEGMENT_META: Record<string, SegMeta> = {
  HNI:           { label: "HNI",           priority: 1, color: "#678722", bg: "#F3F8E6", medium: "1:1 or Call" },
  POTENTIAL_HNI: { label: "Potential HNI", priority: 2, color: "#1565C0", bg: "#E3F2FD", medium: "1:1 or Call" },
  REGULAR:       { label: "Regular",       priority: 3, color: "#00897B", bg: "#E0F2F1", medium: "Whatsapp" },
  RECENT:        { label: "Recent",        priority: 4, color: "#0277BD", bg: "#E1F5FE", medium: "Whatsapp" },
  AT_RISK:       { label: "At Risk",       priority: 5, color: "#E65100", bg: "#FFF3E0", medium: "Whatsapp + Call" },
  NEW:           { label: "New",           priority: 6, color: "#7B1FA2", bg: "#F3E5F5", medium: "Whatsapp" },
  LAPSED:        { label: "Lapsed",        priority: 7, color: "#616161", bg: "#EEEEEE", medium: "Whatsapp + Call" },
  LEAD:          { label: "Lead",          priority: 9, color: "#00838F", bg: "#E0F7FA", medium: "Whatsapp" },
  NO_SPEND:      { label: "No Spend",      priority: 10, color: "#546E7A", bg: "#ECEFF1", medium: "Whatsapp" },
  OTHER:         { label: "Other",         priority: 8, color: "#9E9E9E", bg: "#F5F5F5", medium: "Whatsapp" },
};

export function segMeta(seg: string | null | undefined): SegMeta {
  return (seg && SEGMENT_META[seg]) || SEGMENT_META.OTHER;
}

/** Display order for the LEGACY combined matrix columns / filters (value tiers first, then lifecycle). */
export const SEGMENT_COLUMNS: string[] = ["HNI", "POTENTIAL_HNI", "REGULAR", "AT_RISK", "NEW", "LAPSED"];

/* ── The two independent dimensions the single segment was split into ── */
/**
 * Value tier — by lifetime spend. HNI ≥ ₹12k · Potential HNI ₹8k–<12k · Regular = the rest with a
 * purchase · No Spend = no purchase on record (a lead — so leads carry a value segment too, and don't
 * fall out of value-segment filters).
 */
export const VALUE_SEGMENTS = ["HNI", "POTENTIAL_HNI", "REGULAR", "NO_SPEND"] as const;
export type ValueSegment = (typeof VALUE_SEGMENTS)[number];
export const VALUE_HNI_MIN = 12000;
export const VALUE_POTENTIAL_MIN = 8000;

/**
 * Lifecycle — by the purchase windows a farmer falls in, relative to the reference date:
 *   Lead   — in the system but no purchase at all yet (never bought).
 *   New    — bought in the last 6 months AND has NO earlier purchases (first-timer).
 *   Recent — bought in the last 6 months AND also bought before that (active repeat).
 *   At Risk— last purchase 6–12 months ago (nothing in the last 6 months).
 *   Lapsed — last purchase 12+ months ago.
 */
export const LIFECYCLE_SEGMENTS = ["LEAD", "NEW", "RECENT", "AT_RISK", "LAPSED"] as const;
export type LifecycleSegment = (typeof LIFECYCLE_SEGMENTS)[number];
export const LIFECYCLE_RECENT_MONTHS = 6;      // < 6 months since last purchase → New or Recent
export const LIFECYCLE_LAPSED_MIN_MONTHS = 12; // ≥ 12 months (or never) → Lapsed; 6–12 → At Risk

/** Human title for the lifecycle dimension (user-chosen). */
export const LIFECYCLE_TITLE = "Lifecycle";
export const VALUE_TITLE = "Value segment";

/** Meta (label/color/bg) for a value or lifecycle key — reuses SEGMENT_META. */
export const valueMeta = (k: string) => segMeta(k);
export const lifecycleMeta = (k: string) => segMeta(k);

/** One-line definition of what a value/lifecycle segment means — used as hover tooltips across the app. */
export function segDef(k: string): string {
  const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
  switch (k) {
    case "HNI": return `Value tier — spends ${inr(VALUE_HNI_MIN)}+ in the period`;
    case "POTENTIAL_HNI": return `Value tier — spends ${inr(VALUE_POTENTIAL_MIN)}–${inr(VALUE_HNI_MIN)} in the period`;
    case "REGULAR": return `Value tier — spends under ${inr(VALUE_POTENTIAL_MIN)} in the period`;
    case "NO_SPEND": return `Value tier — no purchase on record yet (a lead / no spend)`;
    case "LEAD": return `Lifecycle — registered in the system but no purchase yet (a lead)`;
    case "NEW": return `Lifecycle — first & only purchases within the last ${LIFECYCLE_RECENT_MONTHS} months (new customer)`;
    case "RECENT": return `Lifecycle — bought in the last ${LIFECYCLE_RECENT_MONTHS} months and earlier too (active)`;
    case "AT_RISK": return `Lifecycle — last purchase ${LIFECYCLE_RECENT_MONTHS}–${LIFECYCLE_LAPSED_MIN_MONTHS} months ago`;
    case "LAPSED": return `Lifecycle — last purchase ${LIFECYCLE_LAPSED_MIN_MONTHS}+ months ago`;
    default: return "";
  }
}

/** Compute the value tier from P12M spend. */
export function valueSegmentOf(spend: number | null | undefined): ValueSegment {
  const s = spend ?? 0;
  return s >= VALUE_HNI_MIN ? "HNI" : s >= VALUE_POTENTIAL_MIN ? "POTENTIAL_HNI" : "REGULAR";
}
/**
 * Compute the lifecycle stage from whole months since the last AND first purchase (null/never ⇒ Lapsed).
 *   < 6 months since last → New if the first purchase is also < 6 months ago (no prior history), else Recent.
 *   6–12 months since last → At Risk · 12+ (or never) → Lapsed.
 */
export function lifecycleSegmentOf(
  monthsSinceLast: number | null | undefined,
  monthsSinceFirst?: number | null | undefined,
): LifecycleSegment {
  if (monthsSinceLast == null) return "LEAD"; // never purchased → a lead, not lapsed
  if (monthsSinceLast < LIFECYCLE_RECENT_MONTHS) {
    return monthsSinceFirst != null && monthsSinceFirst < LIFECYCLE_RECENT_MONTHS ? "NEW" : "RECENT";
  }
  if (monthsSinceLast < LIFECYCLE_LAPSED_MIN_MONTHS) return "AT_RISK";
  return "LAPSED";
}

export const CROP_GROUPS = [
  { key: "maize", label: "Maize" },
  { key: "potato", label: "Potato" },
  { key: "both", label: "Maize + Potato" },
] as const;
export type CropGroupKey = (typeof CROP_GROUPS)[number]["key"];

export const CROP_LABEL: Record<string, string> = { maize: "Maize", potato: "Potato" };

/** The 6 default communication-plan rows (seeded into CommTemplate; editable in-app). */
export const DEFAULT_COMM_TEMPLATES: {
  segment: CampaignSegment; priority: number; medium: string; offer: string; timingLabel: string; template: string;
}[] = [
  {
    segment: "HNI", priority: 1, medium: "1:1 or Call",
    offer: "Advance booking + 5% discount", timingLabel: "Jul 20 – Aug 6",
    template:
      "[name]ji, aapke pichle season ke Maize crop ke liye — is baar Dekalb DKC 9108 ka naya lot aaya hai. Advance booking pe 3% discount available hai. Kya main aapke liye 10 bag reserve kar doon?",
  },
  {
    segment: "POTENTIAL_HNI", priority: 2, medium: "1:1 or Call",
    offer: "Advance booking + special 5% discount if they reach \"gold\" tier", timingLabel: "Jul 20 – Aug 6",
    template:
      "[name]ji, aap hamare top customers mein se ek hain. Is maize season mein sirf ₹[gap] aur khareedein aur hamare Gold Tier mein aa jaayein — phir har purchase par 5% extra discount milega hamesha.",
  },
  {
    segment: "REGULAR", priority: 3, medium: "Whatsapp",
    offer: "Bundle offer", timingLabel: "Week of Aug 1",
    template:
      "[name]ji, maize season shuru ho raha hai. Pichli baar aapne [last item] liya tha. Is baar seed ke saath NPK 16-16-16 bhi ready rakhein — turant delivery available hai. [Store name] pe aayein ya call karein.",
  },
  {
    segment: "AT_RISK", priority: 4, medium: "Whatsapp + Call",
    offer: "5% re-engagement discount", timingLabel: "Week of Aug 1 (Whatsapp) · Week of Aug 7 (call)",
    template:
      "[name]ji, kaafi time ho gaya! Maize ki buwai shuru hone wali hai — stock limited hai. Aapke liye ek special offer: pehli visit pe 5% off on Maize seeds. Aaj hi aayein ya call karein: [number].",
  },
  {
    segment: "NEW", priority: 5, medium: "Whatsapp",
    offer: "Starter Maize bundle + 5% discount if buying within 6 months of 1st purchase", timingLabel: "Week of Aug 1",
    template:
      "[name]ji, Verde Agrotech mein swagat hai! Maize ki successful buwai ke liye 3 cheezein zaroori hain: achha seed + basal fertilizer + stem borer protection. Hamare paas complete package hai — aur special discount agar aap [date] tak khareedein.",
  },
  {
    segment: "LAPSED", priority: 6, medium: "Whatsapp + Call",
    offer: "5% discount + consultation offer", timingLabel: "Week of Aug 1 (Whatsapp) · Week of Aug 7 (call)",
    template:
      "[name]ji, mujhe pata chala aapne pichle 12 mahine se humse nahi kharida. Kya koi problem thi? Is season ke liye — Maize Dekalb 9108 fresh stock aaya hai, 5% discount aur consultation ke saath. Ek baar zaroor milein.",
  },
];

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Fill a Hindi template's slots for one farmer. */
export function fillTemplate(
  template: string,
  f: { name?: string | null; hniGap?: number | null; lastItem?: string | null; store?: string | null; phone?: string | null; deadline?: string | null },
): string {
  const first = (f.name ?? "").trim().split(/\s+/)[0] || "Kisan";
  return template
    .replace(/\[(?:name|Naam)\]/gi, first)
    .replace(/\[gap\]/g, f.hniGap != null ? inr(f.hniGap).replace("₹", "") : "—")
    .replace(/\[last item\]/gi, f.lastItem ?? "apne product")
    .replace(/\[Store name\]/gi, f.store ?? "hamare store")
    .replace(/\[number\]/gi, f.phone ?? "")
    .replace(/\[date\]/gi, f.deadline ?? "");
}
