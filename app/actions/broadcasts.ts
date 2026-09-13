"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getScope, canManage, getActor } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { sendSms, zapConfig, getSmsDeliveryReport } from "@/lib/zapsms";
import { sendWhatsApp, waConfig } from "@/lib/whatsapp";
import { resolveVars, fillSmsTemplate, fillWaTemplate, positionalParams, type FarmerVarSource } from "@/lib/campaign-vars";

export type Channel = "SMS" | "WHATSAPP";
const validMobile = (m: string | null | undefined) => /^[6-9]\d{9}$/.test((m ?? "").replace(/\D/g, "").slice(-10));

async function adminOnly(): Promise<boolean> {
  const { role } = await getScope();
  return canManage(role);
}

/** CampaignMember has no `farmer` relation — batch-load mobile + opt-in by farmerId. */
async function farmerMap(ids: (number | null)[]): Promise<Map<number, { mobile: string | null; whatsappOptIn: boolean }>> {
  const fids = [...new Set(ids.filter((x): x is number => x != null))];
  if (!fids.length) return new Map();
  const rows = await prisma.farmer.findMany({ where: { id: { in: fids } }, select: { id: true, mobile: true, whatsappOptIn: true } });
  return new Map(rows.map((f) => [f.id, { mobile: f.mobile, whatsappOptIn: f.whatsappOptIn }]));
}

export interface BroadcastAudience {
  total: number;        // TEST-group members
  withMobile: number;   // valid 10-digit mobile
  invalidMobile: number; // has a mobile on file, but not a valid 10-digit one → skipped
  noMobile: number;     // no mobile at all → skipped
  optedIn: number;      // opted-in + valid mobile (the WhatsApp-eligible set)
  alreadyContacted: number; // members whose outcome already includes this channel
  eligible: number;     // who this channel would send to
  smsReady: boolean; waReady: boolean;
}

/** Count the TEST-group audience for a channel (WhatsApp = opted-in only; SMS = any valid mobile). */
export async function getBroadcastAudience(campaignId: number, channel: Channel): Promise<BroadcastAudience> {
  const base: BroadcastAudience = { total: 0, withMobile: 0, invalidMobile: 0, noMobile: 0, optedIn: 0, alreadyContacted: 0, eligible: 0, smsReady: zapConfig().ready, waReady: waConfig().ready };
  if (!(await adminOnly())) return base;
  const members = await prisma.campaignMember.findMany({
    where: { campaignId, group: "TEST" },
    select: { farmerId: true, mediums: true },
  });
  const fmap = await farmerMap(members.map((m) => m.farmerId));
  let withMobile = 0, invalidMobile = 0, noMobile = 0, optedIn = 0, contacted = 0;
  for (const m of members) {
    const f = fmap.get(m.farmerId);
    const raw = (f?.mobile ?? "").trim();
    const ok = validMobile(f?.mobile);
    if (ok) withMobile++;
    else if (raw) invalidMobile++; // has a number, but malformed
    else noMobile++;
    if (ok && f?.whatsappOptIn) optedIn++;
    if (m.mediums.includes(channel)) contacted++;
  }
  const eligible = channel === "WHATSAPP" ? optedIn : withMobile;
  return { total: members.length, withMobile, invalidMobile, noMobile, optedIn, alreadyContacted: contacted, eligible, smsReady: base.smsReady, waReady: base.waReady };
}

export interface BroadcastPreviewRow { name: string; mobile: string; message: string }
/** A few real, filled sample messages for the picked comm plan — so the admin sees exactly what sends. */
export async function getBroadcastPreview(input: { campaignId: number; channel: Channel; commTemplateId: number; limit?: number }): Promise<{ ok: boolean; rows: BroadcastPreviewRow[]; error?: string }> {
  if (!(await adminOnly())) return { ok: false, rows: [], error: "Admins only." };
  const tpl = await prisma.commTemplate.findUnique({
    where: { id: input.commTemplateId },
    select: { template: true, smsVariables: true, waVariables: true, waTemplateName: true },
  });
  if (!tpl) return { ok: false, rows: [], error: "Comm plan not found." };
  const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { endDate: true } });
  const members = await prisma.campaignMember.findMany({ where: { campaignId: input.campaignId, group: "TEST" }, select: { farmerId: true }, take: 60 });
  const farmers = await prisma.farmer.findMany({
    where: { id: { in: members.map((m) => m.farmerId).filter((x): x is number => x != null) } },
    select: { name: true, mobile: true, village: true, hniGap: true, cropTags: true, crop: true, store: { select: { name: true } } },
  });
  const rows: BroadcastPreviewRow[] = [];
  for (const f of farmers) {
    if (!validMobile(f.mobile)) continue; // preview only who'd actually get it
    const vars = resolveVars({ name: f.name, mobile: f.mobile, village: f.village, hniGap: f.hniGap, cropTags: f.cropTags, crop: f.crop, storeName: f.store?.name ?? null }, campaign?.endDate ?? null);
    const message = input.channel === "WHATSAPP"
      ? fillWaTemplate(tpl.template, tpl.waVariables, vars)
      : fillSmsTemplate({ template: tpl.template, smsVariables: tpl.smsVariables }, vars);
    rows.push({ name: (f.name ?? "").trim() || "—", mobile: (f.mobile ?? "").replace(/\D/g, "").slice(-10), message });
    if (rows.length >= (input.limit ?? 3)) break;
  }
  return { ok: true, rows };
}

/** Create a broadcast job + snapshot its recipients (idempotent, resumable). Admin-only. */
export async function createBroadcast(input: {
  campaignId: number; channel: Channel; commTemplateId: number; skipContacted?: boolean;
}): Promise<{ ok: boolean; broadcastId?: number; total?: number; error?: string }> {
  if (!(await adminOnly())) return { ok: false, error: "Mass send is available to admins only." };
  const { channel } = input;

  const tpl = await prisma.commTemplate.findUnique({
    where: { id: input.commTemplateId },
    select: { name: true, template: true, dltTemplateId: true, waTemplateName: true, waLanguage: true, waVariables: true, smsVariables: true },
  });
  if (!tpl) return { ok: false, error: "Comm plan not found." };
  if (channel === "WHATSAPP" && !tpl.waTemplateName) return { ok: false, error: "This comm plan has no approved WhatsApp template — set one in the Comm Plan tab." };
  if (channel === "SMS" && !zapConfig().ready) return { ok: false, error: "SMS gateway not configured." };
  if (channel === "WHATSAPP" && !waConfig().ready) return { ok: false, error: "WhatsApp not configured." };

  const members = await prisma.campaignMember.findMany({
    where: { campaignId: input.campaignId, group: "TEST" },
    select: { id: true, farmerId: true, mediums: true },
  });
  const fmap = await farmerMap(members.map((m) => m.farmerId));
  const eligible = members.filter((m) => {
    const f = fmap.get(m.farmerId);
    if (!validMobile(f?.mobile)) return false;
    if (channel === "WHATSAPP" && !f?.whatsappOptIn) return false;
    if (input.skipContacted && m.mediums.includes(channel)) return false;
    return true;
  });
  if (eligible.length === 0) return { ok: false, error: "No eligible recipients for this channel." };

  const label = channel === "WHATSAPP" ? `${tpl.name} · ${tpl.waTemplateName}` : tpl.name;
  const actor = await getActor();
  const bc = await prisma.broadcast.create({
    data: {
      campaignId: input.campaignId, channel, commTemplateId: input.commTemplateId, templateLabel: label,
      status: "running", total: eligible.length, createdByName: actor.name, createdByCode: actor.code,
    },
  });

  // Snapshot recipients in chunks (handles 10k+).
  for (let i = 0; i < eligible.length; i += 2000) {
    await prisma.broadcastRecipient.createMany({
      data: eligible.slice(i, i + 2000).map((m) => ({
        broadcastId: bc.id, memberId: m.id, farmerId: m.farmerId,
        mobile: (fmap.get(m.farmerId)?.mobile ?? "").replace(/\D/g, "").slice(-10), status: "pending",
      })),
    });
  }
  await logAudit("Broadcast", "SEND", `Mass ${channel === "WHATSAPP" ? "WhatsApp" : "SMS"} to ${eligible.length} farmers via ${label}`, actor.name);
  return { ok: true, broadcastId: bc.id, total: eligible.length };
}

export interface BatchResult {
  ok: boolean; error?: string;
  done: boolean; batchSent: number; batchFailed: number;
  sent: number; failed: number; total: number; remaining: number;
}

/** Process the next `limit` pending recipients. The client loops this until done (with a small pause). */
export async function runBroadcastBatch(input: { broadcastId: number; limit?: number }): Promise<BatchResult> {
  const empty: BatchResult = { ok: false, done: true, batchSent: 0, batchFailed: 0, sent: 0, failed: 0, total: 0, remaining: 0 };
  if (!(await adminOnly())) return { ...empty, error: "Admins only." };
  const limit = Math.min(60, Math.max(1, input.limit ?? 40));

  const bc = await prisma.broadcast.findUnique({ where: { id: input.broadcastId } });
  if (!bc) return { ...empty, error: "Broadcast not found." };
  if (bc.status === "canceled") return { ...empty, ok: true, done: true, sent: bc.sent, failed: bc.failed, total: bc.total };

  const tpl = bc.commTemplateId ? await prisma.commTemplate.findUnique({ where: { id: bc.commTemplateId } }) : null;
  const campaign = await prisma.campaign.findUnique({ where: { id: bc.campaignId }, select: { endDate: true } });

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: bc.id, status: "pending" }, orderBy: { id: "asc" }, take: limit,
  });
  if (recipients.length === 0) {
    if (bc.status !== "done") await prisma.broadcast.update({ where: { id: bc.id }, data: { status: "done" } });
    return { ok: true, done: true, batchSent: 0, batchFailed: 0, sent: bc.sent, failed: bc.failed, total: bc.total, remaining: 0 };
  }

  // Batch-load the farmers referenced by this batch (no per-farmer queries).
  const farmerIds = recipients.map((r) => r.farmerId).filter((x): x is number => x != null);
  const farmers = new Map((await prisma.farmer.findMany({
    where: { id: { in: farmerIds } },
    select: { id: true, name: true, mobile: true, village: true, hniGap: true, cropTags: true, crop: true, store: { select: { name: true } } },
  })).map((f) => [f.id, f]));

  const actor = await getActor();
  const { cfg: zap } = zapConfig();
  let batchSent = 0, batchFailed = 0;

  for (const r of recipients) {
    const f = r.farmerId != null ? farmers.get(r.farmerId) : null;
    const src: FarmerVarSource = {
      name: f?.name ?? null, mobile: f?.mobile ?? r.mobile, village: f?.village ?? null,
      hniGap: f?.hniGap ?? null, cropTags: f?.cropTags ?? [], crop: f?.crop ?? null, storeName: f?.store?.name ?? null,
    };
    const vars = resolveVars(src, campaign?.endDate ?? null);

    let ok = false, providerId: string | undefined, error: string | undefined, messageText = "";
    try {
      if (bc.channel === "WHATSAPP") {
        messageText = `[template ${tpl?.waTemplateName ?? ""}]`;
        const res = await sendWhatsApp({ mobile: r.mobile, templateName: tpl?.waTemplateName ?? null, languageCode: tpl?.waLanguage ?? null, bodyParams: positionalParams(tpl?.waVariables, vars) });
        ok = res.ok; providerId = res.providerId; error = res.error;
        await prisma.whatsAppLog.create({ data: { farmerId: r.farmerId, campaignId: bc.campaignId, memberId: r.memberId, broadcastId: bc.id, mobile: r.mobile, kind: "template", templateName: tpl?.waTemplateName ?? null, message: messageText, ok, providerId: providerId ?? null, status: res.status ?? null, error: error ?? null, sentByName: actor.name, sentByCode: actor.code } });
      } else {
        messageText = fillSmsTemplate({ template: tpl?.template ?? "", smsVariables: tpl?.smsVariables }, vars);
        const res = await sendSms({ mobile: r.mobile, message: messageText, templateId: tpl?.dltTemplateId ?? null });
        ok = res.ok; providerId = res.providerId; error = res.error;
        await prisma.smsLog.create({ data: { farmerId: r.farmerId, campaignId: bc.campaignId, memberId: r.memberId, broadcastId: bc.id, mobile: r.mobile, senderId: zap.senderId || null, dltTemplateId: tpl?.dltTemplateId ?? null, message: messageText, ok, providerId: providerId ?? null, status: res.status ? `BROADCAST · ${res.status}` : "BROADCAST", error: error ?? null, sentByName: actor.name, sentByCode: actor.code } });
      }
    } catch (e) {
      ok = false; error = e instanceof Error ? e.message : "Send failed.";
    }

    await prisma.broadcastRecipient.update({ where: { id: r.id }, data: { status: ok ? "sent" : "failed", providerId: providerId ?? null, error: error ?? null, sentAt: new Date() } });
    // NOTE: a mass send does NOT mark the member "reached" — that's for deliberate 1-on-1 contacts only.
    // The broadcast track (member.broadcastMediums) is set later, when delivery is CONFIRMED (SMS DLR /
    // WA webhook), via markBroadcastDelivered(). Farmers stay pending for individual outreach.
    if (ok) batchSent++; else batchFailed++;
  }

  const updated = await prisma.broadcast.update({
    where: { id: bc.id },
    data: { sent: { increment: batchSent }, failed: { increment: batchFailed } },
  });
  const remaining = await prisma.broadcastRecipient.count({ where: { broadcastId: bc.id, status: "pending" } });
  if (remaining === 0) await prisma.broadcast.update({ where: { id: bc.id }, data: { status: "done" } });
  revalidatePath("/campaigns");
  return { ok: true, done: remaining === 0, batchSent, batchFailed, sent: updated.sent, failed: updated.failed, total: updated.total, remaining };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Add a delivered broadcast channel to the members' broadcast track (dedup; sets broadcastAt on first). */
async function markMembersBroadcast(memberIds: (number | null)[], channel: "SMS" | "WHATSAPP"): Promise<number> {
  const uniq = [...new Set(memberIds.filter((x): x is number => x != null))];
  if (!uniq.length) return 0;
  const members = await prisma.campaignMember.findMany({ where: { id: { in: uniq } }, select: { id: true, broadcastMediums: true } });
  let n = 0;
  for (const m of members) {
    if (m.broadcastMediums.includes(channel)) continue;
    await prisma.campaignMember.update({ where: { id: m.id }, data: { broadcastMediums: { push: channel }, ...(m.broadcastMediums.length ? {} : { broadcastAt: new Date() }) } }).catch(() => { /* member gone */ });
    n++;
  }
  return n;
}

/**
 * Pull delivery reports for a broadcast and mark DELIVERED farmers on the broadcast track. SMS uses the
 * bulk GetSMS report (one paginated call); WhatsApp delivery arrives via the webhook, so here we just
 * (re)apply member marks from already-delivered WA logs. Admin-only.
 */
export async function syncBroadcastDelivery(broadcastId: number): Promise<{ ok: boolean; delivered: number; checked: number; error?: string }> {
  if (!(await adminOnly())) return { ok: false, delivered: 0, checked: 0, error: "Admins only." };
  const bc = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { id: true, channel: true, createdAt: true } });
  if (!bc) return { ok: false, delivered: 0, checked: 0, error: "Broadcast not found." };
  let delivered = 0, checked = 0;
  if (bc.channel === "SMS") {
    const logs = await prisma.smsLog.findMany({ where: { broadcastId: bc.id, ok: true, providerId: { not: null } }, select: { id: true, providerId: true, memberId: true, deliveryStatus: true } });
    if (!logs.length) return { ok: true, delivered: 0, checked: 0 };
    // Widen the window ±1 day to absorb any gateway timezone skew.
    const report = await getSmsDeliveryReport(ymd(new Date(bc.createdAt.getTime() - 86400000)), ymd(new Date(Date.now() + 86400000)));
    const deliveredMembers: number[] = [];
    for (const l of logs) {
      const r = l.providerId ? report.get(l.providerId) : undefined;
      if (!r || r.status === "UNKNOWN") continue;
      checked++;
      if (r.status !== l.deliveryStatus) {
        await prisma.smsLog.update({ where: { id: l.id }, data: { deliveryStatus: r.status, ...(r.status === "DELIVERED" ? { deliveredAt: new Date() } : {}), ...(r.status !== "DELIVERED" ? { error: [r.rawStatus, r.code ? `(code ${r.code})` : null].filter(Boolean).join(" ") || null } : {}) } }).catch(() => {});
      }
      if (r.status === "DELIVERED" && l.memberId != null) deliveredMembers.push(l.memberId);
    }
    delivered = await markMembersBroadcast(deliveredMembers, "SMS");
  } else {
    const logs = await prisma.whatsAppLog.findMany({ where: { broadcastId: bc.id, deliveredAt: { not: null } }, select: { memberId: true } });
    checked = logs.length;
    delivered = await markMembersBroadcast(logs.map((l) => l.memberId), "WHATSAPP");
  }
  revalidatePath("/campaigns");
  return { ok: true, delivered, checked };
}

export interface BroadcastVM {
  id: number; channel: Channel; templateLabel: string; status: string;
  total: number; sent: number; failed: number; remaining: number;
  createdBy: string; createdAt: string;
}

/** Broadcast history for a campaign (admin-only). */
export async function listBroadcasts(campaignId: number): Promise<BroadcastVM[]> {
  if (!(await adminOnly())) return [];
  const rows = await prisma.broadcast.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" }, take: 30 });
  return rows.map((b) => ({
    id: b.id, channel: b.channel as Channel, templateLabel: b.templateLabel ?? "", status: b.status,
    total: b.total, sent: b.sent, failed: b.failed, remaining: Math.max(0, b.total - b.sent - b.failed),
    createdBy: b.createdByName ?? "", createdAt: b.createdAt.toISOString(),
  }));
}

/** Stop a running broadcast (leaves already-sent as-is). */
export async function cancelBroadcast(broadcastId: number): Promise<{ ok: boolean }> {
  if (!(await adminOnly())) return { ok: false };
  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "canceled" } });
  return { ok: true };
}
