"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getScope, getActor, canReviewVisit } from "@/lib/scope";

const RECENT_DAYS = 30; // window for the RM "pending reviews" badge — recent visits awaiting sign-off

/** Sign off / review a visit (optional). Reviewer = the recorder, the managing RM, or an admin. */
export async function reviewVisit(visitId: number, note: string): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const actor = await getActor();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { storeId: true, recordedByCode: true } });
  if (!v) return { ok: false, error: "Visit not found." };
  if (!canReviewVisit(scope, actor.code, { storeId: v.storeId, byCode: v.recordedByCode }))
    return { ok: false, error: "Only the managing Regional Manager or an admin can review a visit." };
  try {
    await prisma.visit.update({
      where: { id: visitId },
      data: {
        reviewedAt: new Date(), reviewNote: (note ?? "").trim().slice(0, 4000) || null,
        reviewedByName: actor.name, reviewedByCode: actor.code, reviewedByRole: scope.role,
      },
    });
    revalidatePath(`/visits/${visitId}`);
    revalidatePath("/visits");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Review failed." }; }
}

/** Clear a review (back to unreviewed) — same eligibility as reviewing. */
export async function unreviewVisit(visitId: number): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const actor = await getActor();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { storeId: true, recordedByCode: true } });
  if (!v) return { ok: false, error: "Visit not found." };
  if (!canReviewVisit(scope, actor.code, { storeId: v.storeId, byCode: v.recordedByCode }))
    return { ok: false, error: "Not authorised." };
  try {
    await prisma.visit.update({
      where: { id: visitId },
      data: { reviewedAt: null, reviewNote: null, reviewedByName: null, reviewedByCode: null, reviewedByRole: null },
    });
    revalidatePath(`/visits/${visitId}`);
    revalidatePath("/visits");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

/** RM badge: recent (last 30d) unreviewed visits in the manager's stores awaiting sign-off. */
export async function pendingReviewCount(): Promise<number> {
  const scope = await getScope();
  if (scope.role !== "regional") return 0; // badge is for RMs
  const ids = scope.managedStoreIds ?? [];
  if (!ids.length) return 0;
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  try {
    return await prisma.visit.count({
      where: {
        reviewedAt: null,
        OR: [{ storeId: { in: ids } }, { storeId: null, farmer: { storeId: { in: ids } } }],
        AND: [{ OR: [{ visitedAt: { gte: since } }, { visitedAt: null, createdAt: { gte: since } }] }],
      },
    });
  } catch { return 0; }
}
