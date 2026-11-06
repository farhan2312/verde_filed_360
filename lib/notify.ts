import { prisma } from "@/lib/prisma";
import { shortStoreName } from "@/lib/store-utils";

/**
 * Server-side helpers that CREATE notifications (the bell inbox). Plain module, not "use server", so
 * nothing here is client-callable. Every helper is best-effort: a notification failure must never
 * fail the write that triggered it.
 */

export type NotificationType = "NEW_VISITS" | "REPORT_READY" | "SLA_BREACH" | "GENERIC";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}

/** One notification per user. */
export async function notifyUsers(userIds: number[], n: NotifyInput): Promise<void> {
  const ids = [...new Set(userIds)].filter((x) => Number.isInteger(x));
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 200), body: n.body ?? null, href: n.href ?? null })),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Rolling notification: one row per `dedupeKey`. The first event inserts it with `firstTitle`; each
 * later event bumps count, sets the title from `titleTemplate` ("{n}" → new count), refreshes the
 * body and marks it unread again. Atomic (INSERT … ON CONFLICT) so concurrent visits don't race.
 */
export async function bumpRolling(
  userId: number, dedupeKey: string, type: NotificationType,
  firstTitle: string, titleTemplate: string, body: string, href: string,
): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "Notification" ("userId", type, title, body, href, count, "dedupeKey", "createdAt", "updatedAt")
      VALUES (${userId}, ${type}, ${firstTitle}, ${body}, ${href}, 1, ${dedupeKey}, now(), now())
      ON CONFLICT ("dedupeKey") DO UPDATE SET
        count = "Notification".count + 1,
        title = replace(${titleTemplate}, '{n}', ("Notification".count + 1)::text),
        body = EXCLUDED.body,
        "readAt" = NULL,
        "updatedAt" = now()`;
  } catch {
    /* best-effort */
  }
}

/**
 * Active, approved Regional Managers who manage a store. A Verde store can have SEVERAL managers, so
 * `Store.rmUserIds` is authoritative and ALL of them are notified; `regionalManager` is only a
 * comma-joined display label and is matched whole as the same legacy fallback lib/scope.ts uses.
 */
export async function rmUserIdsForStore(storeId: number | null): Promise<{ id: number; code: string | null }[]> {
  if (storeId == null) return [];
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { rmUserIds: true, regionalManager: true } });
  if (!store) return [];
  const label = (store.regionalManager ?? "").trim();
  if (!store.rmUserIds.length && !label) return [];
  return prisma.user.findMany({
    where: {
      role: "REGIONAL", active: true, approvalStatus: "APPROVED",
      OR: [
        { id: { in: store.rmUserIds } },
        ...(label ? [{ name: { equals: label, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, employeeCode: true },
  }).then((r) => r.map((u) => ({ id: u.id, code: u.employeeCode })));
}

/** YYYY-MM-DD in IST — the day a rolling "new visits" item covers. */
const ymdIst = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * A visit was just logged → tell the store's RM(s) there's something to review (R6). One rolling item
 * per RM per IST day ("5 new visits to review"), linking to the pending queue. The RM isn't notified
 * about a visit they logged themselves.
 */
export async function notifyNewVisit(v: { storeId: number | null; recordedByCode: string | null; farmerName: string | null; officerName: string | null }): Promise<void> {
  try {
    const rms = (await rmUserIdsForStore(v.storeId)).filter((u) => !v.recordedByCode || u.code !== v.recordedByCode);
    if (!rms.length) return;
    const store = v.storeId != null ? await prisma.store.findUnique({ where: { id: v.storeId }, select: { name: true } }) : null;
    const day = ymdIst(new Date());
    const latest = `Latest: ${v.farmerName?.trim() || "a farmer"}${v.officerName ? ` by ${v.officerName}` : ""}${store ? ` · ${shortStoreName(store.name)}` : ""}`;
    await Promise.all(rms.map((u) =>
      bumpRolling(u.id, `NEW_VISITS:${u.id}:${day}`, "NEW_VISITS", "1 new visit to review", "{n} new visits to review", latest, "/visit-reviews?status=pending"),
    ));
  } catch {
    /* best-effort */
  }
}
