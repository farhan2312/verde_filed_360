import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { avatarColor } from "@/lib/format";
import { shortStoreName, storeColor } from "@/lib/store-utils";
import { SEGMENT_ENUM_TO_LABEL, LEAD_ENUM_TO_LABEL } from "@/lib/segments";
import { MapView } from "@/components/map/MapView";
import type { MapFarmer, MapStore, StoreListItem, StoreTagMeta } from "@/components/map/types";
import { listStoreTags } from "@/app/actions/store-tags";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { canManage, getScope, farmerScopeWhere, storeScopeWhere } from "@/lib/scope";

export const dynamic = "force-dynamic";

/** Whole days between a past date and now (>= 0), or null. */
function daysAgo(d: Date | null | undefined): number | null {
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

export default async function MapViewPage() {
  const role = await getRole();
  if (!canAccess("mapView", role)) notFound(); // agri officers have no map view

  // RMs see only their own region's stores + farmers; central/sysadmin see everything.
  const scope = await getScope();
  const farmerScope = farmerScopeWhere(scope);
  const storeScope = storeScopeWhere(scope);
  if (farmerScope === "none" || storeScope === "none") notFound();
  const farmerAnd = (w: object) => (farmerScope ? { AND: [w, farmerScope] } : w);
  const storeAnd = (w: object) => (storeScope ? { AND: [w, storeScope] } : w);

  let farmers: MapFarmer[] = [];
  let stores: MapStore[] = [];
  let allStores: StoreListItem[] = [];
  let storeTags: StoreTagMeta[] = [];

  try {
    // Only farmers with real coordinates are plottable (the 12 enriched demo set).
    const [farmerRows, storeRows] = await Promise.all([
      prisma.farmer.findMany({
        where: farmerAnd({ lat: { not: null }, lng: { not: null } }),
        select: {
          id: true,
          name: true,
          mobile: true,
          village: true,
          district: true,
          crop: true,
          land: true,
          segment: true,
          leadStatus: true,
          status: true,
          issues: true,
          lat: true,
          lng: true,
          storeId: true,
          visits: {
            orderBy: [{ visitedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { visitedAt: true, date: true },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.store.findMany({
        where: storeAnd({ lat: { not: null }, lng: { not: null } }),
        select: {
          id: true,
          code: true,
          name: true,
          lat: true,
          lng: true,
          // Real total farmers per store — drives the farmer-density heatmap.
          _count: { select: { farmers: true } },
        },
        orderBy: { id: "asc" },
      }),
    ]);

    farmers = farmerRows.map((f, i): MapFarmer => {
      const lastVisit = f.visits[0] ?? null;
      const segment = f.segment ? SEGMENT_ENUM_TO_LABEL[f.segment] ?? null : null;
      // Prefer the explicit lead status; fall back to the display `status` string.
      const status = f.leadStatus
        ? LEAD_ENUM_TO_LABEL[f.leadStatus] ?? null
        : f.status ?? null;
      return {
        id: f.id,
        name: f.name,
        mobile: f.mobile,
        village: f.village,
        district: f.district,
        crop: f.crop,
        land: f.land,
        segment,
        status,
        issue: f.issues.length > 0 ? f.issues[0] : null,
        daysSinceVisit: daysAgo(lastVisit?.visitedAt ?? null),
        lastVisit: lastVisit?.date ?? "—",
        lat: f.lat as number,
        lng: f.lng as number,
        storeId: f.storeId,
        avBg: avatarColor(i),
      };
    });

    stores = storeRows.map((s): MapStore => ({
      id: s.id,
      code: s.code,
      name: s.name,
      shortName: shortStoreName(s.name),
      // Use the stored colour if present, else a deterministic palette colour.
      color: storeColor(s.id),
      lat: s.lat as number,
      lng: s.lng as number,
      farmerCount: s._count.farmers,
    }));

    // Every store in scope (alphabetical) for the picker list.
    const allStoreRows = await prisma.store.findMany({
      where: storeScope ?? undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        zone: true,
        lat: true,
        tagIds: true,
        _count: { select: { farmers: true } },
      },
    });

    allStores = allStoreRows.map((s): StoreListItem => ({
      id: s.id,
      code: s.code,
      name: s.name,
      shortName: shortStoreName(s.name),
      color: storeColor(s.id),
      zone: s.zone,
      farmerCount: s._count.farmers,
      hasGps: s.lat != null,
      tagIds: s.tagIds ?? [],
    }));
    storeTags = await listStoreTags();
  } catch {
    farmers = [];
    stores = [];
    allStores = [];
  }

  return <MapView farmers={farmers} stores={stores} allStores={allStores} storeTags={storeTags} canChain={canManage(role)} />;
}
