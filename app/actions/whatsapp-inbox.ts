"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { getActor } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { sendWhatsApp, waListTemplates } from "@/lib/whatsapp";
import { countVars } from "@/lib/wa-template-presets";
import { resolveVarLabels } from "@/lib/wa-template-vars";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
async function admin(): Promise<boolean> { return (await getRole()) === "sysadmin"; }

export interface ConversationVM {
  mobile: string;
  waId: string | null; // full international number (country code + number)
  name: string | null;
  farmerId: number | null;
  farmerName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastDirection: string | null;
  unreadCount: number;
  messageCount: number;
  optInAt: string | null;
  within24h: boolean; // reply session window open (they messaged in the last 24h)
}

export interface InboxData { conversations: ConversationVM[]; totalUnread: number; total: number }

/** Conversation list for the Sysadmin WhatsApp Inbox. Filter: all | unread | unmatched. */
export async function listConversations(filter: "all" | "unread" | "unmatched" = "all", q = ""): Promise<InboxData | null> {
  if (!(await admin())) return null;
  const where: Prisma.WhatsAppOptInWhereInput = {};
  if (filter === "unread") where.unreadCount = { gt: 0 };
  if (filter === "unmatched") where.farmerId = null;
  const term = q.trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { lastMessage: { contains: term, mode: "insensitive" } },
      ...(digits ? [{ mobile: { contains: digits } }, { waId: { contains: digits } }] as Prisma.WhatsAppOptInWhereInput[] : []),
    ];
  }

  const rows = await prisma.whatsAppOptIn.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: 300 });
  const farmerIds = [...new Set(rows.map((r) => r.farmerId).filter((x): x is number => x != null))];
  const farmers = new Map((farmerIds.length ? await prisma.farmer.findMany({ where: { id: { in: farmerIds } }, select: { id: true, name: true } }) : []).map((f) => [f.id, f.name]));
  const now = Date.now();

  const conversations: ConversationVM[] = rows.map((r) => ({
    mobile: r.mobile, waId: r.waId ?? null, name: r.name, farmerId: r.farmerId, farmerName: r.farmerId ? (farmers.get(r.farmerId) ?? null) : null,
    lastMessage: r.lastMessage, lastMessageAt: iso(r.lastMessageAt), lastDirection: r.lastDirection,
    unreadCount: r.unreadCount, messageCount: r.messageCount, optInAt: iso(r.optInAt),
    within24h: !!r.lastInboundAt && now - r.lastInboundAt.getTime() < WINDOW_MS,
  }));

  const [totalUnread, total] = await Promise.all([
    prisma.whatsAppOptIn.count({ where: { unreadCount: { gt: 0 } } }),
    prisma.whatsAppOptIn.count(),
  ]);
  return { conversations, totalUnread, total };
}

export interface ThreadMessage {
  id: number; direction: string; type: string; text: string | null;
  mediaId: string | null; mediaMime: string | null; status: string | null; errorText: string | null;
  sentByName: string | null; at: string;
}
export interface ThreadVM {
  mobile: string; waId: string | null; name: string | null; farmerId: number | null; farmerName: string | null;
  optInAt: string | null; within24h: boolean; firstMessage: string | null;
  messages: ThreadMessage[];
}

/** Full message thread for one contact. Also marks the conversation read. */
export async function getThread(mobile: string): Promise<ThreadVM | null> {
  if (!(await admin())) return null;
  const m = mobile.replace(/\D/g, "").slice(-10);
  const header = await prisma.whatsAppOptIn.findUnique({ where: { mobile: m } });
  if (!header) return null;

  const [rows] = await Promise.all([
    prisma.whatsAppMessage.findMany({ where: { mobile: m }, orderBy: { createdAt: "asc" }, take: 500 }),
    prisma.whatsAppOptIn.update({ where: { mobile: m }, data: { unreadCount: 0 } }).catch(() => null),
  ]);
  const farmerName = header.farmerId ? (await prisma.farmer.findUnique({ where: { id: header.farmerId }, select: { name: true } }))?.name ?? null : null;
  revalidatePath("/whatsapp");

  return {
    mobile: m, waId: header.waId ?? null, name: header.name, farmerId: header.farmerId, farmerName,
    optInAt: iso(header.optInAt),
    within24h: !!header.lastInboundAt && Date.now() - header.lastInboundAt.getTime() < WINDOW_MS,
    firstMessage: header.firstMessage,
    messages: rows.map((r) => ({
      id: r.id, direction: r.direction, type: r.type, text: r.text,
      mediaId: r.mediaId, mediaMime: r.mediaMime, status: r.status, errorText: r.errorText,
      sentByName: r.sentByName, at: (r.waTimestamp ?? r.createdAt).toISOString(),
    })),
  };
}

/** Mark a conversation's unread count back to 0 (without opening the thread). */
export async function markConversationRead(mobile: string): Promise<{ ok: boolean }> {
  if (!(await admin())) return { ok: false };
  const m = mobile.replace(/\D/g, "").slice(-10);
  await prisma.whatsAppOptIn.update({ where: { mobile: m }, data: { unreadCount: 0 } }).catch(() => null);
  revalidatePath("/whatsapp");
  return { ok: true };
}

/* ─────────────────────────── Phase 2 — replies ─────────────────────────── */

/** Record an outbound message on the thread + roll the header forward. */
async function logOutbound(mobile: string, type: string, text: string, farmerId: number | null, res: { ok: boolean; providerId?: string; error?: string }) {
  const actor = await getActor();
  const now = new Date();
  await prisma.whatsAppMessage.create({
    data: {
      mobile, direction: "OUT", type, text,
      waMessageId: res.providerId ?? null, status: res.ok ? "SENT" : "FAILED", errorText: res.error ?? null,
      sentByName: actor.name, sentByCode: actor.code, farmerId, waTimestamp: now,
    },
  });
  await prisma.whatsAppOptIn.update({ where: { mobile }, data: { lastMessage: text, lastMessageAt: now, lastDirection: "OUT" } }).catch(() => null);
  if (res.ok) await logAudit("WhatsApp", "SEND", `Inbox ${type} reply to ${mobile}`, actor.name);
  revalidatePath("/whatsapp");
}

/** Free-text reply — only valid inside the 24-hour customer-service window. */
export async function sendReply(mobile: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await admin())) return { ok: false, error: "System admins only." };
  const m = mobile.replace(/\D/g, "").slice(-10);
  const header = await prisma.whatsAppOptIn.findUnique({ where: { mobile: m } });
  if (!header) return { ok: false, error: "Unknown contact." };
  const within = !!header.lastInboundAt && Date.now() - header.lastInboundAt.getTime() < WINDOW_MS;
  if (!within) return { ok: false, error: "The 24-hour reply window has closed — send an approved template instead." };
  const body = text.trim();
  if (!body) return { ok: false, error: "Message is empty." };

  // Send to the FULL international number Meta gave us (header.waId), never the truncated 10-digit key.
  // Reconstructing from 10 digits would wrongly prepend India's 91 to non-Indian numbers → 131026.
  const res = await sendWhatsApp({ mobile: header.waId || m, message: body });
  await logOutbound(m, "text", body, header.farmerId, res);
  return { ok: res.ok, error: res.error };
}

/** Template reply — works any time (needed once the 24h window is closed). */
export async function sendTemplateReply(input: { mobile: string; templateName: string; language?: string; bodyParams?: string[] }): Promise<{ ok: boolean; error?: string }> {
  if (!(await admin())) return { ok: false, error: "System admins only." };
  const m = input.mobile.replace(/\D/g, "").slice(-10);
  const header = await prisma.whatsAppOptIn.findUnique({ where: { mobile: m } });
  if (!header) return { ok: false, error: "Unknown contact." };
  if (!input.templateName) return { ok: false, error: "Pick a template." };

  const res = await sendWhatsApp({ mobile: header.waId || m, templateName: input.templateName, languageCode: input.language ?? "en", bodyParams: input.bodyParams ?? [] });
  const summary = `[template ${input.templateName}${input.bodyParams?.length ? ` · ${input.bodyParams.join(" | ")}` : ""}]`;
  await logOutbound(m, "template", summary, header.farmerId, res);
  return { ok: res.ok, error: res.error };
}

/* ─────────────────────────── Phase 2 — quick replies + templates ─────────────────────────── */

export interface QuickReplyVM { id: number; label: string; text: string }
export async function listQuickReplies(): Promise<QuickReplyVM[]> {
  if (!(await admin())) return [];
  const rows = await prisma.whatsAppQuickReply.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, label: r.label, text: r.text }));
}
export async function saveQuickReply(input: { id?: number; label: string; text: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await admin())) return { ok: false, error: "System admins only." };
  const label = input.label.trim(), text = input.text.trim();
  if (!label || !text) return { ok: false, error: "Both a label and message are required." };
  if (input.id) await prisma.whatsAppQuickReply.update({ where: { id: input.id }, data: { label, text } });
  else await prisma.whatsAppQuickReply.create({ data: { label, text } });
  revalidatePath("/whatsapp");
  return { ok: true };
}
export async function deleteQuickReply(id: number): Promise<{ ok: boolean }> {
  if (!(await admin())) return { ok: false };
  await prisma.whatsAppQuickReply.delete({ where: { id } }).catch(() => null);
  revalidatePath("/whatsapp");
  return { ok: true };
}

export interface ReplyTemplate { name: string; language: string; body: string; varCount: number; labels: string[] }
/** Approved WhatsApp templates available for out-of-window replies. */
export async function getApprovedTemplates(): Promise<ReplyTemplate[]> {
  if (!(await admin())) return [];
  const r = await waListTemplates();
  if (!r.ok || !r.templates) return [];
  const approved = r.templates.filter((t) => t.status === "APPROVED");
  const labels = await resolveVarLabels(approved.map((t) => ({ name: t.name, language: t.language, body: t.body })));
  return approved.map((t) => ({
    name: t.name, language: t.language, body: t.body, varCount: countVars(t.body),
    labels: labels.get(`${t.name}||${t.language}`) ?? [],
  }));
}
