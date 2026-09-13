import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canAccess } from "@/lib/roles";
import { canManage } from "@/lib/scope";
import { getScope, storeScopeWhere } from "@/lib/scope";
import { listClustersWithCounts, type ClusterVM } from "@/app/actions/campaigns";
import { getGlobalCropFacet, getGlobalPestFacet } from "@/lib/stats";
import { ClustersTab, type StoreOption } from "@/components/campaigns/ClustersTab";
import type { CropOption, PestOption } from "@/components/campaigns/CampaignsScreen";

export const dynamic = "force-dynamic";

export default async function FarmerClustersPage() {
  const role = await getRole();
  if (!canAccess("farmerCluster", role)) notFound(); // agri officers have no cluster view

  // RMs see their region only, and cannot build clusters — the builder inputs are
  // therefore limited to their region too (belt and braces with the action guard).
  const scope = await getScope();
  const storeWhere = storeScopeWhere(scope);
  const canCreate = canManage(role);

  let clusters: ClusterVM[] = [];
  let zones: string[] = [];
  let crops: CropOption[] = [];
  let pests: PestOption[] = [];
  let stores: StoreOption[] = [];
  try {
    const [cls, zoneRows, cropOpts, pestOpts, storeRows] = await Promise.all([
      listClustersWithCounts(),
      scope.role === "regional"
        ? prisma.store.findMany({ where: scope.managedStoreIds?.length ? { id: { in: scope.managedStoreIds } } : { id: -1 }, distinct: ["zone"], select: { zone: true }, orderBy: { zone: "asc" } })
        : prisma.farmer.findMany({ where: { zone: { not: null }, source: "REAL" }, distinct: ["zone"], select: { zone: true }, orderBy: { zone: "asc" } }),
      getGlobalCropFacet(),
      getGlobalPestFacet(),
      prisma.store.findMany({
        where: { source: "REAL", ...(storeWhere && storeWhere !== "none" ? storeWhere : {}) },
        select: { id: true, name: true, zone: true },
        orderBy: { name: "asc" },
      }),
    ]);
    clusters = cls;
    zones = zoneRows.map((z) => z.zone!).filter(Boolean);
    crops = cropOpts;
    pests = pestOpts;
    stores = storeRows.map((s) => ({ id: s.id, name: s.name, zone: s.zone }));
  } catch {
    // DB unavailable — render an empty shell.
  }

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <ClustersTab
        initial={clusters}
        zones={zones}
        crops={crops}
        pests={pests}
        stores={stores}
        canChain={canCreate}
        canCreate={canCreate}
        scopeLabel={scope.role === "regional" ? scope.zone : null}
      />
    </div>
  );
}
