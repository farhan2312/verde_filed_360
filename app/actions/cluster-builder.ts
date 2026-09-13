"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { canManage, getActor } from "@/lib/scope";
import { SPEND_TIERS } from "@/lib/spend-tiers";
import {
  PAGE_SIZE,
  MAX_CLUSTER,
  type FarmerFilters,
  type StoreFarmersResult,
  type CreateClusterInput,
  type CreateClusterResult,
} from "@/lib/cluster";
import { shortStoreName } from "@/lib/store-utils";
import {
  describeCriteria,
  hasConditions,
  resolveClusterCount,
  resolveClusterIds,
  type ClusterCriteria,
} from "@/lib/cluster-rules";

/** Only the central team / sysadmin may CREATE clusters; RMs get a read-only, region-scoped view. */
async function requireClusterAuthor(): Promise<{ ok: true } | { ok: false; error: string }> {
  return canManage(await getRole()) ? { ok: true } : { ok: false, error: "Only the central team can create clusters." };
}

/** Build the Prisma `where` for the selected stores' farmers from the active filters. */
function buildWhere(storeIds: number[], f: FarmerFilters): Prisma.FarmerWhereInput {
  const where: Prisma.FarmerWhereInput =
    storeIds.length === 1 ? { storeId: storeIds[0] } : { storeId: { in: storeIds } };
  if (f.villages?.length) where.village = { in: f.villages };
  if (f.crop) where.cropTags = { has: f.crop }; // canonical crop tag (sales ∪ visit)
  if (f.pest) where.pestTags = { has: f.pest }; // Target Pest/Disease/Weed (item-code derived)
  if (f.campaignSegment) where.campaignSegment = f.campaignSegment;
  if (f.spendTier != null && SPEND_TIERS[f.spendTier]) {
    const t = SPEND_TIERS[f.spendTier];
    // All-time base-price spend (LTV), same brackets as Farmer 360 / analytics.
    if (t.max === 0 && t.min == null) where.lifetimeSpend = null; // "No spend"
    else where.lifetimeSpend = { ...(t.min != null ? { gte: t.min } : {}), ...(t.max != null ? { lt: t.max } : {}) };
  }
  if (f.category) where.sales = { some: { category: f.category } };
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
      { village: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function getStoreFarmers(
  storeIds: number[],
  filters: FarmerFilters,
  page = 1,
): Promise<StoreFarmersResult> {
  if (!storeIds.length) {
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE, villages: [], crops: [], pests: [], categories: [] };
  }
  try {
    const where = buildWhere(storeIds, filters);
    const storeScope: Prisma.FarmerWhereInput =
      storeIds.length === 1 ? { storeId: storeIds[0] } : { storeId: { in: storeIds } };
    const [total, rows, villageGroups, cropRows, pestRows, categoryRows] = await Promise.all([
      prisma.farmer.count({ where }),
      prisma.farmer.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { id: true, name: true, mobile: true, village: true, cropTags: true, campaignSegment: true },
      }),
      // Villages served by THIS store's farmers, biggest first (the "nearby" quick-pick).
      prisma.farmer.groupBy({
        by: ["village"],
        where: { ...storeScope, village: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { village: "desc" } },
        take: 250,
      }),
      // Crop tags grown by this store's farmers (sales ∪ visit), most common first.
      prisma.$queryRaw<{ crop: string; n: number }[]>(Prisma.sql`
        SELECT unnest("cropTags") crop, COUNT(*)::int n FROM "Farmer"
        WHERE "storeId" IN (${Prisma.join(storeIds)}) GROUP BY 1 ORDER BY 2 DESC LIMIT 40`),
      // Target pests mapped from this store's farmers' purchased item codes, most common first.
      prisma.$queryRaw<{ pest: string; n: number }[]>(Prisma.sql`
        SELECT unnest("pestTags") pest, COUNT(*)::int n FROM "Farmer"
        WHERE "storeId" IN (${Prisma.join(storeIds)}) GROUP BY 1 ORDER BY 2 DESC LIMIT 60`),
      // Product categories actually purchased by this store's farmers.
      prisma.sale.findMany({
        where: { farmer: storeScope, category: { not: null } },
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
        take: 40,
      }),
    ]);

    // Lifetime value (base/pre-tax = SaleLine.basic) + bill count (Sale rows) per farmer on this page.
    const ids = rows.map((r) => r.id);
    const [ltvRows, billRows] = ids.length
      ? await Promise.all([
          prisma.saleLine.groupBy({ by: ["farmerId"], where: { farmerId: { in: ids }, source: "REAL" }, _sum: { basic: true } }),
          prisma.sale.groupBy({ by: ["farmerId"], where: { farmerId: { in: ids } }, _count: { _all: true } }),
        ])
      : [[], []];
    const ltvOf = new Map(ltvRows.map((s) => [s.farmerId, Math.round(s._sum.basic ?? 0)]));
    const billsOf = new Map(billRows.map((s) => [s.farmerId, s._count._all]));
    const byId = new Map(ids.map((id) => [id, { ltv: ltvOf.get(id) ?? 0, bills: billsOf.get(id) ?? 0 }]));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        mobile: r.mobile,
        village: r.village,
        crops: r.cropTags.slice(0, 3),
        segment: r.campaignSegment,
        ltv: byId.get(r.id)?.ltv ?? 0,
        bills: byId.get(r.id)?.bills ?? 0,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      villages: villageGroups
        .filter((v) => v.village)
        .map((v) => ({ village: v.village as string, count: v._count._all })),
      crops: cropRows.map((c) => ({ crop: c.crop, count: Number(c.n) })),
      pests: pestRows.map((p) => ({ pest: p.pest, count: Number(p.n) })),
      categories: categoryRows.map((c) => c.category!).filter(Boolean),
    };
  } catch {
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE, villages: [], crops: [], pests: [], categories: [] };
  }
}

/**
 * The single dynamic-cluster creator used by every builder (map / segment / analytics).
 * Stores the filter RULE + an auto description; membership resolves live (mode=dynamic).
 * A hand-picked set is saved as mode=static with a frozen id snapshot.
 */
export async function createClusterFromCriteria(input: {
  name: string;
  criteria: ClusterCriteria;
  origin: "map" | "segment" | "analytics";
  mode?: "dynamic" | "static";
}): Promise<CreateClusterResult & { id?: number }> {
  const perm = await requireClusterAuthor(); if (!perm.ok) return perm;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the cluster a name." };
  const mode = input.mode ?? "dynamic";
  // Never allow a rule with no effective conditions — it would match every farmer.
  if (!hasConditions(input.criteria))
    return { ok: false, error: "Add at least one filter — this rule would target every farmer." };
  try {
    const storeNames = input.criteria.storeIds?.length
      ? new Map(
          (await prisma.store.findMany({ where: { id: { in: input.criteria.storeIds } }, select: { id: true, name: true } }))
            .map((s) => [s.id, shortStoreName(s.name)] as const),
        )
      : undefined;
    const description = describeCriteria(input.criteria, storeNames);
    const count = await resolveClusterCount(input.criteria);
    if (count === 0) return { ok: false, error: "No farmers match this rule." };
    // Static clusters freeze EXACTLY the hand-picked ids (never re-intersected with filters).
    const farmerIds =
      mode === "static"
        ? input.criteria.explicitIds?.length
          ? input.criteria.explicitIds.slice(0, MAX_CLUSTER)
          : await resolveClusterIds(input.criteria, MAX_CLUSTER)
        : [];
    const actor = await getActor(); // the ACTUAL logged-in user (not an impersonated persona)
    const cluster = await prisma.cluster.create({
      data: {
        name,
        criteria: JSON.stringify(input.criteria),
        description,
        origin: input.origin,
        mode,
        farmerIds,
        farmerNames: [],
        createdBy: actor.name,
        createdByCode: actor.code,
        source: "REAL",
      },
    });
    revalidatePath("/clusters");
    revalidatePath("/campaigns");
    return { ok: true, count, id: cluster.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create cluster" };
  }
}

/** Map cluster-builder → dynamic cluster (or hand-picked → static). */
export async function createClusterFromSelection(
  input: CreateClusterInput,
): Promise<CreateClusterResult> {
  const perm = await requireClusterAuthor(); if (!perm.ok) return perm;
  // Hand-pick mode with nothing checked must NOT fall through to an all-matching cluster.
  if (!input.allMatching && !input.explicitIds?.length)
    return { ok: false, error: "Select farmers, or turn on “select all matching”." };
  const tier = input.filters.spendTier != null ? SPEND_TIERS[input.filters.spendTier] : undefined;
  const criteria: ClusterCriteria = {
    storeIds: input.storeIds,
    villages: input.filters.villages,
    cropTags: input.filters.crop ? [input.filters.crop] : undefined,
    pestTags: input.filters.pest ? [input.filters.pest] : undefined,
    campaignSegments: input.filters.campaignSegment ? [input.filters.campaignSegment] : undefined,
    spendMin: tier?.min,
    spendMax: tier?.max,
    category: input.filters.category,
    q: input.filters.q,
  };
  if (!input.allMatching && input.explicitIds?.length) {
    return createClusterFromCriteria({
      name: input.name,
      criteria: { ...criteria, explicitIds: input.explicitIds },
      origin: "map",
      mode: "static",
    });
  }
  return createClusterFromCriteria({ name: input.name, criteria, origin: "map", mode: "dynamic" });
}
