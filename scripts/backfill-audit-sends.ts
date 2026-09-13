/**
 * Backfill the audit trail (AuditLog) for PAST sends made before the send-instrumentation was wired
 * (lib/audit.ts, 2026-09-05). Mirrors the going-forward model exactly:
 *   • one SEND/Broadcast row per Broadcast (mass send) — NOT one per message
 *   • one SEND/SMS row per individual SmsLog (excludes broadcast messages, which the Broadcast rows cover)
 *   • one SEND/WhatsApp row per individual WhatsAppLog and per outbound WhatsAppMessage (inbox reply)
 * Original timestamps and actor names are preserved, so the rows land on the right day/hour and person.
 *
 * Idempotent: every row it writes is tagged ip="backfill"; a re-run deletes those first and re-inserts.
 *
 * Run:  set -a && . webapp/.env && set +a && node_modules/.bin/tsx scripts/backfill-audit-sends.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TAG = "backfill";
type Row = { actor: string | null; action: string; entity: string; detail: string; ip: string; createdAt: Date };

async function main() {
  const before = await prisma.auditLog.count();
  const priorBackfill = await prisma.auditLog.count({ where: { ip: TAG } });
  await prisma.auditLog.deleteMany({ where: { ip: TAG } }); // idempotent re-run

  const rows: Row[] = [];

  // 1. Mass sends — one row per Broadcast (matches createBroadcast going forward).
  const broadcasts = await prisma.broadcast.findMany({ select: { channel: true, total: true, sent: true, templateLabel: true, createdByName: true, createdAt: true } });
  for (const b of broadcasts) {
    const chan = b.channel === "WHATSAPP" ? "WhatsApp" : "SMS";
    rows.push({
      actor: b.createdByName ?? null, action: "SEND", entity: "Broadcast",
      detail: `Mass ${chan} — ${b.sent} sent${b.total > b.sent ? ` of ${b.total}` : ""}${b.templateLabel ? ` via ${b.templateLabel}` : ""}`,
      ip: TAG, createdAt: b.createdAt,
    });
  }

  // 2. Individual SMS — exclude broadcast messages (status "BROADCAST …"), which the Broadcast rows cover.
  // Filter in JS, not SQL: `NOT LIKE 'BROADCAST%'` is NULL for null-status rows and would drop them.
  const smsAll = await prisma.smsLog.findMany({ select: { mobile: true, status: true, sentByName: true, createdAt: true } });
  const sms = smsAll.filter((s) => !(s.status ?? "").startsWith("BROADCAST"));
  for (const s of sms) {
    const isTest = (s.status ?? "").startsWith("TEST");
    rows.push({ actor: s.sentByName ?? null, action: "SEND", entity: "SMS", detail: `${isTest ? "Test" : "Sent"} SMS to ${s.mobile}`, ip: TAG, createdAt: s.createdAt });
  }

  // 3. Individual WhatsApp sends (WhatsAppLog) — exclude any broadcast-tagged ones (none today, future-proof).
  const wa = await prisma.whatsAppLog.findMany({
    where: { broadcastId: null },
    select: { mobile: true, kind: true, status: true, sentByName: true, createdAt: true },
  });
  for (const w of wa) {
    const isTest = (w.status ?? "").startsWith("TEST");
    rows.push({ actor: w.sentByName ?? null, action: "SEND", entity: "WhatsApp", detail: `${isTest ? "Test" : "Sent campaign"} WhatsApp ${w.kind === "template" ? "template" : "message"} to ${w.mobile}`, ip: TAG, createdAt: w.createdAt });
  }

  // 4. Inbox replies — outbound WhatsAppMessage (mirrors logOutbound going forward).
  const waMsg = await prisma.whatsAppMessage.findMany({
    where: { direction: "OUT" },
    select: { mobile: true, type: true, sentByName: true, waTimestamp: true, createdAt: true },
  });
  for (const m of waMsg) {
    rows.push({ actor: m.sentByName ?? null, action: "SEND", entity: "WhatsApp", detail: `Inbox ${m.type} reply to ${m.mobile}`, ip: TAG, createdAt: m.waTimestamp ?? m.createdAt });
  }

  // Insert in chunks.
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.auditLog.createMany({ data: rows.slice(i, i + 500) });
  }

  const after = await prisma.auditLog.count();
  const byEntity = rows.reduce<Record<string, number>>((m, r) => ((m[r.entity] = (m[r.entity] ?? 0) + 1), m), {});
  console.log("Backfill complete.");
  console.log("  removed prior backfill rows: %d", priorBackfill);
  console.log("  inserted: %d  (%s)", rows.length, Object.entries(byEntity).map(([k, v]) => `${k}:${v}`).join(" "));
  console.log("  AuditLog total: %d → %d", before, after);
  console.log("  reconcile: %d + %d - %d = %d %s", before, rows.length, priorBackfill, before + rows.length - priorBackfill, before + rows.length - priorBackfill === after ? "✓" : "✗");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
