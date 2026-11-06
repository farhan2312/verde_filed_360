"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** The bell inbox — always the REAL signed-in user's own notifications (never an impersonated persona's). */

export interface NotificationVM {
  id: number;
  type: string;
  title: string;
  body: string;
  href: string;
  unread: boolean;
  at: string; // ISO of the latest activity (updatedAt)
}

async function me(): Promise<number | null> {
  const s = await getSession();
  return s?.userId ?? null;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const uid = await me();
  if (uid == null) return 0;
  try { return await prisma.notification.count({ where: { userId: uid, readAt: null } }); } catch { return 0; }
}

export async function listMyNotifications(limit = 30): Promise<NotificationVM[]> {
  const uid = await me();
  if (uid == null) return [];
  try {
    const rows = await prisma.notification.findMany({
      where: { userId: uid },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body ?? "", href: n.href ?? "",
      unread: n.readAt == null, at: n.updatedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: number): Promise<void> {
  const uid = await me();
  if (uid == null) return;
  try { await prisma.notification.updateMany({ where: { id, userId: uid, readAt: null }, data: { readAt: new Date() } }); } catch { /* ignore */ }
}

export async function markAllNotificationsRead(): Promise<void> {
  const uid = await me();
  if (uid == null) return;
  try { await prisma.notification.updateMany({ where: { userId: uid, readAt: null }, data: { readAt: new Date() } }); } catch { /* ignore */ }
}
