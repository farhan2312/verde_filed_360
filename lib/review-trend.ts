import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getReviewSettings } from "@/lib/review-settings";
import { addDaysYmd, lastCompletedWeek, listReportRms, weekFromStart } from "@/lib/weekly-report";

/**
 * Review-completion trend (P1): per RM, per reporting week, over the last N completed weeks. Computed
 * LIVE from visits (not from stored WeeklyReport rows) so it's meaningful from day one. "Within SLA" is
 * stable history (first-review time never moves); "reviewed" is as of now.
 */

export interface TrendCell { visits: number; reviewed: number; withinSla: number }
export interface TrendRow { userId: number; name: string; cells: TrendCell[]; total: TrendCell }
export interface TrendData { weeks: { ymd: string; label: string; short: string }[]; rows: TrendRow[]; overall: TrendCell[]; slaHours: number }

const empty = (): TrendCell => ({ visits: 0, reviewed: 0, withinSla: 0 });
const add = (a: TrendCell, b: TrendCell) => { a.visits += b.visits; a.reviewed += b.reviewed; a.withinSla += b.withinSla; };

export async function getReviewTrend(opts: { weeks?: number; onlyUserId?: number } = {}): Promise<TrendData> {
  const n = Math.min(Math.max(opts.weeks ?? 12, 4), 26);
  const s = await getReviewSettings();
  const last = lastCompletedWeek(new Date(), s.weekStartDay);
  const firstYmd = addDaysYmd(last.startYmd, -7 * (n - 1));
  const weeks = Array.from({ length: n }, (_, i) => {
    const w = weekFromStart(addDaysYmd(firstYmd, 7 * i));
    const short = new Date(`${w.startYmd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return { ymd: w.startYmd, label: w.label, short };
  });
  const start = weekFromStart(firstYmd).start;
  const end = last.end;

  // One grouped scan: effective store (visit's own, else its farmer's) × week index.
  const agg = await prisma.$queryRaw<{ sid: number | null; wk: number; visits: number; reviewed: number; within: number }[]>(Prisma.sql`
    SELECT COALESCE(v."storeId", f."storeId") AS sid,
           ((((COALESCE(v."visitedAt", v."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date - ${firstYmd}::date) / 7)::int AS wk,
           COUNT(*)::int AS visits,
           COUNT(*) FILTER (WHERE v."reviewedAt" IS NOT NULL)::int AS reviewed,
           COUNT(*) FILTER (WHERE v."reviewedAt" IS NOT NULL
             AND COALESCE(v."firstReviewedAt", v."reviewedAt") - v."createdAt" <= make_interval(hours => ${s.slaHours}::int))::int AS within
    FROM "Visit" v LEFT JOIN "Farmer" f ON f.id = v."farmerId"
    WHERE COALESCE(v."visitedAt", v."createdAt") >= ${start} AND COALESCE(v."visitedAt", v."createdAt") < ${end}
    GROUP BY 1, 2`);

  const rms = (await listReportRms()).filter((r) => opts.onlyUserId == null || r.userId === opts.onlyUserId);
  // A Verde store can have SEVERAL managers, so a store maps to a LIST of RM user ids and its visits
  // count in every one of their rows — grouping by the `regionalManager` label would be wrong here.
  const rmsOfStore = new Map<number, number[]>();
  for (const r of rms) for (const id of r.storeIds) (rmsOfStore.get(id) ?? rmsOfStore.set(id, []).get(id)!).push(r.userId);
  const rows = new Map<number, TrendRow>(rms.map((r) => [r.userId, { userId: r.userId, name: r.name, cells: weeks.map(empty), total: empty() }]));
  const overall = weeks.map(empty);

  for (const a of agg) {
    if (a.wk < 0 || a.wk >= n) continue;
    const c = { visits: a.visits, reviewed: a.reviewed, withinSla: a.within };
    const owners = (a.sid != null ? rmsOfStore.get(a.sid) : undefined) ?? [];
    for (const uid of owners) { const row = rows.get(uid)!; add(row.cells[a.wk], c); add(row.total, c); }
    // "All regions" = every visit for admins; for a single RM, just their stores. Counted ONCE per
    // store so a two-manager store never inflates the all-regions line.
    if (opts.onlyUserId == null || owners.length) add(overall[a.wk], c);
  }
  return { weeks, rows: [...rows.values()].sort((x, y) => x.name.localeCompare(y.name)), overall, slaHours: s.slaHours };
}
