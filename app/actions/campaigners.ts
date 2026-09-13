"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActor } from "@/lib/scope";

/** Campaigner assignment management is System-Admin only (same gate as the rest of the Users screen). */
async function requireAdmin() {
  const s = await getSession();
  if (!s?.isAdmin) throw new Error("Not authorized");
  return s;
}

export interface AssignableCampaign { id: number; name: string; status: string; startDate: string; endDate: string }

/** Campaigns a System Admin can assign to a campaigner — newest first (DRAFT/ACTIVE/CLOSED all shown). */
export async function listAssignableCampaigns(): Promise<AssignableCampaign[]> {
  await requireAdmin();
  const rows = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  });
  return rows.map((c) => ({
    id: c.id, name: c.name, status: c.status,
    startDate: c.startDate.toISOString().slice(0, 10),
    endDate: c.endDate.toISOString().slice(0, 10),
  }));
}

/** The campaign ids currently assigned to a campaigner user. */
export async function getCampaignerCampaignIds(userId: number): Promise<number[]> {
  await requireAdmin();
  if (!userId) return [];
  const rows = await prisma.campaignCaller.findMany({ where: { userId }, select: { campaignId: true } });
  return rows.map((r) => r.campaignId);
}

/** Replace a campaigner's assigned campaigns with `campaignIds` (add/remove diff). */
export async function setCampaignerCampaigns(userId: number, campaignIds: number[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!userId) return { ok: false, error: "No user." };
  const actor = await getActor();
  const wanted = [...new Set(campaignIds.filter((n) => Number.isInteger(n) && n > 0))];

  try {
    const existing = await prisma.campaignCaller.findMany({ where: { userId }, select: { campaignId: true } });
    const have = new Set(existing.map((e) => e.campaignId));
    const toAdd = wanted.filter((id) => !have.has(id));
    const toRemove = [...have].filter((id) => !wanted.includes(id));

    await prisma.$transaction([
      ...(toRemove.length ? [prisma.campaignCaller.deleteMany({ where: { userId, campaignId: { in: toRemove } } })] : []),
      ...(toAdd.length
        ? [prisma.campaignCaller.createMany({
            data: toAdd.map((campaignId) => ({ campaignId, userId, assignedByName: actor.name, assignedByCode: actor.code })),
            skipDuplicates: true,
          })]
        : []),
    ]);
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save assignments." };
  }
}
