import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/scope";

/**
 * "Who works this campaign" — the picked team. Officers go to CampaignWorker (own-store access when
 * their store is in the campaign, whole campaign otherwise); campaigners go to CampaignCaller (the same
 * table the Users screen edits). Plain module (not "use server").
 *
 * Regional Managers are never picked into a team: they always see the campaigns that reach the stores
 * they manage. Those stores come from `scope.managedStoreIds`, which resolves `Store.rmUserIds` (a store
 * can have SEVERAL managers) with the legacy manager-name match as a fallback — never by treating the
 * denormalised comma-joined `Store.regionalManager` label as a key.
 */

/**
 * What the current officer/RM may see + work on ONE campaign: "all" (the whole TEST group) or a store list.
 *  - RM: the stores they manage (Store.rmUserIds), always on a picked-team campaign; on a legacy one
 *    unless it's campaigners-only.
 *  - Officer, picked-team campaign (teamExplicit): only if picked (CampaignWorker) — own store, or
 *    everything when added as an extra (allStores). Unpicked officers get nothing.
 *  - Officer, legacy campaign: own store unless it's campaigners-only.
 * A helper grant (CampaignHelper) always adds its named stores on top. Only meaningful for officer/RM.
 */
export async function campaignFieldAccess(campaignId: number): Promise<"all" | number[]> {
  const { role, userId, storeId, managedStoreIds } = await getScope();
  const [camp, helper, worker] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { workedBy: true, teamExplicit: true } }),
    userId != null ? prisma.campaignHelper.findUnique({ where: { campaignId_userId: { campaignId, userId } }, select: { storeIds: true } }) : null,
    userId != null && role === "officer" ? prisma.campaignWorker.findUnique({ where: { campaignId_userId: { campaignId, userId } }, select: { allStores: true } }) : null,
  ]);
  if (!camp) return [];
  let own: number[];
  if (role === "regional") own = camp.teamExplicit || camp.workedBy !== "CAMPAIGNERS" ? managedStoreIds ?? [] : [];
  else if (camp.teamExplicit) {
    if (worker?.allStores) return "all";
    own = worker && storeId != null ? [storeId] : [];
  } else own = camp.workedBy !== "CAMPAIGNERS" && storeId != null ? [storeId] : [];
  return [...new Set([...own, ...(helper?.storeIds ?? [])])];
}

export interface TeamOfficer { id: number; name: string; code: string | null; storeId: number | null; storeName: string | null }
export interface TeamCampaigner { id: number; name: string; code: string | null }

export async function teamCandidates(): Promise<{ officers: TeamOfficer[]; campaigners: TeamCampaigner[] }> {
  const [users, stores] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, approvalStatus: "APPROVED", role: { in: ["ASR", "STORE_MANAGER", "CAMPAIGNER"] } },
      select: { id: true, name: true, employeeCode: true, role: true, storeId: true },
      orderBy: { name: "asc" },
    }),
    prisma.store.findMany({ select: { id: true, name: true } }),
  ]);
  const sName = new Map(stores.map((s) => [s.id, s.name]));
  return {
    officers: users.filter((u) => u.role !== "CAMPAIGNER").map((u) => ({ id: u.id, name: u.name, code: u.employeeCode, storeId: u.storeId, storeName: u.storeId != null ? sName.get(u.storeId) ?? null : null })),
    campaigners: users.filter((u) => u.role === "CAMPAIGNER").map((u) => ({ id: u.id, name: u.name, code: u.employeeCode })),
  };
}

/** Stores that have farmers enrolled in the campaign. */
export async function campaignStoreIds(campaignId: number): Promise<number[]> {
  const rows = await prisma.campaignMember.groupBy({ by: ["storeId"], where: { campaignId, storeId: { not: null } } });
  return rows.map((r) => r.storeId!).filter((x) => x != null);
}

/**
 * Replace a campaign's team. Officers whose store is in the campaign work their own store's farmers;
 * any other officer works the whole campaign. Marks the campaign teamExplicit and keeps the legacy
 * workedBy badge in step. Returns an error string for bad ids.
 */
export async function applyCampaignTeam(
  campaignId: number,
  officerIds: number[],
  campaignerIds: number[],
  actor: { name: string | null; code: string | null },
): Promise<string | null> {
  const want = { officers: [...new Set(officerIds)], campaigners: [...new Set(campaignerIds)] };
  const users = await prisma.user.findMany({
    where: { id: { in: [...want.officers, ...want.campaigners] }, active: true, approvalStatus: "APPROVED" },
    select: { id: true, role: true, storeId: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  if (want.officers.some((id) => !["ASR", "STORE_MANAGER"].includes(String(byId.get(id)?.role)))) return "One of the picked officers isn't an active Agri Officer.";
  if (want.campaigners.some((id) => String(byId.get(id)?.role) !== "CAMPAIGNER")) return "One of the picked campaigners isn't an active Campaigner.";

  const stores = new Set(await campaignStoreIds(campaignId));
  const workedBy = want.officers.length ? (want.campaigners.length ? "BOTH" : "STORE") : "CAMPAIGNERS";
  await prisma.$transaction([
    prisma.campaignWorker.deleteMany({ where: { campaignId } }),
    prisma.campaignWorker.createMany({
      data: want.officers.map((userId) => {
        const sid = byId.get(userId)!.storeId;
        return { campaignId, userId, allStores: sid == null || !stores.has(sid), assignedByName: actor.name, assignedByCode: actor.code };
      }),
    }),
    prisma.campaignCaller.deleteMany({ where: { campaignId, userId: { notIn: want.campaigners } } }),
    prisma.campaignCaller.createMany({
      data: want.campaigners.map((userId) => ({ campaignId, userId, assignedByName: actor.name, assignedByCode: actor.code })),
      skipDuplicates: true,
    }),
    prisma.campaign.update({ where: { id: campaignId }, data: { teamExplicit: true, workedBy } }),
  ]);
  return null;
}

/**
 * The team as the picker should show it. For a legacy (not yet picked) campaign, the effective team is
 * reconstructed: every officer of the campaign's stores (unless it was campaigners-only) + assigned campaigners.
 */
export async function readCampaignTeam(campaignId: number): Promise<{ explicit: boolean; officerIds: number[]; campaignerIds: number[]; storeIds: number[] } | null> {
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { teamExplicit: true, workedBy: true } });
  if (!camp) return null;
  const [storeIds, callers, workers] = await Promise.all([
    campaignStoreIds(campaignId),
    prisma.campaignCaller.findMany({ where: { campaignId }, select: { userId: true } }),
    camp.teamExplicit ? prisma.campaignWorker.findMany({ where: { campaignId }, select: { userId: true } }) : Promise.resolve([]),
  ]);
  let officerIds = workers.map((w) => w.userId);
  if (!camp.teamExplicit && camp.workedBy !== "CAMPAIGNERS" && storeIds.length) {
    const rows = await prisma.user.findMany({ where: { active: true, approvalStatus: "APPROVED", role: { in: ["ASR", "STORE_MANAGER"] }, storeId: { in: storeIds } }, select: { id: true } });
    officerIds = rows.map((r) => r.id);
  }
  return { explicit: camp.teamExplicit, officerIds, campaignerIds: callers.map((c) => c.userId), storeIds };
}
