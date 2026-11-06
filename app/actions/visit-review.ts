"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getScope, getActor, canReviewVisit, visitScopeWhere } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { REVIEW_RATING_MAX, FLAG_ACTION_REASON, type ReviewInput } from "@/lib/visit-review-types";

/**
 * Review a visit, or edit an existing review: optional comment, optional 1–5 rating, and the
 * "Needs follow-up" flag. Every change appends an immutable VisitReviewRevision (R7).
 *  - Raising the flag creates an OPEN Action in the Action Registry (store-assigned, linked to the visit).
 *    The flag stays raised until that action is signed off (see lib/visit-review-flag.ts).
 *  - Clearing the flag here closes that action (it was the reviewer's request; they withdrew it).
 * Reviewer = the managing RM (or the RM on their own visit) or central/sysadmin — never an officer.
 */
export async function saveVisitReview(visitId: number, input: ReviewInput): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const actor = await getActor();
  const v = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      storeId: true, recordedByCode: true, farmerId: true, farmer: { select: { storeId: true } },
      reviewedAt: true, reviewNote: true, reviewRating: true, firstReviewedAt: true,
      reviewFlagged: true, reviewFlagActionId: true,
    },
  });
  if (!v) return { ok: false, error: "Visit not found." };
  if (!canReviewVisit(scope, actor.code, { storeId: v.storeId, byCode: v.recordedByCode }))
    return { ok: false, error: "Only the managing Regional Manager or an admin can review a visit." };

  const note = (input.note ?? "").trim().slice(0, 4000) || null;
  const rating = input.rating == null ? null : Math.round(Number(input.rating));
  if (rating != null && !(rating >= 1 && rating <= REVIEW_RATING_MAX)) return { ok: false, error: `Rating must be 1–${REVIEW_RATING_MAX}.` };

  const raiseFlag = input.flag && !v.reviewFlagged;
  const clearFlag = !input.flag && v.reviewFlagged;
  let due: Date | null = null;
  if (raiseFlag) {
    due = input.flagDueDate ? new Date(`${input.flagDueDate}T00:00:00Z`) : null;
    if (!due || Number.isNaN(due.getTime())) return { ok: false, error: "Pick a due date for the follow-up." };
  }

  const wasReviewed = v.reviewedAt != null;
  const changed = !wasReviewed || note !== (v.reviewNote ?? null) || rating !== (v.reviewRating ?? null);
  const now = new Date();
  const who = { actorName: actor.name, actorCode: actor.code, actorRole: scope.role };

  try {
    await prisma.$transaction(async (tx) => {
      let flagActionId = v.reviewFlagActionId;
      if (raiseFlag) {
        const a = await tx.action.create({
          data: {
            farmerId: v.farmerId, storeId: v.storeId ?? v.farmer?.storeId ?? null, visitId, dueDate: due!,
            reason: FLAG_ACTION_REASON, note: ((input.flagNote ?? "").trim() || note || "Follow up on this visit (flagged at review).").slice(0, 2000),
            status: "OPEN", createdByName: actor.name, createdByCode: actor.code,
          },
          select: { id: true },
        });
        flagActionId = a.id;
      }
      if (clearFlag && v.reviewFlagActionId) {
        await tx.action.updateMany({
          where: { id: v.reviewFlagActionId, status: "OPEN" },
          data: {
            status: "DONE", completedAt: now, completedByName: actor.name, completedByCode: actor.code,
            completionNote: "Closed — the follow-up flag was removed in the visit review.",
          },
        });
      }

      await tx.visit.update({
        where: { id: visitId },
        data: {
          reviewNote: note, reviewRating: rating,
          reviewedByName: actor.name, reviewedByCode: actor.code, reviewedByRole: scope.role,
          ...(wasReviewed ? {} : { reviewedAt: now }),
          ...(v.firstReviewedAt ? {} : { firstReviewedAt: now }),
          ...(raiseFlag ? { reviewFlagged: true, reviewFlagActionId: flagActionId, reviewFlagResolvedAt: null } : {}),
          ...(clearFlag ? { reviewFlagged: false, reviewFlagResolvedAt: now } : {}),
        },
      });

      const flaggedAfter = raiseFlag ? true : clearFlag ? false : v.reviewFlagged;
      if (changed)
        await tx.visitReviewRevision.create({
          data: { visitId, action: wasReviewed ? "EDITED" : "REVIEWED", note, rating, flagged: flaggedAfter, flagActionId, ...who },
        });
      if (raiseFlag || clearFlag)
        await tx.visitReviewRevision.create({
          data: { visitId, action: raiseFlag ? "FLAGGED" : "UNFLAGGED", note, rating, flagged: flaggedAfter, flagActionId, ...who },
        });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Review failed." };
  }

  const what = [wasReviewed ? (changed ? "edited review" : null) : "reviewed", raiseFlag ? "flagged for follow-up" : null, clearFlag ? "removed follow-up flag" : null].filter(Boolean).join(", ");
  if (what) await logAudit("Visit", "UPDATE", `Visit #${visitId}: ${what}`, actor.name ?? undefined);
  revalidatePath(`/visits/${visitId}`);
  revalidatePath("/visits");
  revalidatePath("/visit-reviews");
  if (raiseFlag || clearFlag) revalidatePath("/action-registry");
  return { ok: true };
}

/** Back to Pending. Keeps the follow-up flag (that's real work) and firstReviewedAt (turnaround). */
export async function unreviewVisit(visitId: number): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const actor = await getActor();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { storeId: true, recordedByCode: true, reviewedAt: true, reviewFlagged: true, reviewFlagActionId: true } });
  if (!v) return { ok: false, error: "Visit not found." };
  if (!canReviewVisit(scope, actor.code, { storeId: v.storeId, byCode: v.recordedByCode }))
    return { ok: false, error: "Not authorised." };
  if (!v.reviewedAt) return { ok: true };
  try {
    await prisma.$transaction([
      prisma.visit.update({
        where: { id: visitId },
        data: { reviewedAt: null, reviewNote: null, reviewRating: null, reviewedByName: null, reviewedByCode: null, reviewedByRole: null },
      }),
      prisma.visitReviewRevision.create({
        data: {
          visitId, action: "UNREVIEWED", flagged: v.reviewFlagged, flagActionId: v.reviewFlagActionId,
          actorName: actor.name, actorCode: actor.code, actorRole: scope.role,
        },
      }),
    ]);
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
  await logAudit("Visit", "UPDATE", `Visit #${visitId}: removed review`, actor.name ?? undefined);
  revalidatePath(`/visits/${visitId}`);
  revalidatePath("/visits");
  revalidatePath("/visit-reviews");
  return { ok: true };
}

/**
 * RM sidebar badge on "Visit Reviews": ALL unreviewed visits in the manager's stores (product decision:
 * the whole backlog counts as pending, not just a recent window). Same scope as the queue itself.
 */
export async function pendingReviewCount(): Promise<number> {
  const scope = await getScope();
  if (scope.role !== "regional") return 0; // badge is for RMs
  const vs = visitScopeWhere(scope);
  if (vs === "none" || !vs) return 0;
  try {
    return await prisma.visit.count({ where: { AND: [{ reviewedAt: null }, vs] } });
  } catch { return 0; }
}
