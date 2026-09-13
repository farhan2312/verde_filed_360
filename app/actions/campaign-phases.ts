"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, canManage, getActor } from "@/lib/scope";
import { shortStoreName } from "@/lib/store-utils";
import { segMeta } from "@/lib/campaign-segments";
import {
  asCoupons, asRoundMessaging, matchTarget, targetLabel,
  PURCHASED_LABEL, NOT_PURCHASED_LABEL, EMPTY_MESSAGING,
  type Coupon, type RoundMessaging,
} from "@/lib/campaign-phases";

const iso = (d: Date) => d.toISOString().slice(0, 10);
async function isManager(): Promise<boolean> { const { role } = await getScope(); return canManage(role); }

/** Farmers (from a given set) who made ANY real purchase inside the campaign window. */
async function purchasedFarmerIds(farmerIds: number[], from: Date, to: Date): Promise<Set<number>> {
  if (!farmerIds.length) return new Set();
  const rows = await prisma.saleLine.findMany({
    where: { farmerId: { in: farmerIds }, source: "REAL", soldAt: { gte: from, lt: to } },
    select: { farmerId: true }, distinct: ["farmerId"],
  });
  return new Set(rows.map((r) => r.farmerId!).filter((x): x is number => x != null));
}

function segLabel(value: string | null, lifecycle: string | null): string {
  return [value, lifecycle].filter(Boolean).map((s) => segMeta(s!).label).join(" · ") || "—";
}

/* ─────────────────────────── Round definition ─────────────────────────── */

export interface PhaseVM {
  id: number; ordinal: number; name: string;
  defaultStart: string; defaultEnd: string;
  coupons: Coupon[]; messaging: RoundMessaging;
}
export interface CampaignPhaseConfig {
  campaignId: number; campaignName: string; campaignStart: string; campaignEnd: string;
  currentRound: number; phases: PhaseVM[]; canManage: boolean;
}

export async function getCampaignPhaseConfig(campaignId: number): Promise<CampaignPhaseConfig | null> {
  const camp = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { phases: { orderBy: { ordinal: "asc" } } },
  });
  if (!camp) return null;
  return {
    campaignId: camp.id, campaignName: camp.name,
    campaignStart: iso(camp.startDate), campaignEnd: iso(camp.endDate),
    currentRound: camp.currentRound, canManage: await isManager(),
    phases: camp.phases.map((p) => ({
      id: p.id, ordinal: p.ordinal, name: p.name,
      defaultStart: iso(p.defaultStart), defaultEnd: iso(p.defaultEnd),
      coupons: asCoupons(p.coupons), messaging: asRoundMessaging(p.commConfig),
    })),
  };
}

export interface PhaseInput {
  ordinal: number; name: string;
  defaultStart: string; defaultEnd: string;
  coupons?: Coupon[]; messaging?: RoundMessaging;
}

/** Full-replace the round definition of a campaign (manager only). Validates each round ⊆ campaign window. */
export async function saveCampaignPhases(campaignId: number, phases: PhaseInput[]): Promise<{ ok: boolean; error?: string }> {
  if (!(await isManager())) return { ok: false, error: "Only the central team can edit rounds." };
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { startDate: true, endDate: true, currentRound: true } });
  if (!camp) return { ok: false, error: "Campaign not found." };
  const cs = camp.startDate, ce = camp.endDate;

  const cleaned = [...phases].sort((a, b) => a.ordinal - b.ordinal);
  if (!cleaned.length) return { ok: false, error: "A campaign needs at least one round." };

  const seen = new Set<number>();
  for (const p of cleaned) {
    if (seen.has(p.ordinal)) return { ok: false, error: `Duplicate round number ${p.ordinal}.` };
    seen.add(p.ordinal);
    if (!p.name.trim()) return { ok: false, error: "Every round needs a name." };
    const s = new Date(`${p.defaultStart}T00:00:00`), e = new Date(`${p.defaultEnd}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return { ok: false, error: `Set valid dates for "${p.name}".` };
    if (s > e) return { ok: false, error: `"${p.name}" ends before it starts.` };
    if (s < cs || e > ce) return { ok: false, error: `"${p.name}" must sit within the campaign window (${iso(cs)} – ${iso(ce)}).` };
  }

  try {
    const maxOrd = Math.max(...cleaned.map((p) => p.ordinal));
    await prisma.$transaction(async (tx) => {
      await tx.campaignPhase.deleteMany({ where: { campaignId } });
      for (const p of cleaned) {
        await tx.campaignPhase.create({
          data: {
            campaignId, ordinal: p.ordinal, name: p.name.trim(),
            defaultStart: new Date(`${p.defaultStart}T00:00:00`), defaultEnd: new Date(`${p.defaultEnd}T00:00:00`),
            coupons: (p.coupons ?? []) as unknown as Prisma.InputJsonValue,
            commConfig: (p.messaging ?? EMPTY_MESSAGING) as unknown as Prisma.InputJsonValue,
          },
        });
      }
      if (camp.currentRound > maxOrd) await tx.campaign.update({ where: { id: campaignId }, data: { currentRound: maxOrd } });
    });
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Save failed." }; }
}

/* ─────────────────────────── Round status + advancement ─────────────────────────── */

export interface RoundStatus {
  campaignId: number;
  rounds: { ordinal: number; name: string }[];
  currentOrdinal: number; roundName: string;
  windowStart: string; windowEnd: string;
  memberCount: number;                 // scoped TEST members
  purchaseSplit: boolean;              // round 2+
  purchasedCount: number; notPurchasedCount: number;
  hasNext: boolean; nextRoundName: string | null;
  advancedByName: string | null; advancedAt: string | null;
  canManage: boolean;
}

export async function getRoundStatus(campaignId: number): Promise<RoundStatus | null> {
  const { role, storeId, zone } = await getScope();
  const camp = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { phases: { orderBy: { ordinal: "asc" } } },
  });
  if (!camp || camp.phases.length === 0) return null;
  const maxOrd = Math.max(...camp.phases.map((p) => p.ordinal));
  const ord = Math.min(camp.currentRound, maxOrd);
  const round = camp.phases.find((p) => p.ordinal === ord) ?? camp.phases[0];
  const purchaseSplit = ord >= 2;

  const where: Prisma.CampaignMemberWhereInput = { campaignId, group: "TEST" };
  const base = { campaignId, rounds: camp.phases.map((p) => ({ ordinal: p.ordinal, name: p.name })), currentOrdinal: ord, roundName: round.name, windowStart: iso(round.defaultStart), windowEnd: iso(round.defaultEnd), hasNext: ord < maxOrd, nextRoundName: ord < maxOrd ? (camp.phases.find((p) => p.ordinal === ord + 1)?.name ?? null) : null, canManage: canManage(role), purchaseSplit };
  if (role === "officer") { if (storeId == null) return { ...base, memberCount: 0, purchasedCount: 0, notPurchasedCount: 0, advancedByName: null, advancedAt: null }; where.storeId = storeId; }
  else if (role === "regional") { if (zone == null) return { ...base, memberCount: 0, purchasedCount: 0, notPurchasedCount: 0, advancedByName: null, advancedAt: null }; where.zone = zone; }

  const members = await prisma.campaignMember.findMany({ where, select: { farmerId: true } });
  let purchasedCount = 0;
  if (purchaseSplit && members.length) {
    const pset = await purchasedFarmerIds(members.map((m) => m.farmerId), camp.startDate, new Date(camp.endDate.getTime() + 864e5));
    purchasedCount = members.filter((m) => pset.has(m.farmerId)).length;
  }
  const lastAdvance = await prisma.campaignPhaseAdvance.findFirst({ where: { campaignId }, orderBy: { createdAt: "desc" } });

  return {
    ...base,
    memberCount: members.length,
    purchasedCount, notPurchasedCount: members.length - purchasedCount,
    advancedByName: lastAdvance?.byName ?? null, advancedAt: lastAdvance ? iso(lastAdvance.createdAt) : null,
  };
}

export async function advanceCampaignRound(input: { campaignId: number; attested: boolean; note?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await isManager())) return { ok: false, error: "Only the central team can advance rounds." };
  if (!input.attested) return { ok: false, error: "Confirm the round's sales data is uploaded before advancing." };
  const camp = await prisma.campaign.findUnique({ where: { id: input.campaignId }, include: { phases: { select: { ordinal: true } } } });
  if (!camp || !camp.phases.length) return { ok: false, error: "Campaign has no rounds." };
  const maxOrd = Math.max(...camp.phases.map((p) => p.ordinal));
  const current = Math.min(camp.currentRound, maxOrd);
  if (current >= maxOrd) return { ok: false, error: "The campaign is already in its final round." };
  const next = current + 1;

  const actor = await getActor();
  await prisma.$transaction([
    prisma.campaign.update({ where: { id: input.campaignId }, data: { currentRound: next } }),
    prisma.campaignPhaseAdvance.create({
      data: { campaignId: input.campaignId, fromOrdinal: current, toOrdinal: next, attestationNote: input.note?.trim() || null, byName: actor.name, byCode: actor.code },
    }),
  ]);
  revalidatePath("/campaigns");
  return { ok: true };
}

export interface AdvanceLogVM { fromOrdinal: number; toOrdinal: number; note: string | null; by: string | null; at: string }
export async function getRoundAdvanceHistory(campaignId: number): Promise<AdvanceLogVM[]> {
  const rows = await prisma.campaignPhaseAdvance.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ fromOrdinal: r.fromOrdinal, toOrdinal: r.toOrdinal, note: r.attestationNote, by: r.byName, at: r.createdAt.toISOString() }));
}

/* ─────────────────────────── Round-aware outreach ─────────────────────────── */

export interface PhaseOutreachMember {
  memberId: number; farmerId: number; name: string; mobile: string | null; village: string | null; store: string | null;
  segmentLabel: string; groupLabel: string;
  reached: boolean; mediums: string[];
  recCommPlan: string | null; recChannel: string | null;
}
export interface PhaseOutreach {
  campaignId: number; ordinal: number; roundName: string; purchaseSplit: boolean;
  coupons: Coupon[]; members: PhaseOutreachMember[];
}

export async function getPhaseOutreach(campaignId: number): Promise<PhaseOutreach | null> {
  const { role, storeId, zone } = await getScope();
  const camp = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { phases: { orderBy: { ordinal: "asc" } } },
  });
  if (!camp || !camp.phases.length) return null;
  const maxOrd = Math.max(...camp.phases.map((p) => p.ordinal));
  const ord = Math.min(camp.currentRound, maxOrd);
  const round = camp.phases.find((p) => p.ordinal === ord) ?? camp.phases[0];
  const messaging = asRoundMessaging(round.commConfig);
  const purchaseSplit = ord >= 2;

  const where: Prisma.CampaignMemberWhereInput = { campaignId, group: "TEST" };
  if (role === "officer") { if (storeId == null) return null; where.storeId = storeId; }
  else if (role === "regional") { if (zone == null) return null; where.zone = zone; }

  const members = await prisma.campaignMember.findMany({ where, orderBy: { id: "asc" } });
  const farmerIds = members.map((m) => m.farmerId);
  const farmers = new Map((await prisma.farmer.findMany({ where: { id: { in: farmerIds } }, select: { id: true, name: true, mobile: true, village: true, store: { select: { name: true } } } })).map((f) => [f.id, f]));
  const pset = purchaseSplit ? await purchasedFarmerIds(farmerIds, camp.startDate, new Date(camp.endDate.getTime() + 864e5)) : new Set<number>();

  const out: PhaseOutreachMember[] = members.map((m) => {
    const bought = purchaseSplit && pset.has(m.farmerId);
    const list = purchaseSplit ? (bought ? messaging.purchased : messaging.notPurchased) : messaging.targets;
    const t = matchTarget(list, { value: m.valueSegment, lifecycle: m.lifecycleSegment });
    const bucket = purchaseSplit ? (bought ? PURCHASED_LABEL : NOT_PURCHASED_LABEL) : "";
    const tl = t ? targetLabel(t) : "No target set";
    const f = farmers.get(m.farmerId);
    return {
      memberId: m.id, farmerId: m.farmerId, name: f?.name ?? "Unknown", mobile: f?.mobile ?? null, village: f?.village ?? null,
      store: f?.store?.name ? (shortStoreName(f.store.name) || f.store.name) : null,
      segmentLabel: segLabel(m.valueSegment, m.lifecycleSegment),
      groupLabel: purchaseSplit ? `${bucket} · ${tl}` : tl,
      reached: m.reached, mediums: m.mediums,
      recCommPlan: t?.commPlan ?? null, recChannel: t?.channel ?? null,
    };
  });

  return { campaignId, ordinal: ord, roundName: round.name, purchaseSplit, coupons: asCoupons(round.coupons), members: out };
}
