import { prisma } from "@/lib/prisma";

/**
 * Which clusters a campaign actually targets. Precedence:
 *   Campaign.clusterIds (any chosen subset) → Campaign.clusterId (legacy single pick) → every cluster of its project.
 */
export type CampaignClusterRef = { clusterIds: number[]; clusterId: number | null; projectId: number | null };

export function explicitClusterIds(c: CampaignClusterRef): number[] | null {
  if (c.clusterIds.length) return c.clusterIds;
  if (c.clusterId != null) return [c.clusterId];
  return null; // whole project
}

/** Resolve many campaigns at once: campaign → its cluster ids (one project lookup for the "whole project" ones). */
export async function resolveCampaignClusters<T extends CampaignClusterRef>(camps: T[]): Promise<Map<T, number[]>> {
  const needProject = [...new Set(camps.filter((c) => !explicitClusterIds(c) && c.projectId != null).map((c) => c.projectId!))];
  const projs = needProject.length
    ? await prisma.project.findMany({ where: { id: { in: needProject } }, select: { id: true, clusters: { select: { id: true } } } })
    : [];
  const byProject = new Map(projs.map((p) => [p.id, p.clusters.map((c) => c.id)]));
  return new Map(camps.map((c) => [c, explicitClusterIds(c) ?? (c.projectId != null ? byProject.get(c.projectId) ?? [] : [])]));
}
