"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getScope, getActor, canManage } from "@/lib/scope";

/** Helper management is for whoever manages campaigns (central team + system admin). */
async function requireManager() {
  const { role } = await getScope();
  if (!canManage(role)) throw new Error("Only the central team can manage campaign helpers.");
}

function roleLabelOf(role: string, label: string | null): string {
  return label ?? (role === "REGIONAL" ? "Regional Manager" : role === "CENTRAL" ? "Central" : "Agri Officer");
}

export interface HelperCandidate { id: number; name: string; employeeCode: string | null; roleLabel: string; storeName: string | null }
export interface HelperStoreOption { id: number; name: string; zone: string | null; status: string }
export interface CampaignHelperVM { id: number; userId: number; name: string; employeeCode: string | null; roleLabel: string; storeIds: number[]; storeNames: string[] }

/**
 * Field users (agri officers + RMs) and the central team, who can be lent to a campaign.
 *
 * An officer's "home" is their single `User.storeId`; a Regional Manager's is the SET of stores they
 * manage, which is `Store.rmUserIds` (authoritative — a store can have several RMs and an RM many
 * stores). `Store.regionalManager` is only a comma-joined display label, so it is matched as a legacy
 * fallback for stores imported with a manager name but no linked account.
 */
export async function getHelperCandidates(): Promise<HelperCandidate[]> {
  await requireManager();
  const [users, stores] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { in: ["ASR", "STORE_MANAGER", "REGIONAL", "CENTRAL"] } },
      select: { id: true, name: true, employeeCode: true, roleLabel: true, role: true, storeId: true },
      orderBy: { name: "asc" },
    }),
    prisma.store.findMany({ select: { id: true, name: true, rmUserIds: true, regionalManager: true } }),
  ]);
  const sName = new Map(stores.map((s) => [s.id, s.name]));
  // RM → the stores they manage, by user id (authoritative) or legacy manager-name match.
  const rmStores = new Map<number, string[]>();
  const byLegacyName = new Map<string, string[]>();
  for (const s of stores) {
    for (const uid of s.rmUserIds) rmStores.set(uid, [...(rmStores.get(uid) ?? []), s.name]);
    for (const nm of (s.regionalManager ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const k = nm.toLowerCase();
      byLegacyName.set(k, [...(byLegacyName.get(k) ?? []), s.name]);
    }
  }
  /** The home-store label shown next to a candidate: one store, or "N stores" for a multi-store RM. */
  const homeLabel = (u: { id: number; name: string; role: string; storeId: number | null }): string | null => {
    if (u.role === "REGIONAL") {
      const names = rmStores.get(u.id) ?? byLegacyName.get(u.name.trim().toLowerCase()) ?? [];
      return names.length === 0 ? null : names.length === 1 ? names[0] : `${names.length} stores`;
    }
    return u.storeId != null ? sName.get(u.storeId) ?? null : null;
  };
  return users.map((u) => ({
    id: u.id, name: u.name, employeeCode: u.employeeCode,
    roleLabel: roleLabelOf(u.role, u.roleLabel),
    storeName: homeLabel(u),
  }));
}

/** All stores, for the helper store multi-select (closed stores flagged so the picker can show it). */
export async function getHelperStores(): Promise<HelperStoreOption[]> {
  await requireManager();
  const rows = await prisma.store.findMany({ select: { id: true, name: true, zone: true, status: true }, orderBy: { name: "asc" } });
  return rows.map((s) => ({ id: s.id, name: s.name, zone: s.zone, status: s.status }));
}

/** Helpers currently lent to a campaign, with resolved user + store names. */
export async function listCampaignHelpers(campaignId: number): Promise<CampaignHelperVM[]> {
  await requireManager();
  const rows = await prisma.campaignHelper.findMany({ where: { campaignId: Number(campaignId) }, orderBy: { createdAt: "asc" } });
  if (!rows.length) return [];
  const [users, stores] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, employeeCode: true, roleLabel: true, role: true } }),
    prisma.store.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => r.storeIds))] } }, select: { id: true, name: true } }),
  ]);
  const uMap = new Map(users.map((u) => [u.id, u]));
  const sName = new Map(stores.map((s) => [s.id, s.name]));
  return rows.map((r) => {
    const u = uMap.get(r.userId);
    return {
      id: r.id, userId: r.userId,
      name: u?.name ?? `#${r.userId}`, employeeCode: u?.employeeCode ?? null,
      roleLabel: u ? roleLabelOf(u.role, u.roleLabel) : "—",
      storeIds: r.storeIds,
      storeNames: r.storeIds.map((id) => sName.get(id) ?? `#${id}`),
    };
  });
}

/** Add or replace a helper grant (user + the stores they cover on this campaign). */
export async function saveCampaignHelper(input: { campaignId: number; userId: number; storeIds: number[] }): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const campaignId = Number(input.campaignId), userId = Number(input.userId);
  if (!campaignId || !userId) return { ok: false, error: "Pick a person to lend to this campaign." };
  const storeIds = [...new Set((input.storeIds ?? []).filter((v) => Number.isInteger(v) && v > 0))];
  if (!storeIds.length) return { ok: false, error: "Pick at least one store for them to cover." };
  const actor = await getActor();
  try {
    await prisma.campaignHelper.upsert({
      where: { campaignId_userId: { campaignId, userId } },
      create: { campaignId, userId, storeIds, assignedByName: actor.name, assignedByCode: actor.code },
      update: { storeIds },
    });
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the helper." };
  }
}

/** Remove a helper grant. */
export async function removeCampaignHelper(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  try {
    await prisma.campaignHelper.delete({ where: { id: Number(id) } });
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove the helper." };
  }
}
