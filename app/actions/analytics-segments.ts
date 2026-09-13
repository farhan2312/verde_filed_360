"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS, VALUE_HNI_MIN, VALUE_POTENTIAL_MIN, LIFECYCLE_RECENT_MONTHS, LIFECYCLE_LAPSED_MIN_MONTHS } from "@/lib/campaign-segments";
import { inr } from "@/lib/format";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { buildWorkbookB64 } from "@/lib/xlsx-export";
import { createClusterFromCriteria } from "@/app/actions/cluster-builder";
import type { ClusterCriteria } from "@/lib/cluster-rules";
import { getScope } from "@/lib/scope";
import { SPEND_TIERS } from "@/lib/spend-tiers";

export type Lens = "sales" | "visit";

export interface WbFilters {
  lens: Lens;
  storeIds?: number[];       // stores — match ANY
  storeTags?: number[];      // store-tag ids — a farmer's store carries ANY of these (array overlap)
  zones?: string[];          // regions — match ANY
  villages?: string[];       // villages (UPPER-TRIMMED keys) — match ANY; both lenses
  crops?: string[];          // crops (sales or visit depending on lens) — match ANY (array overlap)
  pests?: string[];          // Target Pests/Diseases/Weeds — match ANY (array overlap)
  valueSegments?: string[];  // value tier(s): HNI | POTENTIAL_HNI | REGULAR (FY-dynamic in sales lens)
  lifecycleSegments?: string[]; // lifecycle stage(s): NEW | AT_RISK | LAPSED (FY-dynamic in sales lens)
  spendTiers?: number[];     // indices into SPEND_TIERS — FY spend, match ANY range
  fyStarts?: number[];       // selected financial-year start years (Apr Y→Mar Y+1); drives the sales segmentation
  problems?: string[];       // visit lens — match ANY
  visitFrom?: string;        // visit lens — visitedAt >= this date (ISO YYYY-MM-DD)
  visitTo?: string;          // visit lens — visitedAt <= this date (ISO YYYY-MM-DD)
}

const num = (x: unknown) => (x == null ? 0 : Number(x));
const shortStore = (s: string) => s.replace(/\s*\(.*?\)\s*/g, "").trim() || s;

/* ── dynamic WHERE builder (safe: column names are literals, values parameterized) ── */
const col = (alias: string, name: string) => Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`);
/** OR-of-ranges for the selected spend tiers, against a numeric column/expression. */
function spendTierOr(tiers: number[] | undefined, expr: Prisma.Sql): Prisma.Sql | null {
  if (!tiers?.length) return null;
  const ors = tiers.map((i) => SPEND_TIERS[i]).filter(Boolean).map((t) => {
    if (t.max === 0 && t.min == null) return Prisma.sql`(${expr} <= 0 OR ${expr} IS NULL)`; // "No spend" sentinel
    const parts: Prisma.Sql[] = [];
    if (t.min != null) parts.push(Prisma.sql`${expr} >= ${t.min}`);
    if (t.max != null) parts.push(Prisma.sql`${expr} < ${t.max}`);
    return parts.length ? Prisma.sql`(${Prisma.join(parts, " AND ")})` : Prisma.sql`TRUE`;
  });
  return ors.length ? Prisma.sql`(${Prisma.join(ors, " OR ")})` : null;
}
/** Static farmer attributes only — source/store/zone/crop/pest (+ visit problem). NOT value/lifecycle/spend. */
function staticConds(f: WbFilters, alias = ""): Prisma.Sql[] {
  const c: Prisma.Sql[] = [Prisma.sql`${col(alias, "source")} = 'REAL'`];
  if (f.storeIds?.length) c.push(Prisma.sql`${col(alias, "storeId")} = ANY(${f.storeIds})`);
  if (f.storeTags?.length) c.push(Prisma.sql`EXISTS (SELECT 1 FROM "Store" st WHERE st.id = ${col(alias, "storeId")} AND st."tagIds" && ${f.storeTags}::int[])`);
  if (f.zones?.length) c.push(Prisma.sql`${col(alias, "zone")} = ANY(${f.zones})`);
  if (f.villages?.length) c.push(Prisma.sql`upper(btrim(${col(alias, "village")})) = ANY(${f.villages})`);
  if (f.crops?.length) {
    const cc = f.lens === "sales" ? "salesCropTags" : "visitCropTags";
    c.push(Prisma.sql`${col(alias, cc)} && ${f.crops}::text[]`); // array overlap — uses the GIN index
  }
  if (f.pests?.length) c.push(Prisma.sql`${col(alias, "pestTags")} && ${f.pests}::text[]`);
  if (f.lens === "visit" && f.problems?.length) {
    c.push(Prisma.sql`EXISTS (SELECT 1 FROM "Visit" v WHERE v."farmerId" = ${col(alias, "id")} AND v."currentProblem" && ${f.problems}::text[])`);
  }
  return c;
}
/** Static conds + the precomputed value/lifecycle/spend columns (used by the visit lens + facets). */
function farmerConds(f: WbFilters, alias = ""): Prisma.Sql[] {
  const c = staticConds(f, alias);
  if (f.valueSegments?.length) c.push(Prisma.sql`${col(alias, "valueSegment")} = ANY(${f.valueSegments})`);
  if (f.lifecycleSegments?.length) c.push(Prisma.sql`${col(alias, "lifecycleSegment")} = ANY(${f.lifecycleSegments})`);
  if (f.lens === "sales") { const s = spendTierOr(f.spendTiers, col(alias, "p12mSpend")); if (s) c.push(s); }
  return c;
}

/* ── FY-dynamic sales segmentation (value/lifecycle computed live from Sale within the selected FY) ── */
/** FY window on any date alias + as-of date (lifecycle cutoff). `window(alias)` filters `<alias>."soldAt"`. */
function fyBounds(fyStarts: number[]): { window: (alias: string) => Prisma.Sql; asOfSql: Prisma.Sql } {
  if (!fyStarts.length) return { window: () => Prisma.sql`TRUE`, asOfSql: Prisma.sql`now()` };
  const maxY = Math.max(...fyStarts);
  const asOfSql = Prisma.sql`${`${maxY + 1}-04-01`}::timestamptz`;
  const window = (alias: string) => {
    const c = Prisma.raw(`${alias}."soldAt"`);
    const ors = fyStarts.map((y) => Prisma.sql`(${c} >= ${`${y}-04-01`}::timestamptz AND ${c} < ${`${y + 1}-04-01`}::timestamptz)`);
    return Prisma.sql`(${Prisma.join(ors, " OR ")})`;
  };
  return { window, asOfSql };
}
/**
 * The scoped→agg→tiers CTE: per-farmer FY spend + last purchase → value/lifecycle tier.
 * VALUE TIER — by default keys off the farmer's stored LIFETIME-value segment (`Farmer.valueSegment`,
 * = all-time LTV), so the analytics counts match Farmer 360 exactly. ONLY when a crop filter is active
 * does it fall back to the crop-scoped FY spend (so "potato HNI" = big potato buyers) — the deliberate
 * crop lens. SPEND (revenue histograms / drill-downs) is always SaleLine.basic (pre-tax), FY- and
 * crop-scoped. Lifecycle recency (last_at/first_at) always uses ALL sales, relative to the FY asOf.
 */
function tiersCte(f: WbFilters): Prisma.Sql {
  const { window, asOfSql } = fyBounds(f.fyStarts ?? []);
  const where = Prisma.sql`WHERE ${Prisma.join(staticConds(f, "f"), " AND ")}`;
  const recentM = Prisma.raw(String(LIFECYCLE_RECENT_MONTHS)), lapsedM = Prisma.raw(String(LIFECYCLE_LAPSED_MIN_MONTHS));
  // Crop filter → only that crop's tagged lines. No crop → every line.
  const cropCond = f.crops?.length ? Prisma.sql`AND sl."cropTag" = ANY(${f.crops}::text[])` : Prisma.empty;
  // Value tier: crop lens → crop-scoped FY spend; otherwise → the stored lifetime-LTV segment.
  const vsegSql = f.crops?.length
    ? Prisma.sql`CASE WHEN spend >= ${VALUE_HNI_MIN} THEN 'HNI' WHEN spend >= ${VALUE_POTENTIAL_MIN} THEN 'POTENTIAL_HNI' ELSE 'REGULAR' END`
    : Prisma.sql`COALESCE(vstored, 'REGULAR')`;
  const spendAgg = Prisma.sql`spend_agg AS (
        SELECT sl."farmerId" id, COALESCE(SUM(sl."basic") FILTER (WHERE ${window("sl")}), 0)::bigint spend
        FROM "SaleLine" sl JOIN scoped sc ON sc.id = sl."farmerId"
        WHERE sl.source = 'REAL' AND sl."soldAt" IS NOT NULL ${cropCond}
        GROUP BY 1)`;
  return Prisma.sql`
    scoped AS (SELECT f.id, f."storeId", f."zone", f."valueSegment" vstored FROM "Farmer" f ${where}),
    ${spendAgg},
    recency_agg AS (
      SELECT s."farmerId" id,
        MAX(s."soldAt") FILTER (WHERE s."soldAt" < ${asOfSql}) last_at,
        MIN(s."soldAt") FILTER (WHERE s."soldAt" < ${asOfSql}) first_at
      FROM "Sale" s JOIN scoped sc ON sc.id = s."farmerId"
      WHERE s.source = 'REAL' AND s."soldAt" IS NOT NULL
      GROUP BY 1),
    agg AS (
      SELECT sc.id, sc."storeId", sc."zone", sc.vstored, COALESCE(sp.spend, 0)::bigint spend, rc.last_at, rc.first_at
      FROM scoped sc LEFT JOIN spend_agg sp ON sp.id = sc.id LEFT JOIN recency_agg rc ON rc.id = sc.id),
    tiers AS (
      SELECT id, "storeId", "zone", spend,
        ${vsegSql} vseg,
        CASE WHEN last_at IS NULL THEN 'LAPSED'
          WHEN last_at > ${asOfSql} - interval '${recentM} months'
            THEN CASE WHEN first_at > ${asOfSql} - interval '${recentM} months' THEN 'NEW' ELSE 'RECENT' END
          WHEN last_at > ${asOfSql} - interval '${lapsedM} months' THEN 'AT_RISK'
          ELSE 'LAPSED' END lseg
      FROM agg)`;
}
/** Dynamic filter on the tiers CTE — value/lifecycle/FY-spend selections. */
function tierFilter(f: WbFilters): Prisma.Sql {
  const c: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.valueSegments?.length) c.push(Prisma.sql`vseg = ANY(${f.valueSegments})`);
  if (f.lifecycleSegments?.length) c.push(Prisma.sql`lseg = ANY(${f.lifecycleSegments})`);
  const s = spendTierOr(f.spendTiers, Prisma.sql`spend`); if (s) c.push(s);
  return Prisma.join(c, " AND ");
}
const whereOf = (f: WbFilters, alias = "") => Prisma.sql`WHERE ${Prisma.join(farmerConds(f, alias), " AND ")}`;

/**
 * Enforce role scope on the workbench filters: an Agri Officer is pinned to their own store and a
 * Regional Manager to their own region — they can narrow further, but never widen past their scope,
 * whatever the client sends. Central/Sysadmin are unrestricted. "none" = a scoped user with no
 * store/region assigned (show nothing).
 */
async function scopeFilters(f: WbFilters): Promise<WbFilters | "none"> {
  const { role, storeId, managedStoreIds } = await getScope();
  if (role === "campaigner") return "none"; // call team has no analytics access — fail closed
  if (role === "officer") return storeId == null ? "none" : { ...f, storeIds: [storeId], zones: undefined };
  // RM: scope to the STORES they manage (Store.regionalManager — authoritative; can span districts).
  // A client store selection may narrow within that set, never widen.
  if (role === "regional") {
    const own = managedStoreIds ?? [];
    if (!own.length) return "none";
    const chosen = f.storeIds?.length ? f.storeIds.filter((id) => own.includes(id)) : own;
    return { ...f, storeIds: chosen.length ? chosen : [-1], zones: undefined };
  }
  return f; // central / sysadmin
}

/* ── Facets for the filter bar ── */
export interface WbFacets {
  stores: { id: number; name: string }[];
  zones: string[];
  salesCrops: { crop: string; count: number }[];
  visitCrops: { crop: string; count: number }[];
  pests: { pest: string; count: number }[]; // item-code derived, both lenses
  problems: { problem: string; count: number }[];
  spendTiers: string[];
  years: number[]; // distinct financial-year start years (Apr–Mar) for the crop-trend FY filter, role-scoped
  visitMinDate: string | null; // earliest scoped visit date (ISO) — lower bound for the visit date slider
  villages: { village: string; count: number }[]; // top villages by farmer count (UPPER-TRIMMED), both lenses
  storeTags: { id: number; name: string; color: string }[]; // store-tag catalog (for the tag filter)
}
export async function getWorkbenchFacets(): Promise<WbFacets> {
  const { role, storeId, managedStoreIds } = await getScope();
  if (role === "campaigner") // call team has no analytics access — fail closed
    return { stores: [], zones: [], salesCrops: [], visitCrops: [], pests: [], problems: [], spendTiers: [], years: [], visitMinDate: null, villages: [], storeTags: [] };
  const isOfficer = role === "officer", isRM = role === "regional";
  // RM scope is the set of STORES they manage (Store.regionalManager). Empty → -1 (no rows).
  const rmIds = isRM && managedStoreIds && managedStoreIds.length ? managedStoreIds : [-1];

  // Store dropdown: officer → only their store; RM → only the stores they manage; else all.
  const storeWhere: Prisma.StoreWhereInput = isOfficer
    ? { id: storeId ?? -1 }
    : isRM ? { id: { in: rmIds } } : {};
  // Farmer-level scope predicate for the crop-facet COUNTS (so a scoped user doesn't see global totals).
  // Everyone is scoped by the farmer's STORE — officer→their store, RM→their region's stores.
  const fScope: Prisma.Sql = isOfficer
    ? (storeId != null ? Prisma.sql`"storeId" = ${storeId}` : Prisma.sql`false`)
    : isRM ? Prisma.sql`"storeId" = ANY(${rmIds})`
    : Prisma.sql`true`;
  // Visit-facet scope — by the visited farmer's store, matching the data path (which scopes on the farmer).
  const vScope: Prisma.Sql = isOfficer
    ? (storeId != null ? Prisma.sql`f."storeId" = ${storeId}` : Prisma.sql`false`)
    : isRM ? Prisma.sql`f."storeId" = ANY(${rmIds})`
    : Prisma.sql`true`;
  // Sale-line scope for the year facet (officer by store, RM by the region's stores).
  const slScope: Prisma.Sql = isOfficer
    ? (storeId != null ? Prisma.sql`AND sl."storeId" = ${storeId}` : Prisma.sql`AND false`)
    : isRM ? Prisma.sql`AND sl."storeId" = ANY(${rmIds})`
    : Prisma.empty;

  const [stores, zoneRows, sc, vc, pt, pr, yr, vmin, vil] = await Promise.all([
    prisma.store.findMany({ where: storeWhere, orderBy: { name: "asc" }, select: { id: true, name: true, zone: true } }),
    isOfficer || isRM
      ? Promise.resolve([] as { zone: string | null }[])
      : prisma.farmer.findMany({ where: { zone: { not: null }, source: "REAL" }, distinct: ["zone"], select: { zone: true }, orderBy: { zone: "asc" } }),
    prisma.$queryRaw<{ crop: string; n: number }[]>(Prisma.sql`SELECT unnest("salesCropTags") crop, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' AND ${fScope} GROUP BY 1 ORDER BY 2 DESC`),
    prisma.$queryRaw<{ crop: string; n: number }[]>(Prisma.sql`SELECT unnest("visitCropTags") crop, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' AND ${fScope} GROUP BY 1 ORDER BY 2 DESC`),
    prisma.$queryRaw<{ pest: string; n: number }[]>(Prisma.sql`SELECT unnest("pestTags") pest, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' AND ${fScope} GROUP BY 1 ORDER BY 2 DESC LIMIT 200`),
    prisma.$queryRaw<{ problem: string; n: number }[]>(Prisma.sql`SELECT unnest(v."currentProblem") problem, COUNT(*)::int n FROM "Visit" v JOIN "Farmer" f ON f.id = v."farmerId" WHERE array_length(v."currentProblem",1) > 0 AND ${vScope} GROUP BY 1 ORDER BY 2 DESC LIMIT 40`),
    // Distinct financial-year START years (Apr–Mar): Jan–Mar count toward the previous FY.
    prisma.$queryRaw<{ y: number }[]>(Prisma.sql`SELECT DISTINCT (EXTRACT(YEAR FROM sl."soldAt")::int - CASE WHEN EXTRACT(MONTH FROM sl."soldAt") < 4 THEN 1 ELSE 0 END) y FROM "SaleLine" sl WHERE sl."soldAt" IS NOT NULL ${slScope} ORDER BY 1`),
    prisma.$queryRaw<{ d: string | null }[]>(Prisma.sql`SELECT to_char(MIN(v."visitedAt"), 'YYYY-MM-DD') d FROM "Visit" v JOIN "Farmer" f ON f.id = v."farmerId" WHERE v."visitedAt" IS NOT NULL AND ${vScope}`),
    prisma.$queryRaw<{ village: string; n: number }[]>(Prisma.sql`SELECT upper(btrim(village)) village, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' AND village IS NOT NULL AND btrim(village) <> '' AND ${fScope} GROUP BY 1 ORDER BY 2 DESC LIMIT 2000`),
  ]);
  // Zone facet: RM → the distinct districts their managed stores span (can be >1); central/sysadmin → all.
  const zones = isRM
    ? [...new Set(stores.map((s) => s.zone).filter((z): z is string => !!z))]
    : isOfficer ? [] : zoneRows.map((z) => z.zone!).filter(Boolean);
  const abc = (a: string, b: string) => a.localeCompare(b); // filter option lists sorted A→Z for scan-ability
  return {
    stores: stores.map((s) => ({ id: s.id, name: shortStore(s.name) })).sort((a, b) => abc(a.name, b.name)),
    zones: [...zones].sort(abc),
    salesCrops: sc.map((r) => ({ crop: r.crop, count: num(r.n) })).sort((a, b) => abc(cropLabel(a.crop), cropLabel(b.crop))),
    visitCrops: vc.map((r) => ({ crop: r.crop, count: num(r.n) })).sort((a, b) => abc(cropLabel(a.crop), cropLabel(b.crop))),
    pests: pt.map((r) => ({ pest: r.pest, count: num(r.n) })).sort((a, b) => abc(tagLabel(a.pest), tagLabel(b.pest))),
    problems: pr.map((r) => ({ problem: r.problem, count: num(r.n) })).sort((a, b) => abc(a.problem, b.problem)),
    spendTiers: SPEND_TIERS.map((t) => t.label),
    years: yr.map((r) => num(r.y)).filter(Boolean),
    visitMinDate: vmin[0]?.d ?? null,
    villages: vil.map((r) => ({ village: r.village, count: num(r.n) })),
    storeTags: (await prisma.storeTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })).map((t) => ({ id: t.id, name: t.name, color: t.color })),
  };
}

/* ── The workbench data for the current filter ── */
export interface WbKpis { farmers: number; spend: number; visits: number }
export interface WbBar { label: string; value: number; color?: string }
/** One store row of the merged Value + Lifecycle table (both count-sets sum to `total`). */
export interface MergedRow {
  storeId: number | null; storeName: string;
  value: Record<string, number>; lifecycle: Record<string, number>;
  cross: Record<string, Record<string, number>>; // value → lifecycle → count (the full 3×3 per store)
  total: number;
}
export interface MergedMatrix {
  rows: MergedRow[]; valueTotals: Record<string, number>; lifecycleTotals: Record<string, number>;
  grandCross: Record<string, Record<string, number>>; // all-stores 3×3 (the KPI-tree cross)
  grandTotal: number;
}
export interface TreeCell { value: string; lifecycle: string; count: number }
export interface WbData {
  kpis: WbKpis;
  valueCols: string[]; lifecycleCols: string[];
  matrix: MergedMatrix;      // one merged Store × (Value | Lifecycle) table
  tree: TreeCell[];          // 9 Value×Lifecycle counts (the KPI cross-tab)
  valueDist: WbBar[];        // donut: value share
  lifecycleDist: WbBar[];    // donut: lifecycle share
  cropBreakdown: WbBar[];
  extra: WbBar[]; // sales: FY spend-tier dist ; visit: problem dist
  extraTitle: string;
  secondary: WbBar[]; // sales: top zones by FY spend ; visit: officer activity
  secondaryTitle: string;
}

const EMPTY_WB: WbData = {
  kpis: { farmers: 0, spend: 0, visits: 0 },
  valueCols: [...VALUE_SEGMENTS], lifecycleCols: [...LIFECYCLE_SEGMENTS],
  matrix: { rows: [], valueTotals: {}, lifecycleTotals: {}, grandCross: {}, grandTotal: 0 },
  tree: [], valueDist: [], lifecycleDist: [], cropBreakdown: [], extra: [], extraTitle: "", secondary: [], secondaryTitle: "",
};

export async function getWorkbench(f: WbFilters): Promise<WbData> {
  const scoped = await scopeFilters(f);
  if (scoped === "none") return EMPTY_WB; // scoped user with no store/region → nothing to show
  f = scoped;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const nameById = new Map(stores.map((s) => [s.id, shortStore(s.name)]));

  // ── Visit lens: purely field-visit data (no FY segmentation). ──
  if (f.lens === "visit") {
    const whereF = whereOf(f, "f");
    const [cntRows, vr, cropRows, probRows, offRows] = await Promise.all([
      prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int n FROM "Farmer" f ${whereF}`),
      prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int n FROM "Visit" v JOIN "Farmer" f ON f.id = v."farmerId" ${whereF}`),
      prisma.$queryRaw<{ crop: string; n: number }[]>(Prisma.sql`SELECT unnest(f."visitCropTags") crop, COUNT(*)::int n FROM "Farmer" f ${whereF} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
      prisma.$queryRaw<{ problem: string; n: number }[]>(Prisma.sql`
        SELECT unnest(v."currentProblem") problem, COUNT(DISTINCT v."farmerId")::int n FROM "Visit" v JOIN "Farmer" f ON f.id=v."farmerId" ${whereF}
        AND array_length(v."currentProblem",1) > 0 GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
      prisma.$queryRaw<{ officer: string; n: number }[]>(Prisma.sql`
        SELECT v."officerName" officer, COUNT(*)::int n FROM "Visit" v JOIN "Farmer" f ON f.id=v."farmerId" ${whereF}
        AND v."officerName" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    ]);
    return {
      kpis: { farmers: num(cntRows[0]?.n), spend: 0, visits: num(vr[0]?.n) },
      valueCols: [...VALUE_SEGMENTS], lifecycleCols: [...LIFECYCLE_SEGMENTS],
      matrix: { rows: [], valueTotals: {}, lifecycleTotals: {}, grandCross: {}, grandTotal: 0 }, tree: [], valueDist: [], lifecycleDist: [],
      cropBreakdown: cropRows.map((r) => ({ label: r.crop, value: num(r.n) })),
      extra: probRows.map((r) => ({ label: r.problem, value: num(r.n) })), extraTitle: "Field problems (farmers)",
      secondary: offRows.map((r) => ({ label: r.officer, value: num(r.n) })), secondaryTitle: "Officer visit activity",
    };
  }

  // ── Sales lens: value×lifecycle. Shared spend-histogram bucketing (used by both paths). ──
  type CrossRow = { storeId: number | null; vseg: string; lseg: string; n: number; spendsum: bigint };
  type HistRow = { bucket: string; n: number };
  type ZoneRow = { zone: string; spend: bigint };
  type CropRow = { crop: string; n: number };
  const histCase = (e: Prisma.Sql) => Prisma.sql`CASE
    WHEN ${e}>=50000 THEN '₹50K+' WHEN ${e}>=20000 THEN '₹20–50K' WHEN ${e}>=12000 THEN '₹12–20K'
    WHEN ${e}>=10000 THEN '₹10–12K' WHEN ${e}>=8000 THEN '₹8–10K' WHEN ${e}>=5000 THEN '₹5–8K'
    WHEN ${e}>=2500 THEN '₹2.5–5K' WHEN ${e}>0 THEN '< ₹2.5K' ELSE 'No spend' END`;

  let cross: CrossRow[], histRows: HistRow[], zoneRows: ZoneRow[], cropRows: CropRow[];
  if (!f.fyStarts?.length && !f.crops?.length) {
    // FAST PATH — no FY & no crop ⇒ the tiers equal the stored Farmer columns (value tier, lifecycle,
    // all-time base spend). Read them directly and skip the ~4× heavy SaleLine/Sale re-aggregation.
    const conds = staticConds(f, "f");
    if (f.valueSegments?.length) conds.push(Prisma.sql`f."valueSegment" = ANY(${f.valueSegments})`);
    if (f.lifecycleSegments?.length) conds.push(Prisma.sql`f."lifecycleSegment" = ANY(${f.lifecycleSegments})`);
    const sp = spendTierOr(f.spendTiers, Prisma.sql`f."lifetimeSpend"`); if (sp) conds.push(sp);
    const w = Prisma.join(conds, " AND ");
    [cross, histRows, zoneRows, cropRows] = await Promise.all([
      prisma.$queryRaw<CrossRow[]>(Prisma.sql`SELECT f."storeId" "storeId", COALESCE(f."valueSegment",'NO_SPEND') vseg, COALESCE(f."lifecycleSegment",'LEAD') lseg, COUNT(*)::int n, COALESCE(SUM(f."lifetimeSpend"),0)::bigint spendsum FROM "Farmer" f WHERE ${w} GROUP BY 1,2,3`),
      prisma.$queryRaw<HistRow[]>(Prisma.sql`SELECT ${histCase(Prisma.sql`f."lifetimeSpend"`)} bucket, COUNT(*)::int n FROM "Farmer" f WHERE ${w} GROUP BY 1`),
      prisma.$queryRaw<ZoneRow[]>(Prisma.sql`SELECT f."zone" AS zone, COALESCE(SUM(f."lifetimeSpend"),0)::bigint spend FROM "Farmer" f WHERE ${w} AND f."zone" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      prisma.$queryRaw<CropRow[]>(Prisma.sql`SELECT crop, COUNT(*)::int n FROM (SELECT unnest(f."salesCropTags") crop FROM "Farmer" f WHERE ${w}) u GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
    ]);
  } else {
    // Full path — FY- and/or crop-scoped tiers computed live from Sale/SaleLine.
    const cte = tiersCte(f), tf = tierFilter(f);
    [cross, histRows, zoneRows, cropRows] = await Promise.all([
      prisma.$queryRaw<CrossRow[]>(Prisma.sql`WITH ${cte} SELECT "storeId", vseg, lseg, COUNT(*)::int n, COALESCE(SUM(spend),0)::bigint spendsum FROM tiers WHERE ${tf} GROUP BY 1,2,3`),
      prisma.$queryRaw<HistRow[]>(Prisma.sql`WITH ${cte} SELECT ${histCase(Prisma.sql`spend`)} bucket, COUNT(*)::int n FROM tiers WHERE ${tf} GROUP BY 1`),
      prisma.$queryRaw<ZoneRow[]>(Prisma.sql`WITH ${cte} SELECT "zone" AS zone, COALESCE(SUM(spend),0)::bigint spend FROM tiers WHERE ${tf} AND "zone" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      prisma.$queryRaw<CropRow[]>(Prisma.sql`WITH ${cte} SELECT crop, COUNT(*)::int n FROM (SELECT unnest(f."salesCropTags") crop FROM tiers t JOIN "Farmer" f ON f.id=t.id WHERE ${tf}) u
        ${f.crops?.length ? Prisma.sql`WHERE crop = ANY(${f.crops}::text[])` : Prisma.empty} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
    ]);
  }

  const byStore = new Map<number | null, { value: Record<string, number>; lifecycle: Record<string, number>; cross: Record<string, Record<string, number>>; total: number }>();
  const valueTotals: Record<string, number> = {}, lifecycleTotals: Record<string, number> = {};
  const treeMap = new Map<string, number>();
  let farmers = 0, spendTotal = 0;
  for (const r of cross) {
    const cnt = num(r.n);
    const st = byStore.get(r.storeId) ?? { value: {}, lifecycle: {}, cross: {}, total: 0 };
    st.value[r.vseg] = (st.value[r.vseg] ?? 0) + cnt;
    st.lifecycle[r.lseg] = (st.lifecycle[r.lseg] ?? 0) + cnt;
    (st.cross[r.vseg] ??= {})[r.lseg] = (st.cross[r.vseg]?.[r.lseg] ?? 0) + cnt;
    st.total += cnt; byStore.set(r.storeId, st);
    valueTotals[r.vseg] = (valueTotals[r.vseg] ?? 0) + cnt;
    lifecycleTotals[r.lseg] = (lifecycleTotals[r.lseg] ?? 0) + cnt;
    treeMap.set(`${r.vseg}|${r.lseg}`, (treeMap.get(`${r.vseg}|${r.lseg}`) ?? 0) + cnt);
    farmers += cnt; spendTotal += Number(r.spendsum);
  }
  const rows: MergedRow[] = [...byStore.entries()].map(([storeId, s]) => ({
    storeId, storeName: storeId == null ? "Unassigned" : nameById.get(storeId) ?? `Store #${storeId}`,
    value: s.value, lifecycle: s.lifecycle, cross: s.cross, total: s.total,
  })).sort((a, b) => b.total - a.total).slice(0, 100);
  const tree = VALUE_SEGMENTS.flatMap((v) => LIFECYCLE_SEGMENTS.map((l) => ({ value: v, lifecycle: l, count: treeMap.get(`${v}|${l}`) ?? 0 })));
  const grandCross: Record<string, Record<string, number>> = {};
  for (const v of VALUE_SEGMENTS) for (const l of LIFECYCLE_SEGMENTS) (grandCross[v] ??= {})[l] = treeMap.get(`${v}|${l}`) ?? 0;
  const order = ["₹50K+", "₹20–50K", "₹12–20K", "₹10–12K", "₹8–10K", "₹5–8K", "₹2.5–5K", "< ₹2.5K", "No spend"];

  return {
    kpis: { farmers, spend: spendTotal, visits: 0 },
    valueCols: [...VALUE_SEGMENTS], lifecycleCols: [...LIFECYCLE_SEGMENTS],
    matrix: { rows, valueTotals, lifecycleTotals, grandCross, grandTotal: farmers },
    tree,
    valueDist: VALUE_SEGMENTS.map((s) => ({ label: segMeta(s).label, value: valueTotals[s] ?? 0, color: segMeta(s).color })),
    lifecycleDist: LIFECYCLE_SEGMENTS.map((s) => ({ label: segMeta(s).label, value: lifecycleTotals[s] ?? 0, color: segMeta(s).color })),
    cropBreakdown: cropRows.map((r) => ({ label: r.crop, value: num(r.n) })),
    extra: histRows.map((r) => ({ label: r.bucket, value: num(r.n) })).sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)),
    extraTitle: "Spend tiers (FY)",
    secondary: zoneRows.map((r) => ({ label: r.zone, value: Number(r.spend) })), secondaryTitle: "Top districts by FY spend",
  };
}

/* ── Visit analytics: PURELY what the field-visit wizard collects (no sales data) ── */
export interface VisitKpis {
  visits: number; farmers: number; villages: number; officers: number;
  fieldPct: number; photos: number; voiceNotes: number; whatsappPct: number;
  leads: number; // registered farmers in scope with NO sales record (value tier = No Spend)
}
export interface VisitMonth { ym: string; label: string; year: number; count: number }
export interface VisitAdoption { label: string; count: number; pct: number }
export interface VisitStoreRow { store: string; visits: number; farmers: number }
export interface VisitAnalytics {
  kpis: VisitKpis;
  monthly: VisitMonth[];
  purposes: WbBar[];
  problems: WbBar[];
  crops: WbBar[];
  water: WbBar[];
  landHolding: WbBar[];
  expense: WbBar[];
  productsUsed: WbBar[];
  productsNeeded: WbBar[];
  soilTypes: WbBar[];
  purchaseFreq: WbBar[];
  risks: WbBar[];
  adoption: VisitAdoption[];
  officers: WbBar[];
  byStore: VisitStoreRow[];
}

const EMPTY_VISITS: VisitAnalytics = {
  kpis: { visits: 0, farmers: 0, villages: 0, officers: 0, fieldPct: 0, photos: 0, voiceNotes: 0, whatsappPct: 0, leads: 0 },
  monthly: [], purposes: [], problems: [], crops: [], water: [], landHolding: [], expense: [],
  productsUsed: [], productsNeeded: [], soilTypes: [], purchaseFreq: [], risks: [], adoption: [], officers: [], byStore: [],
};

// Canonical bucket orders from the visit wizard's option catalog.
const LAND_ORDER = ["< 1 Bigha", "1–3 Bigha", "3–5 Bigha", "5–10 Bigha", "10–20 Bigha", "20–50 Bigha", "50–100 Bigha", "100+ Bigha"];
const EXPENSE_ORDER = ["< ₹10K", "₹10–25K", "₹25–50K", "₹50K–1L", "₹1–2.5L", "₹2.5L+"];
const FREQ_ORDER = ["Weekly", "Monthly", "Seasonal", "As Required"];
const orderBars = (bars: WbBar[], order: string[]) =>
  [...bars].sort((a, b) => {
    const ia = order.indexOf(a.label), ib = order.indexOf(b.label);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

/** Everything the field team collects on visits, aggregated over the filtered farmer set's visits. */
export async function getVisitAnalytics(f: WbFilters): Promise<VisitAnalytics> {
  const scoped = await scopeFilters({ ...f, lens: "visit" });
  if (scoped === "none") return EMPTY_VISITS;
  const whereF = whereOf(scoped, "f");
  // Visit date range (buckets/slider). visitFrom/To are ISO dates; applied on Visit.visitedAt.
  const dFrom = f.visitFrom && /^\d{4}-\d{2}-\d{2}$/.test(f.visitFrom) ? new Date(`${f.visitFrom}T00:00:00Z`) : null;
  const dTo = f.visitTo && /^\d{4}-\d{2}-\d{2}$/.test(f.visitTo) ? new Date(`${f.visitTo}T23:59:59Z`) : null;
  const dateSql = [
    dFrom ? Prisma.sql`v."visitedAt" >= ${dFrom}` : null,
    dTo ? Prisma.sql`v."visitedAt" <= ${dTo}` : null,
  ].filter(Boolean) as Prisma.Sql[];
  const dateClause = dateSql.length ? Prisma.sql`AND ${Prisma.join(dateSql, " AND ")}` : Prisma.empty;
  const BASE = Prisma.sql`FROM "Visit" v JOIN "Farmer" f ON f.id = v."farmerId" ${whereF} ${dateClause}`;
  const bars = (rows: { x: string | null; n: number }[]): WbBar[] =>
    rows.filter((r) => r.x != null && r.x !== "").map((r) => ({ label: r.x as string, value: num(r.n) }));

  const [kpiRows, monthlyRows, purposeRows, problemRows, cropRows] = await Promise.all([
    prisma.$queryRaw<{ visits: number; farmers: number; villages: number; officers: number; field: number; photos: number; voices: number; wa: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int visits, COUNT(DISTINCT v."farmerId")::int farmers,
        COUNT(DISTINCT f."village")::int villages, COUNT(DISTINCT v."officerName")::int officers,
        COUNT(*) FILTER (WHERE v."visitMode" = 'field')::int field,
        COALESCE(SUM(cardinality(v."photos")), 0)::int photos,
        COALESCE(SUM(cardinality(v."voiceNotes")), 0)::int voices,
        COUNT(*) FILTER (WHERE v."whatsappAvail")::int wa
      ${BASE}`),
    prisma.$queryRaw<{ ym: string; n: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', v."visitedAt"), 'YYYY-MM') ym, COUNT(*)::int n
      ${BASE} AND v."visitedAt" IS NOT NULL GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(TRIM(v."purpose"), ''), 'Not recorded') x, COUNT(*)::int n ${BASE} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT p x, COUNT(DISTINCT fid)::int n
      FROM (SELECT v."farmerId" fid, unnest(v."currentProblem") p ${BASE}) t
      GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT c x, COUNT(*)::int n FROM (SELECT unnest(array_append(v."crops", v."mainCrop")) c ${BASE}) t
      WHERE c IS NOT NULL AND c <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
  ]);

  const [waterRows, landRows, expenseRows, usedRows, neededRows] = await Promise.all([
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT w x, COUNT(*)::int n FROM (SELECT unnest(v."waterSource") w ${BASE}) t GROUP BY 1 ORDER BY 2 DESC LIMIT 9`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT v."landHoldingUnit" x, COUNT(*)::int n ${BASE} AND v."landHoldingUnit" IS NOT NULL GROUP BY 1`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT v."annualExpense" x, COUNT(*)::int n ${BASE} AND v."annualExpense" IS NOT NULL GROUP BY 1`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT p x, COUNT(*)::int n FROM (SELECT unnest(v."products") p ${BASE}) t GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT p x, COUNT(*)::int n FROM (SELECT unnest(v."productRequired") p ${BASE}) t GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
  ]);

  const [soilRows, freqRows, riskRows, adoptRows, officerRows, storeRows] = await Promise.all([
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT v."soilType" x, COUNT(*)::int n ${BASE} AND v."soilType" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT v."purchaseFreq" x, COUNT(*)::int n ${BASE} AND v."purchaseFreq" IS NOT NULL GROUP BY 1`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT r x, COUNT(*)::int n FROM (SELECT unnest(v."cropRisk") r ${BASE}) t GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    prisma.$queryRaw<{ fpo: number; contract: number; dairy: number; wa: number; insured: number; soil: number }[]>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE v."fpoMember")::int fpo,
        COUNT(*) FILTER (WHERE v."contractFarming")::int contract,
        COUNT(*) FILTER (WHERE v."dairyServices")::int dairy,
        COUNT(*) FILTER (WHERE v."whatsappAvail")::int wa,
        COUNT(*) FILTER (WHERE v."cropInsured")::int insured,
        COUNT(*) FILTER (WHERE v."soilTesting" = 'Required')::int soil
      ${BASE}`),
    prisma.$queryRaw<{ x: string | null; n: number }[]>(Prisma.sql`
      SELECT v."officerName" x, COUNT(*)::int n ${BASE} AND v."officerName" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
    prisma.$queryRaw<{ store: string | null; visits: number; farmers: number }[]>(Prisma.sql`
      SELECT st."name" store, COUNT(*)::int visits, COUNT(DISTINCT v."farmerId")::int farmers
      FROM "Visit" v JOIN "Farmer" f ON f.id = v."farmerId" LEFT JOIN "Store" st ON st.id = v."storeId"
      ${whereF} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
  ]);

  const k = kpiRows[0];
  const visits = num(k?.visits);
  // Leads = registered farmers in scope with NO sales record (value tier "No Spend"). A farmer-level
  // count over the scoped set — independent of the visit date window.
  const leadRows = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int n FROM "Farmer" f ${whereF} AND f."valueSegment" = 'NO_SPEND'`);
  const leads = num(leadRows[0]?.n);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthly: VisitMonth[] = monthlyRows.map((r) => {
    const [y, m] = r.ym.split("-").map(Number);
    return { ym: r.ym, label: MONTHS[m - 1], year: y, count: num(r.n) };
  });
  const a = adoptRows[0];
  const pct = (x: number) => (visits ? Math.round((x / visits) * 100) : 0);
  const adoption: VisitAdoption[] = [
    { label: "WhatsApp available", count: num(a?.wa), pct: pct(num(a?.wa)) },
    { label: "Soil testing required", count: num(a?.soil), pct: pct(num(a?.soil)) },
    { label: "Crop insured", count: num(a?.insured), pct: pct(num(a?.insured)) },
    { label: "FPO member", count: num(a?.fpo), pct: pct(num(a?.fpo)) },
    { label: "Contract farming", count: num(a?.contract), pct: pct(num(a?.contract)) },
    { label: "Dairy services", count: num(a?.dairy), pct: pct(num(a?.dairy)) },
  ];

  return {
    kpis: {
      visits,
      farmers: num(k?.farmers),
      villages: num(k?.villages),
      officers: num(k?.officers),
      fieldPct: pct(num(k?.field)),
      photos: num(k?.photos),
      voiceNotes: num(k?.voices),
      whatsappPct: pct(num(k?.wa)),
      leads,
    },
    monthly,
    purposes: bars(purposeRows),
    problems: bars(problemRows),
    crops: bars(cropRows),
    water: bars(waterRows),
    landHolding: orderBars(bars(landRows), LAND_ORDER),
    expense: orderBars(bars(expenseRows), EXPENSE_ORDER),
    productsUsed: bars(usedRows),
    productsNeeded: bars(neededRows),
    soilTypes: bars(soilRows),
    purchaseFreq: orderBars(bars(freqRows), FREQ_ORDER),
    risks: bars(riskRows),
    adoption,
    officers: bars(officerRows),
    byStore: storeRows.filter((r) => r.store).map((r) => ({ store: r.store as string, visits: num(r.visits), farmers: num(r.farmers) })),
  };
}

/* ── Drill: farmers in a matrix cell (respects the active filters) ── */
export interface WbCustomer { id: number; name: string; mobile: string | null; village: string | null; spend: string; segment: string; salesCrops: string[]; visitCrops: string[] }
export type SegDim = "value" | "lifecycle";
export async function getWorkbenchCustomers(f: WbFilters, storeId: number | null, dim: SegDim | "cross", seg: string, limit = 400): Promise<WbCustomer[]> {
  // Scope LAST (after applying the clicked cell's store) so an officer/RM can't drill into a foreign store.
  const scoped = await scopeFilters({ ...f, storeIds: storeId != null ? [storeId] : undefined });
  if (scoped === "none") return [];
  const cte = tiersCte(scoped), tf = tierFilter(scoped);
  // "cross" = a full 3×3 cell: seg encodes "VALUE|LIFECYCLE"; marginal cells filter one dimension.
  const dimCond = dim === "value" ? Prisma.sql`t.vseg = ${seg}`
    : dim === "lifecycle" ? Prisma.sql`t.lseg = ${seg}`
    : Prisma.sql`t.vseg = ${seg.split("|")[0]} AND t.lseg = ${seg.split("|")[1]}`;
  const storeCond = storeId == null ? Prisma.sql`t."storeId" IS NULL` : Prisma.sql`t."storeId" = ${storeId}`;
  const rows = await prisma.$queryRaw<{ id: number; name: string; mobile: string | null; village: string | null; spend: bigint; vseg: string | null; lseg: string | null; salesc: string[]; visitc: string[] }[]>(Prisma.sql`
    WITH ${cte}
    SELECT f.id, f.name, f.mobile, f.village, t.spend, t.vseg, t.lseg, f."salesCropTags" salesc, f."visitCropTags" visitc
    FROM tiers t JOIN "Farmer" f ON f.id = t.id
    WHERE ${tf} AND ${storeCond} AND ${dimCond}
    ORDER BY t.spend DESC NULLS LAST LIMIT ${limit}`);
  return rows.map((r) => ({
    id: r.id, name: r.name, mobile: r.mobile, village: r.village,
    spend: r.spend != null ? inr(Number(r.spend)) : "—",
    segment: [r.vseg, r.lseg].filter(Boolean).map((s) => segMeta(s!).label).join(" · ") || "—",
    salesCrops: r.salesc ?? [], visitCrops: r.visitc ?? [],
  }));
}

/* ── Raw sale-line view: the actual line items behind the filters (no aggregation) + live KPIs ── */
export interface RawKpis { lines: number; base: number; farmers: number; items: number; qty: number }
export interface RawLine {
  date: string | null; fy: string | null; farmer: string; phone: string | null; village: string | null;
  store: string | null; orderNo: string | null; item: string; category: string | null; crop: string | null;
  qty: number; uom: string | null; base: number;
}
const RAW_LINE_CAP = 1000; // rows shown in the table; the KPIs above always cover the full filtered set
export async function getSalesRawData(f: WbFilters): Promise<{ kpis: RawKpis; rows: RawLine[]; capped: boolean }> {
  const empty = { kpis: { lines: 0, base: 0, farmers: 0, items: 0, qty: 0 }, rows: [], capped: false };
  const scoped = await scopeFilters(f);
  if (scoped === "none") return empty;
  const cte = tiersCte(scoped), tf = tierFilter(scoped);
  const cropLine = scoped.crops?.length ? Prisma.sql`AND sl."cropTag" = ANY(${scoped.crops}::text[])` : Prisma.empty;
  const fyLine = scoped.fyStarts?.length ? Prisma.sql`AND ${fyBounds(scoped.fyStarts).window("sl")}` : Prisma.empty;
  const [kpiRows, rows] = await Promise.all([
    prisma.$queryRaw<{ lines: number; base: bigint; farmers: number; items: number; qty: number }[]>(Prisma.sql`
      WITH ${cte}
      SELECT COUNT(*)::int lines, COALESCE(SUM(sl."basic"),0)::bigint base, COUNT(DISTINCT sl."farmerId")::int farmers,
             COUNT(DISTINCT sl."itemRaw")::int items, COALESCE(SUM(sl.qty),0)::float qty
      FROM tiers t JOIN "SaleLine" sl ON sl."farmerId" = t.id AND sl.source = 'REAL'
      WHERE ${tf} ${cropLine} ${fyLine}`),
    prisma.$queryRaw<{ soldAt: Date | null; fy: string | null; farmer: string; phone: string | null; village: string | null; store: string | null; orderNo: string | null; item: string; category: string | null; crop: string | null; qty: number; uom: string | null; base: number }[]>(Prisma.sql`
      WITH ${cte}
      SELECT sl."soldAt" "soldAt", sl."financialYear" fy, f.name farmer, f.mobile phone, f.village,
             st."name" store, sl."orderNo" "orderNo", sl."itemRaw" item, sl."mainCategory" category, sl."cropTag" crop,
             sl.qty, sl.uom, sl."basic" base
      FROM tiers t JOIN "Farmer" f ON f.id = t.id
        JOIN "SaleLine" sl ON sl."farmerId" = t.id AND sl.source = 'REAL'
        LEFT JOIN "Store" st ON st.id = sl."storeId"
      WHERE ${tf} ${cropLine} ${fyLine}
      ORDER BY sl."soldAt" DESC NULLS LAST, sl."basic" DESC LIMIT ${RAW_LINE_CAP + 1}`),
  ]);
  const k = kpiRows[0];
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    kpis: { lines: num(k?.lines), base: Number(k?.base ?? 0), farmers: num(k?.farmers), items: num(k?.items), qty: num(k?.qty) },
    rows: rows.slice(0, RAW_LINE_CAP).map((r) => ({
      date: iso(r.soldAt), fy: r.fy, farmer: r.farmer, phone: r.phone, village: r.village,
      store: r.store ? shortStore(r.store) : null, orderNo: r.orderNo, item: r.item, category: r.category,
      crop: r.crop ? cropLabel(r.crop) : null, qty: num(r.qty), uom: r.uom, base: Number(r.base ?? 0),
    })),
    capped: rows.length > RAW_LINE_CAP,
  };
}

/* ── Export the workbench Segment × Store table + the full filtered farmer list to Excel ── */
const LINE_EXPORT_CAP = 100000; // sale-line list cap (biggest lines by value kept when it fires)

export async function exportWorkbookXlsx(f: WbFilters): Promise<{ ok: boolean; filename?: string; b64?: string; error?: string }> {
  const scoped = await scopeFilters(f);
  if (scoped === "none") return { ok: false, error: "No store or region is assigned to your account." };
  const cte = tiersCte(scoped), tf = tierFilter(scoped);
  // Line-level filters for the by-line sheet: same crop + FY as the numbers (so ₹ reconciles).
  const cropLine = scoped.crops?.length ? Prisma.sql`AND sl."cropTag" = ANY(${scoped.crops}::text[])` : Prisma.empty;
  const fyLine = scoped.fyStarts?.length ? Prisma.sql`AND ${fyBounds(scoped.fyStarts).window("sl")}` : Prisma.empty;

  const [cross, stores, lineRows] = await Promise.all([
    prisma.$queryRaw<{ storeId: number | null; vseg: string; lseg: string; n: number }[]>(Prisma.sql`
      WITH ${cte} SELECT "storeId", vseg, lseg, COUNT(*)::int n FROM tiers WHERE ${tf} GROUP BY 1,2,3`),
    prisma.store.findMany({ select: { id: true, name: true } }),
    prisma.$queryRaw<{ orderNo: string; soldAt: Date | null; fy: string | null; name: string; mobile: string | null; zone: string | null; storeId: number | null; itemRaw: string; cropTag: string | null; mainCategory: string | null; qty: number; uom: string | null; basic: number; vseg: string | null; lseg: string | null }[]>(Prisma.sql`
      WITH ${cte}
      SELECT sl."orderNo" "orderNo", sl."soldAt" "soldAt", sl."financialYear" fy, f.name, f.mobile, f."zone" AS zone, sl."storeId" AS "storeId",
        sl."itemRaw" "itemRaw", sl."cropTag" "cropTag", sl."mainCategory" "mainCategory", sl.qty, sl.uom, sl."basic" basic, t.vseg, t.lseg
      FROM tiers t JOIN "Farmer" f ON f.id=t.id
        JOIN "SaleLine" sl ON sl."farmerId" = t.id AND sl.source='REAL'
      WHERE ${tf} ${cropLine} ${fyLine}
      ORDER BY sl."basic" DESC NULLS LAST LIMIT ${LINE_EXPORT_CAP}`),
  ]);

  const nameById = new Map(stores.map((s) => [s.id, shortStore(s.name)]));
  const V = [...VALUE_SEGMENTS], L = [...LIFECYCLE_SEGMENTS];
  // Full Value × Lifecycle per store (3 tiers × 4 lifecycle stages), matching the on-screen Detailed view.
  const byStore = new Map<number | null, { cross: Record<string, Record<string, number>>; total: number }>();
  const grandCross: Record<string, Record<string, number>> = {};
  let grand = 0;
  for (const r of cross) {
    const cnt = num(r.n);
    const st = byStore.get(r.storeId) ?? { cross: {}, total: 0 };
    (st.cross[r.vseg] ??= {})[r.lseg] = (st.cross[r.vseg]?.[r.lseg] ?? 0) + cnt; st.total += cnt;
    byStore.set(r.storeId, st);
    (grandCross[r.vseg] ??= {})[r.lseg] = (grandCross[r.vseg]?.[r.lseg] ?? 0) + cnt; grand += cnt;
  }
  const rows = [...byStore.entries()].map(([storeId, s]) => ({
    storeName: storeId == null ? "Unassigned" : nameById.get(storeId) ?? `Store #${storeId}`, ...s,
  })).sort((a, b) => b.total - a.total).slice(0, 100);

  // Two-row grouped header: each Value group spans its Lifecycle sub-columns (merged), like the UI.
  const nSub = L.length, totalCol = 1 + V.length * nSub;
  const groupHeader: (string | number)[] = ["Store", ...V.flatMap((v) => [segMeta(v).label, ...Array(nSub - 1).fill("")]), "Total"];
  const subHeader: (string | number)[] = ["", ...V.flatMap(() => L.map((l) => segMeta(l).label)), ""];
  const flatCross = (c: Record<string, Record<string, number>>) => V.flatMap((v) => L.map((l) => c[v]?.[l] ?? 0));
  const mergedSheet: (string | number)[][] = [
    groupHeader, subHeader,
    ["All stores", ...flatCross(grandCross), grand],
    ...rows.map((r) => [r.storeName, ...flatCross(r.cross), r.total]),
  ];
  const mergedSheetMerges = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // "Store" spans both header rows
    ...V.map((_, gi) => ({ s: { r: 0, c: 1 + gi * nSub }, e: { r: 0, c: 1 + gi * nSub + nSub - 1 } })), // each value group
    { s: { r: 0, c: totalCol }, e: { r: 1, c: totalCol } }, // "Total" spans both header rows
  ];
  const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  // ── By sales-line sheet: one row per matching SaleLine (crop + FY filters applied at line level). ──
  const lineSheet: (string | number)[][] = [
    ["Order No", "Date", "Financial year", "Farmer", "Mobile", "Store", "Region", "Item", "Crop", "Category", "Qty", "UOM", "Base value (₹)", "Value segment", "Lifecycle"],
    ...lineRows.map((r) => [
      r.orderNo ?? "", isoDate(r.soldAt), r.fy ?? "", r.name, r.mobile ?? "", r.storeId != null ? nameById.get(r.storeId) ?? "" : "", r.zone ?? "",
      r.itemRaw, r.cropTag ? cropLabel(r.cropTag) : "—", r.mainCategory ?? "", Number(r.qty ?? 0), r.uom ?? "", Number(r.basic ?? 0),
      r.vseg ? segMeta(r.vseg).label : "—", r.lseg ? segMeta(r.lseg).label : "—",
    ]),
  ];
  if (lineRows.length >= LINE_EXPORT_CAP) {
    lineSheet.push([`Note: list capped at ${LINE_EXPORT_CAP.toLocaleString("en-IN")} lines (by line value). Narrow the filters for a complete set.`]);
  }

  // ── "Filters applied" sheet — the effective (scope-enforced) filters behind this export. ──
  const fyLbl = (y: number) => `FY ${y}–${String((y + 1) % 100).padStart(2, "0")}`;
  const listOf = <T,>(arr: T[] | undefined, fn: (x: T) => string, none: string) => (arr?.length ? arr.map(fn).join(", ") : none);
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const filtersSheet: (string | number)[][] = [
    ["Filter", "Applied"],
    ["Lens", scoped.lens === "visit" ? "Visits" : "Sales"],
    ["Financial year(s)", listOf(scoped.fyStarts, fyLbl, "All FYs (all-time spend)")],
    ["Stores", listOf(scoped.storeIds, (id) => nameById.get(id) ?? `#${id}`, "All stores")],
    ["Regions / zones", listOf(scoped.zones, (z) => String(z), "All regions")],
    ["Crops", listOf(scoped.crops, cropLabel, "All crops")],
    ["Pests / diseases", listOf(scoped.pests, tagLabel, "All")],
    ["Value segment", listOf(scoped.valueSegments, (s) => segMeta(s).label, "All")],
    ["Lifecycle", listOf(scoped.lifecycleSegments, (s) => segMeta(s).label, "All")],
    ["Spend tier (FY)", listOf(scoped.spendTiers, (i) => SPEND_TIERS[i]?.label ?? String(i), "Any spend")],
    ["", ""],
    ["Stores in matrix", rows.length],
    ["Farmers (filtered)", grand],
    ["Sales lines in file", lineRows.length],
    ["Exported (UTC)", now],
  ];

  const b64 = buildWorkbookB64([
    { name: "Value x Lifecycle x Store", rows: mergedSheet, merges: mergedSheetMerges },
    { name: "Sales lines", rows: lineSheet },
    { name: "Filters applied", rows: filtersSheet },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return { ok: true, filename: `analytics-segments-${today}.xlsx`, b64 };
}

/* ── Crop purchase trend: monthly ₹ for one crop (per-line crop from the master file) ── */
export interface CropTrendPoint {
  ym: string; // "2025-06"
  label: string; // "Jun"
  year: number;
  season: "Kharif" | "Rabi" | "Zaid";
  revenue: number; // ₹ (line totals)
  lines: number; // sale lines
}

/** Monthly purchase trend (SaleLine), role-scoped. No crop → every crop's sale lines combined. */
export async function getCropTrend(crops: string[]): Promise<CropTrendPoint[]> {
  const safe = (crops ?? []).map((c) => (c || "").toLowerCase().replace(/[^a-z_]/g, "")).filter(Boolean);
  const { role, storeId, managedStoreIds } = await getScope();
  if (role === "campaigner") return []; // call team has no sales-trend access — fail closed
  const scopeSql: Prisma.Sql =
    role === "officer"
      ? storeId != null ? Prisma.sql`AND sl."storeId" = ${storeId}` : Prisma.sql`AND false`
      : role === "regional"
        ? managedStoreIds && managedStoreIds.length
          ? Prisma.sql`AND sl."storeId" = ANY(${managedStoreIds})`
          : Prisma.sql`AND false`
        : Prisma.empty;
  const cropCond = safe.length ? Prisma.sql`sl."cropTag" = ANY(${safe}) AND ` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ ym: string; rev: number; lines: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('month', sl."soldAt"), 'YYYY-MM') ym,
           COALESCE(SUM(sl."basic"), 0)::float rev, COUNT(*)::int lines
    FROM "SaleLine" sl
    WHERE ${cropCond}sl."soldAt" IS NOT NULL ${scopeSql}
    GROUP BY 1 ORDER BY 1`);
  if (!rows.length) return [];

  // Continuous timeline: fill month gaps between the first and last sale with zeros.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const byYm = new Map(rows.map((r) => [r.ym, r]));
  const [fy, fm] = rows[0].ym.split("-").map(Number);
  const [ly, lm] = rows[rows.length - 1].ym.split("-").map(Number);
  const out: CropTrendPoint[] = [];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? (y++, m = 1) : m++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const r = byYm.get(ym);
    // North-India cropping seasons: Kharif Jun–Oct · Rabi Nov–Mar · Zaid Apr–May.
    const season: CropTrendPoint["season"] = m >= 6 && m <= 10 ? "Kharif" : m === 4 || m === 5 ? "Zaid" : "Rabi";
    out.push({ ym, label: MONTHS[m - 1], year: y, season, revenue: Math.round(num(r?.rev)), lines: num(r?.lines) });
  }
  return out;
}

/* ── Lead → customer conversions (wasLead flag), role-scoped, broken down by month + store ── */
export interface LeadConversions {
  total: number;         // converted (wasLead = true)
  currentLeads: number;  // still open leads (lifecycleSegment = LEAD) — the not-yet-converted
  byMonth: { ym: string; label: string; n: number }[];
  byStore: { store: string; n: number }[];
}
export async function getLeadConversions(): Promise<LeadConversions> {
  const { role, storeId, managedStoreIds } = await getScope();
  if (role === "campaigner") return { total: 0, currentLeads: 0, byMonth: [], byStore: [] };
  const scope: Prisma.Sql =
    role === "officer"
      ? storeId != null ? Prisma.sql`AND f."storeId" = ${storeId}` : Prisma.sql`AND false`
      : role === "regional"
        ? managedStoreIds && managedStoreIds.length ? Prisma.sql`AND f."storeId" = ANY(${managedStoreIds})` : Prisma.sql`AND false`
        : Prisma.empty;
  const base = Prisma.sql`FROM "Farmer" f WHERE f."wasLead" = true ${scope}`;
  const [monthRows, storeRows, totalRows, currentRows] = await Promise.all([
    prisma.$queryRaw<{ ym: string; n: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', f."leadConvertedAt"), 'YYYY-MM') ym, COUNT(*)::int n
      ${base} AND f."leadConvertedAt" IS NOT NULL GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<{ storeId: number | null; n: number }[]>(Prisma.sql`
      SELECT f."storeId" "storeId", COUNT(*)::int n ${base} GROUP BY 1 ORDER BY 2 DESC LIMIT 40`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int n ${base}`),
    // Still-open leads (not yet converted) in the same scope → the conversion-rate denominator.
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int n FROM "Farmer" f WHERE f."lifecycleSegment" = 'LEAD' ${scope}`),
  ]);
  const ids = storeRows.map((r) => r.storeId).filter((x): x is number => x != null);
  const stores = ids.length ? await prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(stores.map((s) => [s.id, shortStore(s.name)]));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    total: num(totalRows[0]?.n),
    currentLeads: num(currentRows[0]?.n),
    byMonth: monthRows.map((r) => { const [y, m] = r.ym.split("-"); return { ym: r.ym, label: `${MONTHS[Number(m) - 1]} '${y.slice(2)}`, n: num(r.n) }; }),
    byStore: storeRows.map((r) => ({ store: r.storeId != null ? (nameById.get(r.storeId) ?? `Store #${r.storeId}`) : "Unassigned", n: num(r.n) })),
  };
}

/* ── Save the current filter as a live dynamic segment ── */
export async function saveWorkbenchSegment(f: WbFilters, name: string): Promise<{ ok: boolean; id?: number; error?: string }> {
  const scoped = await scopeFilters(f);
  if (scoped === "none") return { ok: false, error: "No store or region is assigned to your account." };
  f = scoped; // saved segment inherits the officer's store / RM's region
  const tier = f.lens === "sales" && f.spendTiers?.length ? SPEND_TIERS[f.spendTiers[0]] : undefined;
  const criteria: ClusterCriteria = {
    storeIds: f.storeIds?.length ? f.storeIds : undefined,
    zones: f.zones?.length ? f.zones : undefined,
    valueSegments: f.valueSegments?.length ? f.valueSegments : undefined,
    lifecycleSegments: f.lifecycleSegments?.length ? f.lifecycleSegments : undefined,
    salesCrops: f.lens === "sales" && f.crops?.length ? f.crops : undefined,
    visitCrops: f.lens === "visit" && f.crops?.length ? f.crops : undefined,
    pestTags: f.pests?.length ? f.pests : undefined,
    visitProblem: f.lens === "visit" && f.problems?.length ? f.problems[0] : undefined,
    spendMin: tier?.min, spendMax: tier?.max,
  };
  return createClusterFromCriteria({ name, criteria, origin: "analytics", mode: "dynamic" });
}
