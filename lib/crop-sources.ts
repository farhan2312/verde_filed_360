/**
 * Crop sources for cluster rules — client-safe (no Prisma), so the cluster builder can import it.
 * A farmer's crop can come from what they bought (sales), what an officer recorded on a visit, or the
 * crops set on their store in Settings (store region).
 */
import type { ClusterCriteria } from "@/lib/cluster-rules";

export type CropMatchSource = "sales" | "visit" | "store";
export const CROP_MATCH_SOURCES: CropMatchSource[] = ["sales", "visit", "store"];
export const CROP_MATCH_LABEL: Record<CropMatchSource, string> = { sales: "Bought", visit: "Seen on visit", store: "Store region" };
/** Chip colours per source, used everywhere crops are shown: sales brand green, visit blue, store gold. */
export const CROP_SOURCE_TINT: Record<CropMatchSource, { bg: string; color: string; ring: string }> = {
  sales: { bg: "#F5F9EA", color: "#7DA02E", ring: "#7DA02E" },
  visit: { bg: "#E3F2FD", color: "#1565C0", ring: "#1565C0" },
  store: { bg: "#FEF6E9", color: "#8D6E00", ring: "#EDA942" },
};

/** Every crop a rule refers to, whichever field holds it (old single-source fields or the new crops list). */
export function criteriaCrops(c: ClusterCriteria | null | undefined): string[] {
  if (!c) return [];
  return [...new Set([...(c.crops ?? []), ...(c.cropTags ?? []), ...(c.salesCrops ?? []), ...(c.visitCrops ?? []), ...(c.crop ? [c.crop] : [])])];
}

/** Sources of the rule's `crops` list — none saved means all three. */
export function cropSourcesOf(c: Pick<ClusterCriteria, "cropSources">): CropMatchSource[] {
  const s = (c.cropSources ?? []).filter((x) => CROP_MATCH_SOURCES.includes(x));
  return s.length ? s : CROP_MATCH_SOURCES;
}
