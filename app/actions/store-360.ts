"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, storeScopeWhere } from "@/lib/scope";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS } from "@/lib/campaign-segments";
import { cropLabel } from "@/lib/crops";
import { shortStoreName } from "@/lib/store-utils";

/**
 * Store 360 — a store-level mirror of Farmer 360. Visible to Regional Managers (their managed stores
 * only), Central and System Admin; agri officers / campaigners have no access. Every domain row carries
 * a `storeId`, so a store's full record (farmers, officers, sales, campaigns, follow-ups, visits,
 * ghoshti) is assembled by scoping each query to that store.
 *
 * RM scope is the authoritative `Store.regionalManager == User.name` link, reached through
 * `storeScopeWhere(scope)` (lib/scope.ts) so it can never be widened here. An RM who manages no stores
 * gets "none" → an empty list, never everything.
 */

const MANAGER_ROLES = new Set(["regional", "central", "sysadmin"]);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export interface StoreListItem {
  id: number;
  name: string;
  code: string;
  zone: string | null;
  regionalManager: string | null;
  status: string;
  farmers: number;
  officers: number;
  ltv: number;
  activeCampaigns: number;
  openActions: number;
  overdueActions: number;
  lastVisit: string | null;
}

/** Stores the caller may see, each with headline KPIs. null = no access (officer / campaigner). */
export async function getStoreList(): Promise<StoreListItem[] | null> {
  const scope = await getScope();
  if (!MANAGER_ROLES.has(scope.role)) return null;

  // Scope on LAST — "none" (an RM with no mapped stores) fails closed to an empty list.
  const sw = storeScopeWhere(scope);
  if (sw === "none") return [];

  const stores = await prisma.store.findMany({
    where: sw ?? undefined,
    select: { id: true, code: true, name: true, zone: true, regionalManager: true, status: true },
    orderBy: { name: "asc" },
  });
  const ids = stores.map((s) => s.id);
  if (!ids.length) return [];
  const inIds = { in: ids };
  const now = new Date();

  const [farmerG, officerG, ltvG, openG, overG, visitG, activeMap] = await Promise.all([
    prisma.farmer.groupBy({ by: ["storeId"], where: { storeId: inIds }, _count: { _all: true } }),
    prisma.user.groupBy({
      by: ["storeId"],
      where: { storeId: inIds, role: { in: ["ASR", "STORE_MANAGER"] }, active: true },
      _count: { _all: true },
    }),
    prisma.saleLine.groupBy({ by: ["storeId"], where: { storeId: inIds, source: "REAL" }, _sum: { basic: true } }),
    prisma.action.groupBy({ by: ["storeId"], where: { storeId: inIds, status: "OPEN" }, _count: { _all: true } }),
    prisma.action.groupBy({
      by: ["storeId"],
      where: { storeId: inIds, status: "OPEN", dueDate: { lt: now } },
      _count: { _all: true },
    }),
    prisma.visit.groupBy({ by: ["storeId"], where: { storeId: inIds }, _max: { visitedAt: true } }),
    // Distinct ACTIVE campaigns per store (a campaign enrols farmers from many stores).
    (async () => {
      const active = await prisma.campaign.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      const aids = active.map((a) => a.id);
      if (!aids.length) return new Map<number, number>();
      const rows = await prisma.campaignMember.groupBy({
        by: ["storeId", "campaignId"],
        where: { storeId: inIds, campaignId: { in: aids } },
        _count: { _all: true },
      });
      const sets = new Map<number, Set<number>>();
      for (const r of rows) {
        if (r.storeId == null) continue;
        let set = sets.get(r.storeId);
        if (!set) { set = new Set<number>(); sets.set(r.storeId, set); }
        set.add(r.campaignId);
      }
      return new Map([...sets].map(([k, v]) => [k, v.size] as const));
    })(),
  ]);

  const counts = (rows: { storeId: number | null; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.storeId, r._count._all] as const));
  const fMap = counts(farmerG);
  const oMap = counts(officerG);
  const openMap = counts(openG);
  const overMap = counts(overG);
  const ltvMap = new Map(ltvG.map((r) => [r.storeId, Math.round(r._sum.basic ?? 0)] as const));
  const vMap = new Map(visitG.map((r) => [r.storeId, r._max.visitedAt] as const));

  return stores.map((s) => ({
    id: s.id,
    name: shortStoreName(s.name) || s.name,
    code: s.code,
    zone: s.zone,
    regionalManager: s.regionalManager,
    status: s.status,
    farmers: fMap.get(s.id) ?? 0,
    officers: oMap.get(s.id) ?? 0,
    ltv: ltvMap.get(s.id) ?? 0,
    activeCampaigns: activeMap.get(s.id) ?? 0,
    openActions: openMap.get(s.id) ?? 0,
    overdueActions: overMap.get(s.id) ?? 0,
    lastVisit: iso(vMap.get(s.id) ?? null),
  }));
}

export interface StoreDetail {
  id: number;
  name: string;
  code: string;
  zone: string | null;
  address: string | null;
  regionalManager: string | null;
  status: string;
  /** Verde's ERP store import carries no coordinates yet — both are usually null. */
  lat: number | null;
  lng: number | null;
  kpis: {
    farmers: number;
    officers: number;
    ltv: number;
    activeCampaigns: number;
    openActions: number;
    overdueActions: number;
    visits: number;
    ghoshti: number;
  };
  officers: { name: string; code: string | null; role: string; lastActive: string | null; visits: number }[];
  valueSeg: { label: string; count: number; color: string }[];
  lifecycleSeg: { label: string; count: number; color: string }[];
  topFarmers: { id: number; name: string; mobile: string | null; ltv: number; lifecycle: string }[];
  sales: {
    ltv: number;
    monthly: { ym: string; label: string; amount: number }[];
    topCrops: { crop: string; amount: number }[];
    topProducts: { name: string; amount: number }[];
  };
  campaigns: { id: number; name: string; status: string; members: number; reached: number; reachPct: number }[];
  actions: {
    open: number;
    overdue: number;
    done: number;
    recent: { id: number; reason: string; due: string | null; status: string; farmer: string | null }[];
  };
  recentVisits: { id: number; farmer: string; officer: string; date: string | null; type: string }[];
  ghoshtiList: { id: number; date: string | null; topic: string; status: string; attendees: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Full record for one store. Scope-checked: the id lookup is AND-ed with `storeScopeWhere`, so an RM
 * opening a store they do not manage gets null (→ 404) instead of the record. null = no access /
 * out of scope / unknown store.
 */
export async function getStoreDetail(storeId: number): Promise<StoreDetail | null> {
  const scope = await getScope();
  if (!MANAGER_ROLES.has(scope.role)) return null;

  const sw = storeScopeWhere(scope);
  if (sw === "none") return null;
  const where: Prisma.StoreWhereInput = sw ? { AND: [{ id: storeId }, sw] } : { id: storeId };

  const store = await prisma.store.findFirst({
    where,
    select: {
      id: true, code: true, name: true, zone: true, address: true,
      regionalManager: true, status: true, lat: true, lng: true,
    },
  });
  if (!store) return null;
  const now = new Date();

  const [
    farmerCount, officerRows, ltvAgg, openActions, overdueActions, doneActions, visitCount, ghoshtiCount,
    valueG, lifecycleG, topFarmers, monthly, topCrops, topProducts,
    camMembers, camReached, recentActions, recentVisitRows, ghoshtiRows,
  ] = await Promise.all([
    prisma.farmer.count({ where: { storeId } }),
    prisma.user.findMany({
      where: { storeId, role: { in: ["ASR", "STORE_MANAGER"] } },
      select: { name: true, employeeCode: true, roleLabel: true, role: true, lastLoginAt: true, lastSeenAt: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.saleLine.aggregate({ where: { storeId, source: "REAL" }, _sum: { basic: true } }),
    prisma.action.count({ where: { storeId, status: "OPEN" } }),
    prisma.action.count({ where: { storeId, status: "OPEN", dueDate: { lt: now } } }),
    prisma.action.count({ where: { storeId, status: "DONE" } }),
    prisma.visit.count({ where: { storeId } }),
    prisma.ghoshti.count({ where: { storeId } }),
    prisma.farmer.groupBy({ by: ["valueSegment"], where: { storeId, valueSegment: { not: null } }, _count: { _all: true } }),
    prisma.farmer.groupBy({ by: ["lifecycleSegment"], where: { storeId, lifecycleSegment: { not: null } }, _count: { _all: true } }),
    prisma.farmer.findMany({
      where: { storeId },
      orderBy: { lifetimeSpend: { sort: "desc", nulls: "last" } },
      take: 10,
      select: { id: true, name: true, mobile: true, lifetimeSpend: true, lifecycleSegment: true },
    }),
    prisma.$queryRaw<{ ym: string; amt: number }[]>`
      SELECT to_char(date_trunc('month', "soldAt"), 'YYYY-MM') AS ym, COALESCE(SUM("basic"),0)::float AS amt
      FROM "SaleLine" WHERE "storeId" = ${storeId} AND source = 'REAL' AND "soldAt" IS NOT NULL
      GROUP BY 1 ORDER BY 1`,
    // Crop attribution comes from the ERP feed's UsedInCrop, cleaned into SaleLine.cropTag.
    prisma.$queryRaw<{ cropTag: string; amt: number }[]>`
      SELECT "cropTag", COALESCE(SUM("basic"),0)::float AS amt
      FROM "SaleLine" WHERE "storeId" = ${storeId} AND source = 'REAL' AND "cropTag" IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    prisma.$queryRaw<{ itemRaw: string; amt: number }[]>`
      SELECT "itemRaw", COALESCE(SUM("basic"),0)::float AS amt
      FROM "SaleLine" WHERE "storeId" = ${storeId} AND source = 'REAL'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    prisma.campaignMember.groupBy({ by: ["campaignId"], where: { storeId }, _count: { _all: true } }),
    prisma.campaignMember.groupBy({ by: ["campaignId"], where: { storeId, reached: true }, _count: { _all: true } }),
    prisma.action.findMany({
      where: { storeId },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 12,
      select: { id: true, reason: true, dueDate: true, status: true, farmer: { select: { name: true } } },
    }),
    prisma.visit.findMany({
      where: { storeId },
      orderBy: [{ visitedAt: "desc" }, { id: "desc" }],
      take: 12,
      select: { id: true, officerName: true, date: true, type: true, farmer: { select: { name: true } } },
    }),
    prisma.ghoshti.findMany({
      where: { storeId },
      orderBy: { date: "desc" },
      take: 8,
      select: { id: true, date: true, topic: true, status: true, _count: { select: { attendees: true } } },
    }),
  ]);

  // Officers: last active = max(sign-in, heartbeat); visits attributed by recorded officer name.
  const officerNames = officerRows.map((u) => u.name);
  const visitByOfficer = officerNames.length
    ? new Map(
        (
          await prisma.visit.groupBy({
            by: ["officerName"],
            where: { storeId, officerName: { in: officerNames } },
            _count: { _all: true },
          })
        ).map((r) => [r.officerName, r._count._all] as const),
      )
    : new Map<string | null, number>();
  const officers = officerRows.map((u) => ({
    name: u.name,
    code: u.employeeCode,
    role: u.roleLabel || u.role,
    lastActive: iso(
      [u.lastSeenAt, u.lastLoginAt]
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    ),
    visits: visitByOfficer.get(u.name) ?? 0,
  }));

  // Campaigns that have enrolled this store's farmers.
  const memMap = new Map(camMembers.map((r) => [r.campaignId, r._count._all] as const));
  const reachMap = new Map(camReached.map((r) => [r.campaignId, r._count._all] as const));
  const campIds = [...memMap.keys()];
  const camps = campIds.length
    ? await prisma.campaign.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true, status: true } })
    : [];
  const campaigns = camps
    .map((c) => {
      const members = memMap.get(c.id) ?? 0;
      const reached = reachMap.get(c.id) ?? 0;
      return { id: c.id, name: c.name, status: c.status, members, reached, reachPct: members ? Math.round((reached / members) * 100) : 0 };
    })
    .sort((a, b) => b.members - a.members);

  const segRow = (
    rows: { valueSegment?: string | null; lifecycleSegment?: string | null; _count: { _all: number } }[],
    key: "valueSegment" | "lifecycleSegment",
    order: readonly string[],
  ) => {
    const m = new Map(rows.map((r) => [r[key], r._count._all] as const));
    return order
      .filter((k) => (m.get(k) ?? 0) > 0)
      .map((k) => ({ label: segMeta(k).label, count: m.get(k) ?? 0, color: segMeta(k).color }));
  };

  const ltv = Math.round(ltvAgg._sum.basic ?? 0);

  return {
    id: store.id,
    name: shortStoreName(store.name) || store.name,
    code: store.code,
    zone: store.zone,
    address: store.address,
    regionalManager: store.regionalManager,
    status: store.status,
    lat: store.lat,
    lng: store.lng,
    kpis: {
      farmers: farmerCount,
      officers: officers.length,
      ltv,
      activeCampaigns: campaigns.filter((c) => c.status === "ACTIVE").length,
      openActions,
      overdueActions,
      visits: visitCount,
      ghoshti: ghoshtiCount,
    },
    officers,
    valueSeg: segRow(valueG, "valueSegment", VALUE_SEGMENTS),
    lifecycleSeg: segRow(lifecycleG, "lifecycleSegment", LIFECYCLE_SEGMENTS),
    topFarmers: topFarmers.map((f) => ({
      id: f.id,
      name: f.name,
      mobile: f.mobile,
      ltv: f.lifetimeSpend ?? 0,
      lifecycle: f.lifecycleSegment ? segMeta(f.lifecycleSegment).label : "—",
    })),
    sales: {
      ltv,
      monthly: monthly.map((r) => {
        const [y, m] = r.ym.split("-");
        return { ym: r.ym, label: `${MONTHS[Number(m) - 1]} '${y.slice(2)}`, amount: Math.round(r.amt) };
      }),
      topCrops: topCrops.map((r) => ({ crop: cropLabel(r.cropTag), amount: Math.round(r.amt) })),
      topProducts: topProducts.map((r) => ({ name: r.itemRaw, amount: Math.round(r.amt) })),
    },
    campaigns,
    actions: {
      open: openActions,
      overdue: overdueActions,
      done: doneActions,
      recent: recentActions.map((a) => ({
        id: a.id,
        reason: a.reason ?? "Follow-up",
        due: iso(a.dueDate),
        status: a.status,
        farmer: a.farmer?.name ?? null,
      })),
    },
    recentVisits: recentVisitRows.map((v) => ({
      id: v.id,
      farmer: v.farmer?.name ?? "—",
      officer: v.officerName ?? "—",
      date: v.date,
      type: v.type ?? "Visit",
    })),
    ghoshtiList: ghoshtiRows.map((g) => ({
      id: g.id,
      date: iso(g.date),
      topic: g.topic ?? "Ghoshti",
      status: g.status,
      attendees: g._count.attendees,
    })),
  };
}
