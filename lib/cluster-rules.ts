/**
 * Dynamic cluster rules — one criteria model + resolver for all cluster sources
 * (map filters, HNI/segment matrix, analytics drill). Membership is the LIVE result
 * of running the rule; campaigns snapshot it at launch.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SEGMENT_LABEL_TO_ENUM, LEAD_LABEL_TO_ENUM } from "@/lib/segments";
import { segMeta } from "@/lib/campaign-segments";
import { cropLabel } from "@/lib/crops";
import { inr } from "@/lib/format";

/** The rule that defines a cluster. Every field is an AND-ed condition. */
export interface ClusterCriteria {
  storeIds?: number[];
  villages?: string[];
  crop?: string; // farmer.crop (enrichment)
  cropTags?: string[]; // any crop (sales ∪ visit) — match ANY
  pestTags?: string[]; // any Target Pest/Disease/Weed (item-code derived) — match ANY
  salesCrops?: string[]; // crops from the sales upload — match ANY
  visitCrops?: string[]; // crops from field visits — match ANY
  visitProblem?: string; // farmer has a visit recording this problem
  segment?: string; // legacy display label (High Value…)
  campaignSegment?: string; // legacy single collapsed: HNI | AT_RISK | …
  campaignSegments?: string[]; // legacy multiple — match ANY
  valueSegments?: string[]; // value tier(s): HNI | POTENTIAL_HNI | REGULAR — match ANY
  lifecycleSegments?: string[]; // lifecycle stage(s): NEW | AT_RISK | LAPSED — match ANY
  leadStatus?: string; // display label
  category?: string; // product category purchased
  spendMin?: number; // p12mSpend >= (₹)
  spendMax?: number; // p12mSpend <  (₹)
  zone?: string; // single region (legacy)
  zones?: string[]; // multiple regions — match ANY
  district?: string;
  q?: string; // free-text (name/mobile/village/code)
  whatsappOptIn?: boolean; // only farmers who opted in to WhatsApp (true = filter; false/undefined = ignore)
  explicitIds?: number[]; // hand-picked (static clusters)
}

const kFmt = (n: number) => (n >= 1000 ? `₹${n / 1000}K` : `₹${n}`);

/** Turn a criteria rule into a Prisma Farmer `where`. */
export function criteriaToWhere(c: ClusterCriteria): Prisma.FarmerWhereInput {
  const and: Prisma.FarmerWhereInput[] = [];
  if (c.storeIds?.length) and.push({ storeId: { in: c.storeIds } });
  if (c.villages?.length) and.push({ village: { in: c.villages } });
  if (c.crop) and.push({ crop: c.crop });
  if (c.cropTags?.length) and.push({ cropTags: { hasSome: c.cropTags } });
  if (c.pestTags?.length) and.push({ pestTags: { hasSome: c.pestTags } });
  if (c.salesCrops?.length) and.push({ salesCropTags: { hasSome: c.salesCrops } });
  if (c.visitCrops?.length) and.push({ visitCropTags: { hasSome: c.visitCrops } });
  if (c.visitProblem) and.push({ visits: { some: { currentProblem: { has: c.visitProblem } } } });
  if (c.valueSegments?.length) and.push({ valueSegment: { in: c.valueSegments } });
  if (c.lifecycleSegments?.length) and.push({ lifecycleSegment: { in: c.lifecycleSegments } });
  if (c.campaignSegments?.length) and.push({ campaignSegment: { in: c.campaignSegments } });
  else if (c.campaignSegment) and.push({ campaignSegment: c.campaignSegment });
  // Segment / lead labels FAIL CLOSED: an unknown label matches nothing rather than
  // silently dropping the constraint (which would make the rule over-broad).
  if (c.segment) {
    const e = SEGMENT_LABEL_TO_ENUM[c.segment as never];
    and.push(e ? { segment: e as never } : { id: { in: [] } });
  }
  if (c.leadStatus) {
    const e = LEAD_LABEL_TO_ENUM[c.leadStatus as never];
    and.push(e ? { leadStatus: e as never } : { id: { in: [] } });
  }
  if (c.zones?.length) and.push({ zone: { in: c.zones } });
  else if (c.zone) and.push({ zone: c.zone });
  if (c.district) and.push({ district: c.district });
  if (c.whatsappOptIn) and.push({ whatsappOptIn: true }); // opted-in only (true = filter; false/undefined ignored)
  if (c.category) and.push({ sales: { some: { category: c.category } } });
  if (c.spendMin != null || c.spendMax != null)
    and.push({ p12mSpend: { ...(c.spendMin != null ? { gte: c.spendMin } : {}), ...(c.spendMax != null ? { lt: c.spendMax } : {}) } });
  if (c.explicitIds?.length) and.push({ id: { in: c.explicitIds } });
  if (c.q?.trim()) {
    const q = c.q.trim();
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { mobile: { contains: q } },
        { village: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

/** True when the rule applies at least one condition (guards "matches everyone" rules). */
export function hasConditions(c: ClusterCriteria): boolean {
  return Array.isArray(criteriaToWhere(c).AND);
}

/**
 * REAL-scoped where used for ALL live resolution — dynamic clusters never pull in
 * demo/test farmers, and the source predicate is added on top of the rule's own
 * conditions (so `hasConditions` still reflects only the user's filters).
 */
export function scopedCriteriaWhere(c: ClusterCriteria): Prisma.FarmerWhereInput {
  return { source: "REAL", ...criteriaToWhere(c) };
}

/** Human-readable summary of the rule (becomes the cluster description). */
export function describeCriteria(c: ClusterCriteria, storeNames?: Map<number, string>): string {
  const parts: string[] = [];
  if (c.storeIds?.length)
    parts.push(c.storeIds.length === 1 ? storeNames?.get(c.storeIds[0]) ?? `Store #${c.storeIds[0]}` : `${c.storeIds.length} stores`);
  if (c.zones?.length) parts.push(c.zones.length === 1 ? c.zones[0] : `${c.zones.length} regions`);
  else if (c.zone) parts.push(c.zone);
  if (c.district) parts.push(c.district);
  if (c.valueSegments?.length) parts.push(c.valueSegments.map((s) => segMeta(s).label).join(" / "));
  if (c.lifecycleSegments?.length) parts.push(c.lifecycleSegments.map((s) => segMeta(s).label).join(" / "));
  if (c.campaignSegments?.length) parts.push(c.campaignSegments.map((s) => segMeta(s).label).join(" / "));
  else if (c.campaignSegment) parts.push(segMeta(c.campaignSegment).label);
  if (c.segment) parts.push(c.segment);
  if (c.crop) parts.push(`Crop: ${c.crop}`);
  if (c.cropTags?.length) parts.push(c.cropTags.map(cropLabel).join(" + "));
  if (c.pestTags?.length) parts.push(`Pest: ${c.pestTags.join(" / ")}`);
  if (c.salesCrops?.length) parts.push(`Sales crop: ${c.salesCrops.map(cropLabel).join(" / ")}`);
  if (c.visitCrops?.length) parts.push(`Visit crop: ${c.visitCrops.map(cropLabel).join(" / ")}`);
  if (c.visitProblem) parts.push(`Problem: ${c.visitProblem}`);
  if (c.leadStatus) parts.push(`Lead: ${c.leadStatus}`);
  if (c.category) parts.push(`Buys: ${c.category}`);
  if (c.spendMin != null && c.spendMax != null) parts.push(`Spend ${kFmt(c.spendMin)}–${kFmt(c.spendMax)}`);
  else if (c.spendMin != null) parts.push(`Spend ${kFmt(c.spendMin)}+`);
  else if (c.spendMax != null) parts.push(`Spend < ${kFmt(c.spendMax)}`);
  if (c.villages?.length) parts.push(`${c.villages.length} village${c.villages.length > 1 ? "s" : ""}`);
  if (c.whatsappOptIn) parts.push("WhatsApp opted-in");
  if (c.q?.trim()) parts.push(`"${c.q.trim()}"`);
  if (c.explicitIds?.length) parts.push(`${c.explicitIds.length} hand-picked`);
  return parts.length ? parts.join(" · ") : "All farmers";
}

/** Parse the stored criteria JSON, tolerating the legacy map-builder shape ({storeIds, filters}). */
export function parseCriteria(json: string | null | undefined): ClusterCriteria | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (o.layer || o.layerValue) return null; // OG demo-layer shape — not resolvable; use snapshot
    if (o.filters && typeof o.filters === "object")
      return { storeIds: o.storeIds as number[] | undefined, ...(o.filters as ClusterCriteria) };
    return o as ClusterCriteria;
  } catch {
    return null;
  }
}

export interface ClusterFarmerRow {
  id: number;
  name: string;
  mobile: string | null;
  village: string | null;
  segment: string | null;
  spend: string;
  gap: string | null;
  lastItem: string | null;
}

/** Live count of a rule's membership (REAL farmers only). */
export function resolveClusterCount(c: ClusterCriteria): Promise<number> {
  return prisma.farmer.count({ where: scopedCriteriaWhere(c) });
}

/** Live, paginated membership of a rule. */
export async function resolveClusterFarmers(
  c: ClusterCriteria,
  page = 1,
  pageSize = 25,
): Promise<{ rows: ClusterFarmerRow[]; total: number }> {
  const where = scopedCriteriaWhere(c);
  const [total, farmers] = await Promise.all([
    prisma.farmer.count({ where }),
    prisma.farmer.findMany({
      where,
      orderBy: { p12mSpend: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, mobile: true, village: true,
        campaignSegment: true, p12mSpend: true, hniGap: true,
        lastMaizeItem: true, lastPotatoItem: true,
      },
    }),
  ]);
  return {
    total,
    rows: farmers.map((f) => ({
      id: f.id,
      name: f.name,
      mobile: f.mobile,
      village: f.village,
      segment: f.campaignSegment,
      spend: f.p12mSpend != null ? inr(f.p12mSpend) : "—",
      gap: f.hniGap != null && f.hniGap > 0 ? inr(f.hniGap) : null,
      lastItem: f.lastMaizeItem ?? f.lastPotatoItem ?? null,
    })),
  };
}

/**
 * Resolve just the ids (for campaign enrolment snapshots). Capped for safety.
 * Deterministic order (id asc) so a truncated snapshot is stable across runs;
 * callers that must not silently truncate should pass a cap above the audience
 * and check `rows.length === cap` (see createCampaign's ENROLL_CAP guard).
 */
export async function resolveClusterIds(c: ClusterCriteria, cap = 50000): Promise<number[]> {
  const rows = await prisma.farmer.findMany({ where: scopedCriteriaWhere(c), select: { id: true }, orderBy: { id: "asc" }, take: cap });
  return rows.map((r) => r.id);
}
