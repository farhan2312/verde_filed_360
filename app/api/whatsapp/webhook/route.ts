import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { waWebhookConfig, toMobile10 } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp Cloud API inbound webhook.
 *   GET  — verification handshake (Meta sends hub.mode / hub.verify_token / hub.challenge).
 *   POST — inbound messages. Every person who messages our number (scans the opt-in QR / click-to-chat)
 *          is recorded as a WhatsAppOptIn and, if their number matches a farmer, that farmer is flagged
 *          whatsappOptIn. This is what turns "they messaged us" into a marketable, opted-in contact.
 * Config: WHATSAPP_VERIFY_TOKEN (required for the handshake) + optional WHATSAPP_APP_SECRET (signature check).
 */

export async function GET(req: NextRequest) {
  const { verifyToken } = waWebhookConfig();
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge") ?? "";
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const { appSecret } = waWebhookConfig();
  const bodyText = await req.text();

  // Optional but recommended: verify the payload signature so only Meta can post here.
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(bodyText).digest("hex");
    const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return new Response("Bad signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(bodyText); } catch { return new Response("ok", { status: 200 }); }

  try {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const contacts: any[] = value.contacts ?? [];
        const messages: any[] = value.messages ?? [];

        // Delivery-status callbacks (sent → delivered → read, or failed with an error code). These tell
        // us what actually happened AFTER Meta accepted the message. Match our WhatsAppLog by wamid.
        const statuses: any[] = value.statuses ?? [];
        for (const s of statuses) {
          const wamid = String(s?.id ?? "");
          if (!wamid) continue;
          const state = String(s?.status ?? "").toUpperCase(); // SENT | DELIVERED | READ | FAILED
          const tsMs = s?.timestamp ? Number(s.timestamp) * 1000 : Date.now();
          const at = Number.isFinite(tsMs) ? new Date(tsMs) : new Date();
          const errs: any[] = s?.errors ?? [];
          const err = errs[0]
            ? [errs[0].code != null ? `code ${errs[0].code}` : "", errs[0].title, errs[0].error_data?.details ?? errs[0].message]
                .filter(Boolean).join(" · ")
            : null;
          await prisma.whatsAppLog.updateMany({
            where: { providerId: wamid },
            data: {
              status: state,
              ...(state === "FAILED" ? { ok: false, error: err } : {}),
              ...(state === "DELIVERED" ? { deliveredAt: at } : {}),
              ...(state === "READ" ? { readAt: at } : {}),
            },
          });
          // Keep the Inbox thread's outbound bubble in sync (SENT → DELIVERED → READ, or FAILED).
          await prisma.whatsAppMessage.updateMany({
            where: { waMessageId: wamid },
            data: { status: state, ...(state === "FAILED" ? { errorText: err } : {}) },
          });
          // A DELIVERED broadcast message → mark that farmer on the campaign broadcast track (not "reached").
          if (state === "DELIVERED" || state === "READ") {
            const log = await prisma.whatsAppLog.findFirst({ where: { providerId: wamid, broadcastId: { not: null }, memberId: { not: null } }, select: { memberId: true } });
            if (log?.memberId != null) {
              const mem = await prisma.campaignMember.findUnique({ where: { id: log.memberId }, select: { broadcastMediums: true } });
              if (mem && !mem.broadcastMediums.includes("WHATSAPP")) {
                await prisma.campaignMember.update({ where: { id: log.memberId }, data: { broadcastMediums: { push: "WHATSAPP" }, ...(mem.broadcastMediums.length ? {} : { broadcastAt: at }) } }).catch(() => {});
              }
            }
          }
        }
        // Map wa_id -> profile name for this batch.
        const nameByWaId = new Map<string, string>();
        for (const c of contacts) if (c?.wa_id) nameByWaId.set(String(c.wa_id), c?.profile?.name ?? "");

        for (const m of messages) {
          const waId = String(m?.from ?? "");
          const mobile = toMobile10(waId);
          if (!mobile) continue;
          const type = String(m?.type ?? "text");
          const text = m?.text?.body ?? m?.button?.text ?? m?.interactive?.list_reply?.title ?? m?.interactive?.button_reply?.title ?? `[${type}]`;
          // Media messages carry an id (image/audio/video/document) — store the id + mime; render later.
          const media = m?.image ?? m?.audio ?? m?.video ?? m?.document ?? m?.sticker ?? null;
          const tsMs = m?.timestamp ? Number(m.timestamp) * 1000 : Date.now();
          const at = Number.isFinite(tsMs) ? new Date(tsMs) : new Date();
          const name = nameByWaId.get(waId) || null;
          const wamid = m?.id ? String(m.id) : null;

          const farmer = await prisma.farmer.findFirst({ where: { mobile }, select: { id: true } });

          // Full per-message record (the Inbox thread). Dedup on wamid (Meta may retry the webhook).
          if (!wamid || (await prisma.whatsAppMessage.count({ where: { waMessageId: wamid } })) === 0) {
            await prisma.whatsAppMessage.create({
              data: {
                mobile, waId, direction: "IN", type, text,
                mediaId: media?.id ?? null, mediaMime: media?.mime_type ?? null,
                waMessageId: wamid, farmerId: farmer?.id ?? null, contactName: name, waTimestamp: at,
              },
            });
          }

          await prisma.whatsAppOptIn.upsert({
            where: { mobile },
            create: {
              mobile, waId, name, firstMessage: text, lastMessage: text, messageCount: 1,
              farmerId: farmer?.id ?? null, optInAt: at, lastMessageAt: at,
              unreadCount: 1, lastInboundAt: at, lastDirection: "IN",
            },
            update: {
              waId, name: name ?? undefined, lastMessage: text, lastMessageAt: at,
              messageCount: { increment: 1 }, farmerId: farmer?.id ?? undefined,
              unreadCount: { increment: 1 }, lastInboundAt: at, lastDirection: "IN",
            },
          });

          if (farmer) {
            await prisma.farmer.updateMany({
              where: { id: farmer.id, whatsappOptIn: false },
              data: { whatsappOptIn: true, whatsappOptInAt: at },
            });
          }
        }
      }
    }
  } catch {
    // Never fail the webhook — Meta retries on non-200 and would flood us. Swallow + 200.
  }
  return new Response("ok", { status: 200 });
}
