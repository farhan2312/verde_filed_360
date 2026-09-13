"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getScope, storeScopeWhere } from "@/lib/scope";

/**
 * Performance analytics — the Stores / RMs / Agri-Officers leaderboards.
 *
 * One store-keyed metric bundle (sales + growth, visits + review status, actions/follow-ups,
 * leads + conversion, farmers) is computed in the DB, then rolled up to whichever axis the tab
 * asks for. Everyone is store-scoped: officer → own store, RM → managed stores, admin → all.
 * The officer axis is keyed by name (visits.officerName / actions.createdByName), since sales and
 * leads don't carry an officer — those columns stay 0 there and the UI leans on field activity.
 */

export type PerfKind = "stores" | "rms" | "officers";

export interface PerfRange {
  from?: string;      // ISO — inclusive window start (undefined = all time)
  to?: string;        // ISO — exclusive window end
  prevFrom?: string;  // ISO — previous comparison window (for growth); undefined = no comparison
  prevTo?: string;
  storeTags?: number[]; // store-tag ids — restrict to stores carrying ANY of these
  label?: string;     // display label of the chosen range (for the UI, echoed back)
}

export interface PerfEntity {
  id: string;
  name: string;
  sub: string;                 // secondary line (store → district · RM; rm → N stores; officer → store)
  sales: number;               // ₹ pre-tax (SaleLine.basic) in the window
  salesPrev: number;           // same in the previous window
  salesGrowthPct: number | null; // % change vs previous window (null when no comparison / no prior sales)
  visits: number;
  visitsReviewed: number;
  visitsPending: number;       // visits − reviewed (in-window)
  farmersVisited: number;
  actionsOpen: number;
  actionsOverdue: number;      // OPEN & past due (point-in-time)
  actionsUpcoming: number;     // OPEN & due in future (point-in-time)
  actionsDone: number;         // DONE & completed in-window
  leadsConverted: number;      // wasLead & converted in-window
  currentLeads: number;        // active LEAD farmers (point-in-time)
  farmers: number;             // registered REAL farmers (point-in-time)
  storeCount?: number;         // rms only — how many stores roll up here
}

export interface PerfTotals {
  entities: number;
  sales: number;
  salesPrev: number;
  salesGrowthPct: number | null;
  visits: number;
  visitsReviewed: number;
  actionsOpen: number;
  actionsOverdue: number;
  leadsConverted: number;
  currentLeads: number;
  farmers: number;
}

export interface PerfData {
  kind: PerfKind;
  rows: PerfEntity[];
  totals: PerfTotals;
  hasComparison: boolean;
  rangeLabel: string;
}

const num = (x: unknown) => (x == null ? 0 : Number(x));
const growth = (cur: number, prev: number): number | null =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null;

/** Resolve the scoped store-id set: number[] to restrict, or null for "all stores" (admins). */
async function scopedStoreIds(storeTags?: number[]): Promise<number[] | null | "none"> {
  const scope = await getScope();
  const where = storeScopeWhere(scope);
  if (where === "none") return "none";

  // Tag filter (and/or the admin "all" case) → materialise the id list.
  const cond: Prisma.StoreWhereInput = {};
  if (where && where !== null) Object.assign(cond, where);
  if (storeTags?.length) cond.tagIds = { hasSome: storeTags };
  if (!where && !storeTags?.length) return null; // admin, no tag filter → all stores

  const stores = await prisma.store.findMany({ where: cond, select: { id: true } });
  return stores.map((s) => s.id);
}

const D = (s?: string) => (s ? new Date(s) : null);

export async function getPerformance(kind: PerfKind, range: PerfRange = {}): Promise<PerfData> {
  const ids = await scopedStoreIds(range.storeTags);
  const empty: PerfData = {
    kind, rows: [],
    totals: { entities: 0, sales: 0, salesPrev: 0, salesGrowthPct: null, visits: 0, visitsReviewed: 0, actionsOpen: 0, actionsOverdue: 0, leadsConverted: 0, currentLeads: 0, farmers: 0 },
    hasComparison: !!(range.prevFrom && range.prevTo), rangeLabel: range.label ?? "All time",
  };
  if (ids === "none") return empty;

  const from = D(range.from), to = D(range.to), pFrom = D(range.prevFrom), pTo = D(range.prevTo);
  const hasWin = !!(from && to);
  const hasPrev = !!(pFrom && pTo);
  const now = new Date();

  // Scope predicate applied to whichever store column each query exposes.
  const storeIn = (expr: Prisma.Sql) =>
    ids === null ? Prisma.sql`TRUE` : ids.length ? Prisma.sql`${expr} IN (${Prisma.join(ids)})` : Prisma.sql`FALSE`;

  const curWin = (c: Prisma.Sql) => (hasWin ? Prisma.sql`${c} >= ${from} AND ${c} < ${to}` : Prisma.sql`${c} IS NOT NULL`);
  const prevWin = (c: Prisma.Sql) => (hasPrev ? Prisma.sql`${c} >= ${pFrom} AND ${c} < ${pTo}` : Prisma.sql`FALSE`);

  try {
    if (kind === "officers") return await officerBoard({ ids, storeIn, curWin, from, to, now, range, empty });
    return await storeAxisBoard({ kind, ids, storeIn, curWin, prevWin, from, to, now, range, empty });
  } catch {
    return empty;
  }
}

/* ── store-keyed board: powers both the Stores tab and (rolled up) the RMs tab ── */
async function storeAxisBoard(a: {
  kind: PerfKind; ids: number[] | null; storeIn: (e: Prisma.Sql) => Prisma.Sql;
  curWin: (c: Prisma.Sql) => Prisma.Sql; prevWin: (c: Prisma.Sql) => Prisma.Sql;
  from: Date | null; to: Date | null; now: Date; range: PerfRange; empty: PerfData;
}): Promise<PerfData> {
  const { kind, ids, storeIn, curWin, prevWin, now, empty } = a;
  const SID = Prisma.raw(`sl."storeId"`);
  const VSID = Prisma.raw(`COALESCE(v."storeId", f."storeId")`);
  const ASID = Prisma.raw(`a."storeId"`);
  const FSID = Prisma.raw(`f."storeId"`);

  const [meta, sales, visits, actions, leads] = await Promise.all([
    prisma.store.findMany({
      where: ids === null ? undefined : { id: { in: ids.length ? ids : [-1] } },
      select: { id: true, name: true, zone: true, regionalManager: true },
    }),
    prisma.$queryRaw<{ sid: number; cur: bigint; prev: bigint }[]>(Prisma.sql`
      SELECT sl."storeId" sid,
        COALESCE(SUM(sl."basic") FILTER (WHERE ${curWin(Prisma.raw(`sl."soldAt"`))}), 0)::bigint cur,
        COALESCE(SUM(sl."basic") FILTER (WHERE ${prevWin(Prisma.raw(`sl."soldAt"`))}), 0)::bigint prev
      FROM "SaleLine" sl
      WHERE sl.source = 'REAL' AND sl."storeId" IS NOT NULL AND ${storeIn(SID)}
      GROUP BY 1`),
    prisma.$queryRaw<{ sid: number; visits: number; reviewed: number; fv: number }[]>(Prisma.sql`
      SELECT ${VSID} sid,
        COUNT(*)::int visits,
        COUNT(*) FILTER (WHERE v."reviewedAt" IS NOT NULL)::int reviewed,
        COUNT(DISTINCT v."farmerId")::int fv
      FROM "Visit" v LEFT JOIN "Farmer" f ON f.id = v."farmerId"
      WHERE ${curWin(Prisma.raw(`COALESCE(v."visitedAt", v."createdAt")`))}
        AND ${VSID} IS NOT NULL AND ${storeIn(VSID)}
      GROUP BY 1`),
    prisma.$queryRaw<{ sid: number; opn: number; overdue: number; upcoming: number; done: number }[]>(Prisma.sql`
      SELECT a."storeId" sid,
        COUNT(*) FILTER (WHERE a.status = 'OPEN')::int opn,
        COUNT(*) FILTER (WHERE a.status = 'OPEN' AND a."dueDate" < ${now})::int overdue,
        COUNT(*) FILTER (WHERE a.status = 'OPEN' AND a."dueDate" >= ${now})::int upcoming,
        COUNT(*) FILTER (WHERE a.status = 'DONE' AND ${curWin(Prisma.raw(`a."completedAt"`))})::int done
      FROM "Action" a
      WHERE a."storeId" IS NOT NULL AND ${storeIn(ASID)}
      GROUP BY 1`),
    prisma.$queryRaw<{ sid: number; farmers: number; leads: number; converted: number }[]>(Prisma.sql`
      SELECT f."storeId" sid,
        COUNT(*)::int farmers,
        COUNT(*) FILTER (WHERE f."lifecycleSegment" = 'LEAD')::int leads,
        COUNT(*) FILTER (WHERE f."wasLead" = true AND ${curWin(Prisma.raw(`f."leadConvertedAt"`))})::int converted
      FROM "Farmer" f
      WHERE f.source = 'REAL' AND f."storeId" IS NOT NULL AND ${storeIn(FSID)}
      GROUP BY 1`),
  ]);

  const sMap = new Map(sales.map((r) => [r.sid, r]));
  const vMap = new Map(visits.map((r) => [r.sid, r]));
  const aMap = new Map(actions.map((r) => [r.sid, r]));
  const lMap = new Map(leads.map((r) => [r.sid, r]));

  const shortStore = (s: string) => s.replace(/\s*\(.*?\)\s*/g, "").trim() || s;

  const storeRows: (PerfEntity & { rm: string })[] = meta.map((st) => {
    const s = sMap.get(st.id), v = vMap.get(st.id), ac = aMap.get(st.id), l = lMap.get(st.id);
    const sales = num(s?.cur), salesPrev = num(s?.prev);
    const visits = num(v?.visits), reviewed = num(v?.reviewed);
    const rm = (st.regionalManager ?? "").trim();
    return {
      id: String(st.id), name: shortStore(st.name),
      sub: [st.zone, rm && `RM: ${rm}`].filter(Boolean).join(" · ") || "—",
      rm,
      sales, salesPrev, salesGrowthPct: growth(sales, salesPrev),
      visits, visitsReviewed: reviewed, visitsPending: Math.max(0, visits - reviewed), farmersVisited: num(v?.fv),
      actionsOpen: num(ac?.opn), actionsOverdue: num(ac?.overdue), actionsUpcoming: num(ac?.upcoming), actionsDone: num(ac?.done),
      leadsConverted: num(l?.converted), currentLeads: num(l?.leads), farmers: num(l?.farmers),
    };
  });

  let rows: PerfEntity[];
  if (kind === "stores") {
    rows = storeRows.map(({ rm: _rm, ...r }) => r);
  } else {
    // Roll stores up to their regional manager.
    const byRm = new Map<string, (PerfEntity & { rm: string })[]>();
    for (const r of storeRows) {
      const key = r.rm || "— Unassigned";
      (byRm.get(key) ?? byRm.set(key, []).get(key)!).push(r);
    }
    rows = [...byRm.entries()].map(([rm, list]) => {
      const sum = (f: (x: PerfEntity) => number) => list.reduce((t, x) => t + f(x), 0);
      const sales = sum((x) => x.sales), salesPrev = sum((x) => x.salesPrev);
      const visits = sum((x) => x.visits), reviewed = sum((x) => x.visitsReviewed);
      return {
        id: rm, name: rm, sub: `${list.length} store${list.length === 1 ? "" : "s"}`, storeCount: list.length,
        sales, salesPrev, salesGrowthPct: growth(sales, salesPrev),
        visits, visitsReviewed: reviewed, visitsPending: Math.max(0, visits - reviewed), farmersVisited: sum((x) => x.farmersVisited),
        actionsOpen: sum((x) => x.actionsOpen), actionsOverdue: sum((x) => x.actionsOverdue), actionsUpcoming: sum((x) => x.actionsUpcoming), actionsDone: sum((x) => x.actionsDone),
        leadsConverted: sum((x) => x.leadsConverted), currentLeads: sum((x) => x.currentLeads), farmers: sum((x) => x.farmers),
      };
    });
  }

  return finalize(kind, rows, empty);
}

/* ── officer-keyed board: visits + actions by person (sales/leads don't carry an officer) ── */
async function officerBoard(a: {
  ids: number[] | null; storeIn: (e: Prisma.Sql) => Prisma.Sql;
  curWin: (c: Prisma.Sql) => Prisma.Sql; from: Date | null; to: Date | null; now: Date; range: PerfRange; empty: PerfData;
}): Promise<PerfData> {
  const { storeIn, curWin, now, empty } = a;
  const VSID = Prisma.raw(`COALESCE(v."storeId", f."storeId")`);

  const [visits, actions] = await Promise.all([
    prisma.$queryRaw<{ nm: string; store: string | null; visits: number; reviewed: number; fv: number }[]>(Prisma.sql`
      SELECT TRIM(v."officerName") nm,
        (ARRAY_AGG(st.name ORDER BY st.name))[1] store,
        COUNT(*)::int visits,
        COUNT(*) FILTER (WHERE v."reviewedAt" IS NOT NULL)::int reviewed,
        COUNT(DISTINCT v."farmerId")::int fv
      FROM "Visit" v
      LEFT JOIN "Farmer" f ON f.id = v."farmerId"
      LEFT JOIN "Store" st ON st.id = ${VSID}
      WHERE v."officerName" IS NOT NULL AND TRIM(v."officerName") <> ''
        AND ${curWin(Prisma.raw(`COALESCE(v."visitedAt", v."createdAt")`))}
        AND ${VSID} IS NOT NULL AND ${storeIn(VSID)}
      GROUP BY 1`),
    prisma.$queryRaw<{ nm: string; opn: number; overdue: number; upcoming: number; done: number }[]>(Prisma.sql`
      SELECT TRIM(a."createdByName") nm,
        COUNT(*) FILTER (WHERE a.status = 'OPEN')::int opn,
        COUNT(*) FILTER (WHERE a.status = 'OPEN' AND a."dueDate" < ${now})::int overdue,
        COUNT(*) FILTER (WHERE a.status = 'OPEN' AND a."dueDate" >= ${now})::int upcoming,
        COUNT(*) FILTER (WHERE a.status = 'DONE' AND ${curWin(Prisma.raw(`a."completedAt"`))})::int done
      FROM "Action" a
      WHERE a."createdByName" IS NOT NULL AND TRIM(a."createdByName") <> '' AND a."storeId" IS NOT NULL AND ${storeIn(Prisma.raw(`a."storeId"`))}
      GROUP BY 1`),
  ]);

  const shortStore = (s: string) => s.replace(/\s*\(.*?\)\s*/g, "").trim() || s;
  const map = new Map<string, PerfEntity>();
  const get = (nm: string, store?: string | null): PerfEntity => {
    const key = nm.trim();
    let e = map.get(key);
    if (!e) {
      e = { id: key, name: key, sub: store ? shortStore(store) : "—",
        sales: 0, salesPrev: 0, salesGrowthPct: null, visits: 0, visitsReviewed: 0, visitsPending: 0, farmersVisited: 0,
        actionsOpen: 0, actionsOverdue: 0, actionsUpcoming: 0, actionsDone: 0, leadsConverted: 0, currentLeads: 0, farmers: 0 };
      map.set(key, e);
    } else if (e.sub === "—" && store) e.sub = shortStore(store);
    return e;
  };

  for (const v of visits) {
    const e = get(v.nm, v.store);
    e.visits = num(v.visits); e.visitsReviewed = num(v.reviewed);
    e.visitsPending = Math.max(0, e.visits - e.visitsReviewed); e.farmersVisited = num(v.fv);
  }
  for (const ac of actions) {
    const e = get(ac.nm);
    e.actionsOpen = num(ac.opn); e.actionsOverdue = num(ac.overdue); e.actionsUpcoming = num(ac.upcoming); e.actionsDone = num(ac.done);
  }

  return finalize("officers", [...map.values()], empty);
}

/** Rank (by sales, then visits) + compute totals. */
function finalize(kind: PerfKind, rows: PerfEntity[], empty: PerfData): PerfData {
  rows.sort((a, b) => b.sales - a.sales || b.visits - a.visits || a.name.localeCompare(b.name));
  const sum = (f: (x: PerfEntity) => number) => rows.reduce((t, x) => t + f(x), 0);
  const sales = sum((x) => x.sales), salesPrev = sum((x) => x.salesPrev);
  return {
    kind, rows,
    totals: {
      entities: rows.length, sales, salesPrev, salesGrowthPct: growth(sales, salesPrev),
      visits: sum((x) => x.visits), visitsReviewed: sum((x) => x.visitsReviewed),
      actionsOpen: sum((x) => x.actionsOpen), actionsOverdue: sum((x) => x.actionsOverdue),
      leadsConverted: sum((x) => x.leadsConverted), currentLeads: sum((x) => x.currentLeads), farmers: sum((x) => x.farmers),
    },
    hasComparison: empty.hasComparison, rangeLabel: empty.rangeLabel,
  };
}
