import { prisma } from "@/lib/prisma";
import { canReviewVisit, type Scope } from "@/lib/scope";
import { roleLabel } from "@/lib/roles";
import { REVIEW_ACTION_LABEL, type VisitReviewState } from "@/lib/visit-review-types";

/** Visit columns needed to build a VisitReviewState (spread into a prisma `select`). */
export const REVIEW_STATE_SELECT = {
  id: true, storeId: true, recordedByCode: true, followUpDate: true,
  reviewedAt: true, reviewNote: true, reviewedByName: true, reviewedByCode: true, reviewedByRole: true,
  reviewRating: true, reviewFlagged: true, reviewFlagActionId: true, reviewFlagResolvedAt: true,
} as const;

type ReviewRow = {
  id: number; storeId: number | null; recordedByCode: string | null; followUpDate: string | null;
  reviewedAt: Date | null; reviewNote: string | null; reviewedByName: string | null; reviewedByCode: string | null; reviewedByRole: string | null;
  reviewRating: number | null; reviewFlagged: boolean; reviewFlagActionId: number | null; reviewFlagResolvedAt: Date | null;
};

/** "20 Aug 2026" in IST (Action due dates are stored as UTC midnight — pass "UTC" for those). */
export function istDate(d: Date, timeZone = "Asia/Kolkata"): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
}
export function istDateTime(d: Date): string {
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}
/** YYYY-MM-DD for a moment, in IST. */
export function ymdIst(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Everything the review panel needs for one visit: current review, eligibility, the follow-up flag's
 * Action, and (for reviewers + admins only) the immutable revision history. Shared by the visit
 * detail page and the review-queue drawer so both always agree.
 */
export async function loadReviewState(visit: ReviewRow, scope: Scope, actorCode: string | null): Promise<VisitReviewState> {
  const canReview = canReviewVisit(scope, actorCode, { storeId: visit.storeId, byCode: visit.recordedByCode });
  const showHistory = canReview || scope.role === "central" || scope.role === "sysadmin";
  const [flagAction, revisions] = await Promise.all([
    visit.reviewFlagActionId
      ? prisma.action.findUnique({ where: { id: visit.reviewFlagActionId }, select: { dueDate: true } }).catch(() => null)
      : Promise.resolve(null),
    showHistory
      ? prisma.visitReviewRevision.findMany({ where: { visitId: visit.id }, orderBy: { id: "desc" }, take: 100 }).catch(() => [])
      : Promise.resolve(null),
  ]);
  const reviewedBy = visit.reviewedByName
    ? `${visit.reviewedByName}${visit.reviewedByCode ? ` (${visit.reviewedByCode})` : ""}${visit.reviewedByRole ? ` · ${roleLabel(visit.reviewedByRole as never)}` : ""}${visit.reviewedAt ? ` · ${istDate(visit.reviewedAt)}` : ""}`
    : "";
  // New-flag due date prefill: the officer's own follow-up date if it's still ahead, else a week out.
  const today = ymdIst(new Date());
  const defaultFlagDue = visit.followUpDate && visit.followUpDate >= today ? visit.followUpDate : ymdIst(new Date(Date.now() + 7 * 86_400_000));

  return {
    reviewed: visit.reviewedAt != null,
    note: visit.reviewNote ?? "",
    rating: visit.reviewRating,
    reviewedBy,
    canReview,
    flag: {
      open: visit.reviewFlagged,
      actionId: visit.reviewFlagActionId,
      due: flagAction ? istDate(flagAction.dueDate, "UTC") : "",
      resolvedAt: visit.reviewFlagResolvedAt ? istDate(visit.reviewFlagResolvedAt) : "",
    },
    defaultFlagDue,
    history: revisions
      ? revisions.map((r) => ({
          id: r.id,
          action: r.action,
          label: REVIEW_ACTION_LABEL[r.action] ?? r.action,
          actor: `${r.actorName ?? "—"}${r.actorCode ? ` (${r.actorCode})` : ""}${r.actorRole ? ` · ${roleLabel(r.actorRole as never)}` : ""}`,
          when: istDateTime(r.createdAt),
          note: r.note ?? "",
          rating: r.rating,
          flagged: r.flagged,
        }))
      : null,
  };
}
