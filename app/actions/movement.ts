"use server";

import { prisma } from "@/lib/prisma";

/* All movement analytics are anchored on the DATA's latest sale date (asof),
   not the wall clock — the master history ends Mar 2026, so windows are
   relative to the last recorded activity. */

export interface MonthPoint { ym: string; units: number; rev: number }
export interface CategoryRow { cat: string; units: number; rev: number }
export interface MoverRow { id: number; name: string; cat: string | null; units: number; rev: number; last: string | null }
export interface DeadRow { id: number; name: string; cat: string | null; units: number; last: string | null; daysIdle: number }
export interface StoreRow { name: string; units: number; rev: number; bills: number }
export interface MovementOverview {
  asof: string | null;
  kpis: { units: number; rev: number; products: number; bills: number; stores: number };
  trend: MonthPoint[];
  categories: CategoryRow[];
}

const num = (x: unknown) => (x == null ? 0 : Number(x));
const isoOf = (d: Date | string | null) => (d == null ? null : (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)));

async function getAsof(): Promise<Date | null> {
  const r = await prisma.$queryRaw<{ max: Date | null }[]>`SELECT MAX("soldAt") AS max FROM "SaleLine"`;
  return r[0]?.max ?? null;
}

export async function getMovementOverview(): Promise<MovementOverview> {
  const asof = await getAsof();
  const [kpiRow, trend, cats] = await Promise.all([
    prisma.$queryRaw<{ units: number; rev: number; products: number; bills: number; stores: number }[]>`
      SELECT COALESCE(SUM(qty),0)::float AS units, COALESCE(SUM("basic"),0)::float AS rev,
             COUNT(DISTINCT "productId")::int AS products, COUNT(DISTINCT "orderNo")::int AS bills,
             COUNT(DISTINCT "storeId")::int AS stores
      FROM "SaleLine"`,
    prisma.$queryRaw<{ ym: string; units: number; rev: number }[]>`
      SELECT to_char(date_trunc('month', "soldAt"), 'YYYY-MM') AS ym,
             SUM(qty)::float AS units, SUM(COALESCE("basic",0))::float AS rev
      FROM "SaleLine" WHERE "soldAt" IS NOT NULL GROUP BY 1 ORDER BY 1`,
    // Group on the editable Product.mainCategory (single source of truth, matches the catalog & fast movers).
    prisma.$queryRaw<{ cat: string | null; units: number; rev: number }[]>`
      SELECT p."mainCategory" AS cat, SUM(sl.qty)::float AS units, SUM(COALESCE(sl."basic",0))::float AS rev
      FROM "SaleLine" sl JOIN "Product" p ON p.id = sl."productId"
      GROUP BY 1 ORDER BY rev DESC NULLS LAST`,
  ]);
  const k = kpiRow[0] ?? { units: 0, rev: 0, products: 0, bills: 0, stores: 0 };
  return {
    asof: isoOf(asof),
    kpis: { units: num(k.units), rev: num(k.rev), products: num(k.products), bills: num(k.bills), stores: num(k.stores) },
    trend: trend.map((t) => ({ ym: t.ym, units: num(t.units), rev: num(t.rev) })),
    categories: cats.map((c) => ({ cat: c.cat ?? "Uncategorized", units: num(c.units), rev: num(c.rev) })),
  };
}

/** Fast movers (top units in the last `days` of activity) + dead stock (idle > `deadDays`). */
export async function getMovers(days = 90, deadDays = 180): Promise<{ fast: MoverRow[]; dead: DeadRow[] }> {
  const asof = await getAsof();
  if (!asof) return { fast: [], dead: [] };
  const winStart = new Date(asof); winStart.setDate(winStart.getDate() - days);
  const deadBefore = new Date(asof); deadBefore.setDate(deadBefore.getDate() - deadDays);
  const [fast, dead] = await Promise.all([
    prisma.$queryRaw<{ id: number; name: string; cat: string | null; units: number; rev: number; last: Date | null }[]>`
      SELECT p.id, p.name, p."mainCategory" AS cat, SUM(sl.qty)::float AS units, SUM(COALESCE(sl."basic",0))::float AS rev, MAX(sl."soldAt") AS last
      FROM "SaleLine" sl JOIN "Product" p ON p.id = sl."productId"
      WHERE sl."soldAt" >= ${winStart} AND p.active = true AND p."mergedIntoId" IS NULL
      GROUP BY p.id, p.name, p."mainCategory" ORDER BY units DESC LIMIT 25`,
    prisma.$queryRaw<{ id: number; name: string; cat: string | null; units: number; last: Date | null }[]>`
      SELECT id, name, "mainCategory" AS cat, "totalQty"::float AS units, "lastSoldAt" AS last
      FROM "Product"
      WHERE active = true AND "mergedIntoId" IS NULL AND "lastSoldAt" IS NOT NULL AND "lastSoldAt" < ${deadBefore}
      ORDER BY "totalRevenue" DESC NULLS LAST LIMIT 25`,
  ]);
  const asofMs = asof.getTime();
  return {
    fast: fast.map((f) => ({ id: f.id, name: f.name, cat: f.cat, units: num(f.units), rev: num(f.rev), last: isoOf(f.last) })),
    dead: dead.map((d) => ({
      id: d.id, name: d.name, cat: d.cat, units: num(d.units), last: isoOf(d.last),
      daysIdle: d.last ? Math.round((asofMs - new Date(d.last).getTime()) / 86400000) : 0,
    })),
  };
}

export async function getStoreLeaderboard(): Promise<StoreRow[]> {
  const rows = await prisma.$queryRaw<{ name: string | null; units: number; rev: number; bills: number }[]>`
    SELECT COALESCE(s.name, sl.store) AS name, SUM(sl.qty)::float AS units, SUM(COALESCE(sl."basic",0))::float AS rev,
           COUNT(DISTINCT sl."orderNo")::int AS bills
    FROM "SaleLine" sl LEFT JOIN "Store" s ON s.id = sl."storeId"
    GROUP BY 1 ORDER BY rev DESC NULLS LAST LIMIT 40`;
  return rows.map((r) => ({ name: r.name ?? "—", units: num(r.units), rev: num(r.rev), bills: num(r.bills) }));
}

export interface ProductMovement {
  monthly: MonthPoint[];
  stores: { name: string; units: number }[];
}
export async function getProductMovement(productId: number): Promise<ProductMovement> {
  const [monthly, stores] = await Promise.all([
    prisma.$queryRaw<{ ym: string; units: number; rev: number }[]>`
      SELECT to_char(date_trunc('month', "soldAt"), 'YYYY-MM') AS ym, SUM(qty)::float AS units, SUM(COALESCE("basic",0))::float AS rev
      FROM "SaleLine" WHERE "productId" = ${productId} AND "soldAt" IS NOT NULL GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ name: string | null; units: number }[]>`
      SELECT COALESCE(s.name, sl.store) AS name, SUM(sl.qty)::float AS units
      FROM "SaleLine" sl LEFT JOIN "Store" s ON s.id = sl."storeId"
      WHERE sl."productId" = ${productId} GROUP BY 1 ORDER BY units DESC LIMIT 12`,
  ]);
  return {
    monthly: monthly.map((m) => ({ ym: m.ym, units: num(m.units), rev: num(m.rev) })),
    stores: stores.map((s) => ({ name: s.name ?? "—", units: num(s.units) })),
  };
}
