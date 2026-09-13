/**
 * Normalizers for the inventory master's "Target Crops" and "Target Pests / Diseases / Weeds"
 * columns. Shared by the one-off master import (scripts/) and the runtime sales importer
 * (lib/sales-import.ts), so a sold item code always resolves to the same canonical tags.
 *
 * The master's labels are already clean (title-case English), so — unlike the messy
 * seed-name cleaner in scripts/crop-lib.ts — this only splits on ";", drops non-crop
 * placeholders, and canonicalises to the same lowercase keys the existing crop filters use
 * (paddy/wheat/maize/…). Pests are lowercased with parentheticals stripped.
 */

/** Crop tokens that carry no targeting value — dropped from Target Crops. */
const CROP_DROP = new Set([
  "all crops", "all crops (as registered)", "refer product label", "non-crop",
  "non-crop area", "field rodents", "stored grain", "n/a", "na", "-", "",
]);

/** Map a master crop label → the canonical key the app's crop filters already use. */
const CROP_ALIAS: Record<string, string> = {
  "rice": "paddy", "rice/paddy": "paddy", "paddy": "paddy",
  "vegetables": "vegetable", "vegetable": "vegetable",
  "pigeon pea": "arhar", "red gram": "arhar",
  "green gram": "moong", "black gram": "urad",
  "grapes": "grapes", "citrus": "citrus", "cole crops": "cole",
};

/** Split → drop placeholders → canonicalise. Returns de-duplicated lowercase crop keys. */
export function cleanTargetCrops(raw?: string | null): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const piece of String(raw).split(/;/)) {
    const t = piece.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || CROP_DROP.has(t)) continue;
    // "Rice/Paddy" is one crop concept, not two — alias the whole token first.
    const key = CROP_ALIAS[t] ?? (CROP_ALIAS[t.replace(/\s*\/\s*/g, "/")] ?? t.split("/")[0].trim());
    const canon = CROP_ALIAS[key] ?? key;
    if (canon && !CROP_DROP.has(canon)) out.add(canon);
  }
  return [...out].sort();
}

/** Pest labels that are pure placeholders, not a real target — dropped. */
const PEST_DROP = new Set([
  "refer product label", "see product label", "promotion", "n/a", "na", "-", "",
  "insect pest control", "weed control", "as per label", "growth regulation",
]);

/** Split → strip parentheticals → lowercase. Returns de-duplicated pest keys. */
export function cleanTargetPests(raw?: string | null): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const piece of String(raw).split(/;/)) {
    // Strip "(see product label)" / "(non-selective)" style notes, collapse whitespace.
    const t = piece.replace(/\([^)]*\)/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || PEST_DROP.has(t)) continue;
    out.add(t);
  }
  return [...out].sort();
}

/** Pretty label for a pest/crop tag key (title-case). */
export function tagLabel(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
