import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { segMeta } from "@/lib/campaign-segments";
import type { Scope } from "@/lib/scope";
import type { ScopedDashboardData, ScopedSegBar, ScopedRecentVisit } from "@/components/dashboard/ScopedDashboard";

/**
 * The Analytics page's overview strip (absorbed from the old Dashboard) — every figure is real and
 * role-scoped: officer → their store, RM → their region, central/sysadmin → organization-wide.
 * Null = a scoped user with no store/region assigned (render the Unassigned screen, never global data).
 */
export async function loadOverview(scope: Scope): Promise<ScopedDashboardData | null> {
  const isStore = scope.role === "officer";
  const isZone = scope.role === "regional";
  const { storeId, zone } = scope;
  const rmIds = scope.managedStoreIds ?? [];
  if (isStore && storeId == null) return null;
  if (isZone && !rmIds.length) return null; // RM who manages no stores → Unassigned, never global data

  // Scope by the STORE (authoritative), never Farmer.zone: officer → their store; RM → the stores they
  // manage (Store.regionalManager — can span districts). Farmer.zone is unreliable (~19% null / disagreeing).
  const farmerWhere: Prisma.FarmerWhereInput = isStore
    ? { source: "REAL", storeId: storeId! }
    : isZone
      ? { source: "REAL", storeId: { in: rmIds } }
      : { source: "REAL" };
  const visitWhere: Prisma.VisitWhereInput = isStore
    ? { OR: [{ storeId: storeId! }, { storeId: null, farmer: { storeId: storeId! } }] }
    : isZone
      ? { OR: [{ storeId: { in: rmIds } }, { storeId: null, farmer: { storeId: { in: rmIds } } }] }
      : {};

  try {
    const [store, farmers, segRows, agg, visits, recentRows, storeCount, zoneCount, leadsConverted] = await Promise.all([
      isStore ? prisma.store.findUnique({ where: { id: storeId! }, select: { name: true, zone: true } }) : Promise.resolve(null),
      prisma.farmer.count({ where: farmerWhere }),
      prisma.farmer.groupBy({ by: ["campaignSegment"], where: farmerWhere, _count: { _all: true } }),
      prisma.farmer.aggregate({ where: farmerWhere, _sum: { p12mSpend: true } }),
      prisma.visit.count({ where: visitWhere }),
      prisma.visit.findMany({
        where: visitWhere,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        include: { farmer: { select: { name: true, village: true, status: true } } },
      }),
      isStore ? Promise.resolve(0) : isZone ? Promise.resolve(rmIds.length) : prisma.store.count({ where: { source: "REAL" } }),
      isStore || isZone
        ? Promise.resolve(0)
        : prisma.store.findMany({ where: { source: "REAL", zone: { not: null } }, distinct: ["zone"], select: { zone: true } }).then((r) => r.length),
      // Leads that became customers (sticky wasLead flag), within scope.
      prisma.farmer.count({ where: { ...farmerWhere, wasLead: true } }),
    ]);

    const countBy = new Map<string, number>();
    for (const r of segRows) if (r.campaignSegment) countBy.set(r.campaignSegment, r._count._all);
    const ORDER = ["HNI", "POTENTIAL_HNI", "REGULAR", "AT_RISK", "NEW", "LAPSED"];
    const segments: ScopedSegBar[] = ORDER.filter((k) => countBy.get(k)).map((k) => {
      const m = segMeta(k);
      return { key: k, label: m.label, count: countBy.get(k) ?? 0, color: m.color, bg: m.bg };
    });
    const recent: ScopedRecentVisit[] = recentRows.map((v) => ({
      id: v.id,
      farmer: v.farmer?.name ?? "Unknown farmer",
      village: v.farmer?.village ?? "—",
      officer: v.officerName ?? "—",
      date: v.date ?? "—",
      status: v.farmer?.status ?? v.purpose ?? "—",
    }));

    const kind = isStore ? "store" : isZone ? "zone" : "global";
    return {
      kind,
      label: isStore ? store?.name ?? `Store #${storeId}` : isZone ? (zone ?? "My region") : "All regions",
      sub: isStore
        ? store?.zone ?? ""
        : isZone
          ? `${storeCount} store${storeCount === 1 ? "" : "s"} managed`
          : `${storeCount} stores · ${zoneCount} regions`,
      kpi: {
        farmers,
        hni: countBy.get("HNI") ?? 0,
        potentialHni: countBy.get("POTENTIAL_HNI") ?? 0,
        revenue12m: agg._sum.p12mSpend ?? 0,
        visits,
        leadsConverted,
      },
      segments,
      recent,
    };
  } catch {
    return null;
  }
}
