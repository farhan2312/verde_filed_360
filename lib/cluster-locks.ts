import { prisma } from "@/lib/prisma";
import { resolveCampaignClusters } from "@/lib/campaign-clusters";

/**
 * Clusters that are "frozen" because they feed a LIVE campaign — one whose status is not CLOSED.
 * A campaign reaches the clusters it picked (Campaign.clusterIds / legacy clusterId), or — when it
 * runs on the whole project — every cluster bundled into that project.
 *
 * A frozen cluster's rule (and the cluster itself) must not be edited or deleted: it would retarget
 * or pull the ground out from under a campaign that is already running on that audience. Once the
 * campaign is closed, the lock lifts automatically.
 *
 * Returns clusterId → the name of ONE locking campaign (used for the UI message). Pass `clusterIds`
 * to only compute the clusters you care about; omit to get every locked cluster.
 */
export async function clusterCampaignLocks(clusterIds?: number[]): Promise<Map<number, string>> {
  const camps = await prisma.campaign.findMany({
    where: { status: { not: "CLOSED" } },
    select: { name: true, clusterId: true, clusterIds: true, projectId: true },
  });
  const targets = await resolveCampaignClusters(camps);

  const want = clusterIds ? new Set(clusterIds) : null;
  const locks = new Map<number, string>();
  const add = (cid: number, name: string) => {
    if ((!want || want.has(cid)) && !locks.has(cid)) locks.set(cid, name);
  };
  for (const c of camps) for (const cid of targets.get(c) ?? []) add(cid, c.name);
  return locks;
}

/** The name of a live campaign locking this one cluster, or null when it's free to edit/delete. */
export async function clusterCampaignLock(clusterId: number): Promise<string | null> {
  const locks = await clusterCampaignLocks([clusterId]);
  return locks.get(clusterId) ?? null;
}
