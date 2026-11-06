"use server";

import { prisma } from "@/lib/prisma";
import { getScope, getActor, visitScopeWhere } from "@/lib/scope";
import { shortStoreName } from "@/lib/store-utils";
import { loadReviewState, REVIEW_STATE_SELECT, istDate, istDateTime } from "@/lib/visit-review-state";
import type { DrawerData } from "@/components/visit-reviews/types";

/** The review queue is for reviewers: RMs (own stores) and central/sysadmin (all). */
const QUEUE_ROLES = new Set(["regional", "central", "sysadmin"]);

/** In-scope visit `where` for the queue drawer, or null when the viewer may not open it. */
async function drawerScope(visitId: number) {
  const scope = await getScope();
  if (!QUEUE_ROLES.has(scope.role)) return null;
  const vs = visitScopeWhere(scope);
  if (vs === "none") return null;
  return { scope, where: vs ? { AND: [{ id: visitId }, vs] } : { id: visitId } };
}

/** Light visit summary + review state for the queue drawer (never the heavy media columns). */
export async function getReviewDrawer(visitId: number): Promise<DrawerData | null> {
  const ctx = await drawerScope(visitId);
  if (!ctx) return null;
  try {
    const v = await prisma.visit.findFirst({
      where: ctx.where,
      select: {
        ...REVIEW_STATE_SELECT,
        date: true, visitedAt: true, createdAt: true, officerName: true, recordedBy: true, purpose: true, visitMode: true,
        mainCrop: true, crops: true, season: true, currentProblem: true, pests: true, productRequired: true, products: true,
        cropRisk: true, notes: true, followUpReason: true, followUpComment: true, photoCount: true, voiceNoteCount: true,
        farmer: { select: { id: true, name: true, mobile: true, village: true, storeId: true } },
        store: { select: { id: true, name: true } },
      },
    });
    if (!v) return null;
    const actor = await getActor();
    const review = await loadReviewState({ ...v, storeId: v.storeId ?? v.store?.id ?? null }, ctx.scope, actor.code);
    const fu = v.followUpDate ? (() => { const d = new Date(`${v.followUpDate}T00:00:00Z`); return Number.isNaN(d.getTime()) ? v.followUpDate : istDate(d, "UTC"); })() : "";
    return {
      review,
      summary: {
        id: v.id,
        farmer: v.farmer?.name ?? "Store visit",
        farmerId: v.farmer?.id ?? null,
        mobile: v.farmer?.mobile ?? "",
        village: v.farmer?.village ?? "",
        store: shortStoreName(v.store?.name) || "—",
        officer: v.officerName ?? "—",
        recordedBy: v.recordedBy ?? "",
        visitDate: v.date?.trim() || (v.visitedAt ? istDate(v.visitedAt) : "—"),
        loggedAt: istDateTime(v.createdAt),
        purpose: v.purpose ?? "",
        mode: v.visitMode === "store" ? "Store visit" : v.visitMode === "field" ? "Field visit (GPS)" : "",
        mainCrop: v.mainCrop ?? "",
        crops: v.crops ?? [],
        season: v.season ?? "",
        problems: v.currentProblem ?? [],
        pests: v.pests ?? [],
        productRequired: v.productRequired ?? [],
        productsUsed: v.products ?? [],
        cropRisk: v.cropRisk ?? [],
        notes: v.notes ?? "",
        followUp: fu ? [fu, v.followUpReason, v.followUpComment].filter(Boolean).join(" · ") : "",
        photoCount: v.photoCount,
        voiceNoteCount: v.voiceNoteCount,
      },
    };
  } catch {
    return null;
  }
}

/** Photos + voice notes for one visit — fetched only when the reviewer asks (multi-MB base64). */
export async function getVisitMedia(visitId: number): Promise<{ photos: string[]; voiceNotes: string[] } | null> {
  const ctx = await drawerScope(visitId);
  if (!ctx) return null;
  try {
    const v = await prisma.visit.findFirst({ where: ctx.where, select: { photos: true, voiceNotes: true } });
    return v ? { photos: v.photos ?? [], voiceNotes: v.voiceNotes ?? [] } : null;
  } catch {
    return null;
  }
}
