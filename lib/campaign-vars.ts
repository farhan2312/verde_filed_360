/**
 * Shared personalization variables for campaign messaging. One token set fills both:
 *   • SMS  — named [slots] in the comm-plan text (e.g. [name], [Store]).
 *   • WhatsApp — positional {{1}},{{2}}… mapped in the comm plan's `waVariables` order.
 * All tokens resolve off the Farmer row (+ campaign end date) so a bulk broadcast needs no per-farmer
 * extra queries.
 */
import { cropLabel } from "@/lib/crops";
import { shortStoreName } from "@/lib/store-utils";

/** Tokens an admin can map into a WhatsApp template's variables (order = {{1}},{{2}}…). */
export const WA_VAR_TOKENS: { key: string; label: string; slot: string }[] = [
  { key: "name", label: "Farmer first name", slot: "[name]" },
  { key: "fullname", label: "Farmer full name", slot: "[fullname]" },
  { key: "crop", label: "Main crop", slot: "[crop]" },
  { key: "store", label: "Store name", slot: "[Store]" },
  { key: "village", label: "Village", slot: "[village]" },
  { key: "gap", label: "₹ to reach HNI", slot: "[gap]" },
  { key: "mobile", label: "Mobile number", slot: "[number]" },
  { key: "date", label: "Campaign end date", slot: "[date]" },
  { key: "coupon", label: "Offer / coupon code", slot: "[coupon]" },
];
export const VAR_LABEL: Record<string, string> = Object.fromEntries(WA_VAR_TOKENS.map((t) => [t.key, t.label]));

/** Sample value per token — for live previews and the example values Meta needs to approve a template. */
export const SAMPLE_VARS: Record<string, string> = {
  name: "Ramesh", fullname: "Ramesh Kumar", crop: "Potato", store: "Ram Nagar",
  village: "Rampur", gap: "2,500", mobile: "98xxxxxxxx", date: "15 Sep", coupon: "POT300",
};

export interface FarmerVarSource {
  name: string | null;
  mobile: string | null;
  village: string | null;
  hniGap: number | null;
  cropTags: string[];
  crop: string | null;
  storeName: string | null;
}

/** token → resolved string for one farmer. `extra.coupon` fills the phase's [coupon] offer code. */
export function resolveVars(f: FarmerVarSource, endDate?: Date | null, extra?: { coupon?: string }): Record<string, string> {
  const first = (f.name ?? "").trim().split(/\s+/)[0] || "";
  const crop = f.cropTags?.[0] ? cropLabel(f.cropTags[0]) : (f.crop ?? "");
  return {
    name: first,
    fullname: (f.name ?? "").trim(),
    crop,
    store: f.storeName ? shortStoreName(f.storeName) : "",
    village: (f.village ?? "").trim(),
    gap: f.hniGap != null && f.hniGap > 0 ? Math.round(f.hniGap).toLocaleString("en-IN") : "",
    mobile: (f.mobile ?? "").trim(),
    date: endDate ? new Date(endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "",
    coupon: (extra?.coupon ?? "").trim(),
  };
}

/** Fill an SMS-style template with named [slots]. */
export function fillNamedTemplate(template: string, vars: Record<string, string>): string {
  let t = template;
  for (const { slot, key } of WA_VAR_TOKENS) {
    t = t.replace(new RegExp(slot.replace(/[[\]]/g, "\\$&"), "gi"), vars[key] ?? "");
  }
  // Aliases: "[Store name]" for [Store], and legacy "[Naam]" for the English [name] slot.
  t = t.replace(/\[Store name\]/gi, vars.store ?? "");
  t = t.replace(/\[Naam\]/gi, vars.name ?? "");
  return t;
}

/** Positional params for a WhatsApp template body, in the comm plan's waVariables order. */
export function positionalParams(waVariables: string[] | null | undefined, vars: Record<string, string>): string[] {
  return (waVariables ?? []).map((tok) => vars[tok] ?? "");
}

/** Render a WhatsApp template body: replace {{1}},{{2}}… with the mapped farmer values (for previews/logs). */
export function fillWaTemplate(body: string, waVariables: string[] | null | undefined, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, d) => {
    const tok = (waVariables ?? [])[Number(d) - 1];
    return tok ? (vars[tok] ?? "") : "";
  });
}

/** DLT variable placeholder (the TRAI standard): `{#var#}`. */
export const DLT_VAR = /\{#var#\}/gi;
/** How many `{#var#}` positions a DLT template body has. */
export function countDltVars(body: string): number {
  return (body.match(DLT_VAR) ?? []).length;
}
/**
 * Fill a DLT template body by replacing each `{#var#}` (in order) with the farmer value for the mapped
 * token in `smsVariables`. An unmapped / missing position becomes empty. Non-`{#var#}` text is preserved
 * exactly — so the sent message still matches the DLT-approved template.
 */
export function fillDltTemplate(body: string, smsVariables: string[] | null | undefined, vars: Record<string, string>): string {
  let i = 0;
  return body.replace(DLT_VAR, () => {
    const tok = (smsVariables ?? [])[i++];
    return tok ? (vars[tok] ?? "") : "";
  });
}

/**
 * Fill an SMS comm plan for one farmer. New model: DLT body with `{#var#}` positions mapped via
 * `smsVariables`. Legacy (grandfathered) plans have no smsVariables and use named [slots].
 */
export function fillSmsTemplate(tpl: { template: string; smsVariables?: string[] | null }, vars: Record<string, string>): string {
  if (tpl.smsVariables && tpl.smsVariables.length) return fillDltTemplate(tpl.template, tpl.smsVariables, vars);
  if (/\{#var#\}/i.test(tpl.template)) return fillDltTemplate(tpl.template, tpl.smsVariables, vars); // DLT body, no mapping yet
  return fillNamedTemplate(tpl.template, vars); // legacy [slot] text
}
