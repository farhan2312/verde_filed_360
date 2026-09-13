import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SEGMENT_ENUM_TO_LABEL, type SegmentLabel } from "@/lib/segments";

/**
 * Cross-request cached aggregates.
 *
 * These figures are global (identical for every user, independent of table
 * filters), so recomputing them on every navigation is pure waste. Each is
 * wrapped in `unstable_cache` with a short revalidate window + a tag so writes
 * (see `revalidateStats`) can bust it on demand.
 */

export const STATS_TAG = "global-stats";
const REVALIDATE_SECONDS = 120;

export interface SegmentSummary {
  /** farmer count per segment label */
  countByLabel: Partial<Record<SegmentLabel, number>>;
  /** lifetime sale revenue (₹) per segment label */
  revByLabel: Partial<Record<SegmentLabel, number>>;
  /** total registered farmers */
  registeredTotal: number;
}

/**
 * Segment summary cards data: farmer counts + lifetime revenue per segment.
 *
 * Revenue is a single SQL JOIN aggregation (≤4 rows) instead of the previous
 * `sale.groupBy` that scanned all ~209k sales and shipped ~88k grouped sums to
 * Node to be bucketed in JS (~1.7s → ~50ms).
 */
export const getSegmentSummary = unstable_cache(
  async (): Promise<SegmentSummary> => {
    const [counts, revenue, registeredTotal] = await Promise.all([
      prisma.farmer.groupBy({ by: ["segment"], _count: { _all: true } }),
      prisma.$queryRaw<{ segment: string | null; rev: bigint }[]>`
        SELECT f.segment::text AS segment, COALESCE(SUM(s."amountNum"), 0)::bigint AS rev
        FROM "Farmer" f
        JOIN "Sale" s ON s."farmerId" = f.id
        WHERE f.segment IS NOT NULL
        GROUP BY f.segment`,
      prisma.farmer.count(),
    ]);

    const countByLabel: Partial<Record<SegmentLabel, number>> = {};
    for (const c of counts) {
      if (!c.segment) continue;
      const label = SEGMENT_ENUM_TO_LABEL[c.segment];
      if (label) countByLabel[label] = c._count._all;
    }
    const revByLabel: Partial<Record<SegmentLabel, number>> = {};
    for (const r of revenue) {
      if (!r.segment) continue;
      const label = SEGMENT_ENUM_TO_LABEL[r.segment];
      if (label) revByLabel[label] = Number(r.rev);
    }
    return { countByLabel, revByLabel, registeredTotal };
  },
  ["farmers-segment-summary"],
  { revalidate: REVALIDATE_SECONDS, tags: [STATS_TAG] },
);

export interface HeaderCounts {
  farmers: number;
  activeUsers: number;
  projects: number;
  activeProjects: number;
}

const FALLBACK_COUNTS: HeaderCounts = {
  farmers: 1284,
  activeUsers: 5,
  projects: 5,
  activeProjects: 2,
};

/**
 * Sidebar/header counts — run on every page via the app layout. Cached so a
 * `farmer.count()` over 88k rows (plus 3 more counts) isn't re-issued on every
 * single navigation.
 */
export const getHeaderCounts = unstable_cache(
  async (): Promise<HeaderCounts> => {
    try {
      const [farmers, activeUsers, projects, activeProjects] = await Promise.all([
        prisma.farmer.count(),
        prisma.user.count({ where: { active: true, approvalStatus: "APPROVED" } }),
        prisma.project.count(),
        prisma.project.count({ where: { status: "ACTIVE" } }),
      ]);
      return { farmers, activeUsers, projects, activeProjects };
    } catch {
      return FALLBACK_COUNTS;
    }
  },
  ["header-counts"],
  { revalidate: REVALIDATE_SECONDS, tags: [STATS_TAG] },
);

/**
 * Global crop / pest facet lists (farmer counts per tag). These are full-table `unnest`
 * aggregates over the ~130k farmers — heavy to recompute on every farmers/clusters load, yet
 * they only change when data is imported. Cached + tag-busted like the counts above. Officers/RMs
 * still run a small live scoped query (their store/region is fast); only the unscoped case is cached.
 */
export const getGlobalCropFacet = unstable_cache(
  async (): Promise<{ crop: string; count: number }[]> => {
    try {
      const rows = await prisma.$queryRawUnsafe<{ crop: string; n: number }[]>(
        `SELECT unnest("cropTags") crop, COUNT(*)::int n FROM "Farmer" GROUP BY 1 ORDER BY 2 DESC LIMIT 40`);
      return rows.map((r) => ({ crop: r.crop, count: Number(r.n) }));
    } catch { return []; }
  },
  ["global-crop-facet"],
  { revalidate: REVALIDATE_SECONDS, tags: [STATS_TAG] },
);

export const getGlobalPestFacet = unstable_cache(
  async (): Promise<{ pest: string; count: number }[]> => {
    try {
      const rows = await prisma.$queryRawUnsafe<{ pest: string; n: number }[]>(
        `SELECT unnest("pestTags") pest, COUNT(*)::int n FROM "Farmer" GROUP BY 1 ORDER BY 2 DESC LIMIT 60`);
      return rows.map((r) => ({ pest: r.pest, count: Number(r.n) }));
    } catch { return []; }
  },
  ["global-pest-facet"],
  { revalidate: REVALIDATE_SECONDS, tags: [STATS_TAG] },
);
