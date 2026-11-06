"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getScope, storeScopeWhere } from "@/lib/scope";
import { startOfToday } from "@/lib/action-constants";
import { buildStyledWorkbookB64 } from "@/lib/xlsx-styled";

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
  storeStatus?: string[]; // store status — "Active" | "Inactive"
  rms?: number[];     // REGIONAL user ids — restrict to the stores they manage (Store.rmUserIds)
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
  rm?: string;                 // stores + officers: the store's Regional Manager(s) (rms board: same as name)
  district?: string;           // stores + officers: the store's district / zone
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

/**
 * The stores managed by the chosen Regional Managers. A store can have SEVERAL managers, so the
 * authoritative link is `Store.rmUserIds`; `Store.regionalManager` is only the denormalised
 * comma-joined display label, matched as a fallback for stores imported with a name but no account
 * yet (mirrors `managedStoreIdsFor` in lib/scope.ts).
 */
async function rmStoreWhere(rms: number[]): Promise<Prisma.StoreWhereInput> {
  const users = await prisma.user.findMany({ where: { id: { in: rms }, role: "REGIONAL" }, select: { name: true } });
  const names = users.map((u) => u.name.trim()).filter(Boolean);
  return {
    OR: [
      { rmUserIds: { hasSome: rms } },
      ...names.map((n) => ({ regionalManager: { equals: n, mode: "insensitive" as const } })),
    ],
  };
}

/** Resolve the scoped store-id set: number[] to restrict, or null for "all stores" (admins). */
async function scopedStoreIds(storeTags?: number[], storeStatus?: string[], rms?: number[]): Promise<number[] | null | "none"> {
  const scope = await getScope();
  const where = storeScopeWhere(scope);
  if (where === "none") return "none";

  // Tag / status / RM filter (and/or the admin "all" case) → materialise the id list.
  const cond: Prisma.StoreWhereInput = {};
  if (where && where !== null) Object.assign(cond, where);
  if (storeTags?.length) cond.tagIds = { hasSome: storeTags };
  if (storeStatus?.length) cond.status = { in: storeStatus };
  // AND-nested so the RM's own OR can't widen the caller's scope predicate.
  if (rms?.length) cond.AND = [await rmStoreWhere(rms)];
  if (!where && !storeTags?.length && !storeStatus?.length && !rms?.length) return null; // admin, no filter → all stores

  const stores = await prisma.store.findMany({ where: cond, select: { id: true } });
  return stores.map((s) => s.id);
}

const D = (s?: string) => (s ? new Date(s) : null);

export async function getPerformance(kind: PerfKind, range: PerfRange = {}): Promise<PerfData> {
  const ids = await scopedStoreIds(range.storeTags, range.storeStatus, range.rms);
  const empty: PerfData = {
    kind, rows: [],
    totals: { entities: 0, sales: 0, salesPrev: 0, salesGrowthPct: null, visits: 0, visitsReviewed: 0, actionsOpen: 0, actionsOverdue: 0, leadsConverted: 0, currentLeads: 0, farmers: 0 },
    hasComparison: !!(range.prevFrom && range.prevTo), rangeLabel: range.label ?? "All time",
  };
  if (ids === "none") return empty;

  const from = D(range.from), to = D(range.to), pFrom = D(range.prevFrom), pTo = D(range.prevTo);
  const hasWin = !!(from && to);
  const hasPrev = !!(pFrom && pTo);
  const sod = startOfToday(); // overdue cutoff = start of today (IST); a follow-up due today isn't overdue

  // Scope predicate applied to whichever store column each query exposes.
  const storeIn = (expr: Prisma.Sql) =>
    ids === null ? Prisma.sql`TRUE` : ids.length ? Prisma.sql`${expr} IN (${Prisma.join(ids)})` : Prisma.sql`FALSE`;

  const curWin = (c: Prisma.Sql) => (hasWin ? Prisma.sql`${c} >= ${from} AND ${c} < ${to}` : Prisma.sql`${c} IS NOT NULL`);
  const prevWin = (c: Prisma.Sql) => (hasPrev ? Prisma.sql`${c} >= ${pFrom} AND ${c} < ${pTo}` : Prisma.sql`FALSE`);

  try {
    if (kind === "officers") return await officerBoard({ ids, storeIn, curWin, from, to, now: sod, range, empty });
    return await storeAxisBoard({ kind, ids, storeIn, curWin, prevWin, from, to, now: sod, range, empty });
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
      select: { id: true, name: true, zone: true, regionalManager: true, rmUserIds: true },
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

  // A store can have several RMs (Store.rmUserIds is authoritative; regionalManager is only a
  // comma-joined display label), so the rms board has to roll up per manager, not per label.
  const rmNameById = new Map(
    (await prisma.user.findMany({
      where: { id: { in: [...new Set(meta.flatMap((st) => st.rmUserIds))] }, role: "REGIONAL" },
      select: { id: true, name: true },
    })).map((u) => [u.id, u.name.trim()]),
  );

  const sMap = new Map(sales.map((r) => [r.sid, r]));
  const vMap = new Map(visits.map((r) => [r.sid, r]));
  const aMap = new Map(actions.map((r) => [r.sid, r]));
  const lMap = new Map(leads.map((r) => [r.sid, r]));

  const shortStore = (s: string) => s.replace(/\s*\(.*?\)\s*/g, "").trim() || s;

  /** One key per manager of this store — by user id, falling back to each name in the legacy label. */
  const rmKeysOf = (st: { rmUserIds: number[]; regionalManager: string | null }) =>
    st.rmUserIds.length
      ? st.rmUserIds.map((id) => ({ key: `u${id}`, name: rmNameById.get(id) ?? `User ${id}` }))
      : (st.regionalManager ?? "").split(",").map((n) => n.trim()).filter(Boolean)
          .map((n) => ({ key: `n:${n.toLowerCase()}`, name: n }));

  const storeRows: (PerfEntity & { rm: string; rmKeys: { key: string; name: string }[] })[] = meta.map((st) => {
    const s = sMap.get(st.id), v = vMap.get(st.id), ac = aMap.get(st.id), l = lMap.get(st.id);
    const sales = num(s?.cur), salesPrev = num(s?.prev);
    const visits = num(v?.visits), reviewed = num(v?.reviewed);
    const keys = rmKeysOf(st);
    const rm = keys.map((k) => k.name).join(", ") || (st.regionalManager ?? "").trim();
    return {
      id: String(st.id), name: shortStore(st.name), rmKeys: keys,
      sub: [st.zone, rm && `RM: ${rm}`].filter(Boolean).join(" · ") || "—",
      rm, district: st.zone ?? undefined,
      sales, salesPrev, salesGrowthPct: growth(sales, salesPrev),
      visits, visitsReviewed: reviewed, visitsPending: Math.max(0, visits - reviewed), farmersVisited: num(v?.fv),
      actionsOpen: num(ac?.opn), actionsOverdue: num(ac?.overdue), actionsUpcoming: num(ac?.upcoming), actionsDone: num(ac?.done),
      leadsConverted: num(l?.converted), currentLeads: num(l?.leads), farmers: num(l?.farmers),
    };
  });

  let rows: PerfEntity[];
  if (kind === "stores") {
    rows = storeRows; // keep rm + district for the export's Store/RM/District columns
  } else {
    // Roll stores up to each of their regional managers. A store with two RMs counts under both, so
    // these rows do not sum to the all-stores total — that is the point of a per-manager board.
    const byRm = new Map<string, { name: string; list: (PerfEntity & { rm: string })[] }>();
    for (const r of storeRows) {
      const keys = r.rmKeys.length ? r.rmKeys : [{ key: "—", name: "— Unassigned" }];
      for (const k of keys) {
        const bucket = byRm.get(k.key) ?? byRm.set(k.key, { name: k.name, list: [] }).get(k.key)!;
        bucket.list.push(r);
      }
    }
    rows = [...byRm.values()].map(({ name: rm, list }) => {
      const sum = (f: (x: PerfEntity) => number) => list.reduce((t, x) => t + f(x), 0);
      const sales = sum((x) => x.sales), salesPrev = sum((x) => x.salesPrev);
      const visits = sum((x) => x.visits), reviewed = sum((x) => x.visitsReviewed);
      return {
        id: rm, name: rm, sub: `${list.length} store${list.length === 1 ? "" : "s"}`, storeCount: list.length, rm,
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
    prisma.$queryRaw<{ nm: string; store: string | null; rm: string | null; zone: string | null; visits: number; reviewed: number; fv: number }[]>(Prisma.sql`
      SELECT TRIM(v."officerName") nm,
        (ARRAY_AGG(st.name ORDER BY st.name))[1] store,
        (ARRAY_AGG(st."regionalManager" ORDER BY st.name))[1] rm,
        (ARRAY_AGG(st.zone ORDER BY st.name))[1] zone,
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
    if (v.rm?.trim()) e.rm = v.rm.trim();
    if (v.zone?.trim()) e.district = v.zone.trim();
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

/**
 * Regional Managers selectable in the leaderboard's RM filter — REGIONAL accounts, not distinct
 * `Store.regionalManager` strings (that column is only a comma-joined display label, and a store can
 * have several managers). Narrowed to the managers of the caller's scoped stores.
 */
export async function getPerfRmOptions(): Promise<{ id: number; name: string }[]> {
  const scope = await getScope();
  const where = storeScopeWhere(scope);
  if (where === "none") return [];
  const [rmUsers, stores] = await Promise.all([
    prisma.user.findMany({ where: { role: "REGIONAL", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.store.findMany({ where: where ?? undefined, select: { rmUserIds: true, regionalManager: true } }),
  ]);
  // In scope = linked by user id to a scoped store, or matched by the legacy comma-joined name label.
  const linked = new Set(stores.flatMap((s) => s.rmUserIds));
  const named = new Set(
    stores.flatMap((s) => (s.regionalManager ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)),
  );
  return rmUsers.filter((u) => linked.has(u.id) || named.has(u.name.trim().toLowerCase()));
}

/** Export the current leaderboard (Stores / RMs / Agri Officers) to Excel — respects every active
 *  filter (period, store status, store tags, RM) and the caller's scope. */
export async function exportPerformanceXlsx(kind: PerfKind, range: PerfRange = {}): Promise<{ ok: boolean; filename?: string; b64?: string; error?: string }> {
  const data = await getPerformance(kind, range);
  if (!data.rows.length) return { ok: false, error: "No data in this view to export." };
  const noun = kind === "stores" ? "Store" : kind === "rms" ? "Regional Manager" : "Agri Officer";
  const showSales = kind !== "officers";
  const donePct = (r: PerfEntity): number | "" => { const d = r.actionsDone + r.actionsOpen; return d ? Math.round((r.actionsDone / d) * 100) : ""; };
  const revPct = (r: PerfEntity): number | "" => (r.visits ? Math.round((r.visitsReviewed / r.visits) * 100) : "");

  // Identity columns per axis — Store Name + RM always present where applicable.
  const idHead = kind === "stores" ? ["Store", "District", "RM"]
    : kind === "rms" ? ["Regional Manager", "Stores"]
    : ["Agri Officer", "Store", "RM"];
  const header = [
    "Rank", ...idHead,
    ...(showSales ? ["Sales (Rs)", "Growth %"] : []),
    "Visits", kind === "officers" ? "RM signed %" : "Reviewed %", "Farmers visited",
    "Actions open", "Actions overdue", "Actions done", "Done %",
    ...(showSales ? ["Leads converted", "Farmers"] : []),
  ];
  const body = data.rows.map((r, i) => {
    const idc = kind === "stores" ? [r.name, r.district ?? "", r.rm ?? ""]
      : kind === "rms" ? [r.name, r.storeCount ?? ""]
      : [r.name, r.sub === "—" ? "" : r.sub, r.rm ?? ""];
    return [
      i + 1, ...idc,
      ...(showSales ? [Math.round(r.sales), r.salesGrowthPct == null ? "" : Number(r.salesGrowthPct.toFixed(1))] : []),
      r.visits, revPct(r), r.farmersVisited,
      r.actionsOpen, r.actionsOverdue, r.actionsDone, donePct(r),
      ...(showSales ? [r.leadsConverted, r.farmers] : []),
    ];
  });

  // The RM filter carries user ids — resolve them to names for the Filters sheet.
  const rmNames = range.rms?.length
    ? (await prisma.user.findMany({ where: { id: { in: range.rms } }, select: { name: true }, orderBy: { name: "asc" } })).map((u) => u.name)
    : [];
  const filters = [
    ["Report", `${noun} performance`],
    ["Period", data.rangeLabel],
    ["Store status", range.storeStatus?.length ? range.storeStatus.join(", ") : "All"],
    ["Regional manager(s)", rmNames.length ? rmNames.join(", ") : "All"],
    ["Store tags", range.storeTags?.length ? `${range.storeTags.length} selected` : "All"],
    ["Rows", data.rows.length],
    ["Generated (IST)", new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })],
  ];

  const idCount = idHead.length + 1; // Rank + identity columns before the metrics
  const numFmt: Record<number, string> = {};
  if (showSales) { numFmt[idCount] = "#,##0"; numFmt[idCount + 1] = "#,##0.0"; } // Sales, Growth %
  const b64 = await buildStyledWorkbookB64([
    { name: `${noun}s`.slice(0, 31), rows: [header, ...body], numFmt, leftCols: idHead.map((_, i) => i + 1) },
    { name: "Filters", rows: [["Filter", "Value"], ...filters], leftCols: [0, 1] },
  ]);
  const win = (data.rangeLabel.split(" · ")[0] || "All time").replace(/[\/?*[\]:]/g, " ");
  return { ok: true, filename: `${noun} performance - ${win}.xlsx`, b64 };
}
