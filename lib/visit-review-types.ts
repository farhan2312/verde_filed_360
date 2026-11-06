/** Shared (client + server) shapes for the visit review / sign-off layer. */

export const REVIEW_RATING_MAX = 5;

/** VisitReviewRevision.action vocabulary → human label for the history timeline. */
export const REVIEW_ACTION_LABEL: Record<string, string> = {
  REVIEWED: "Marked reviewed",
  EDITED: "Edited review",
  UNREVIEWED: "Removed review",
  FLAGGED: "Flagged — needs follow-up",
  UNFLAGGED: "Removed follow-up flag",
  FLAG_RESOLVED: "Follow-up resolved",
  FLAG_REOPENED: "Follow-up reopened",
};

export interface ReviewHistoryRow {
  id: number;
  action: string;
  label: string;
  actor: string; // "Name (VER123) · Regional Manager"
  when: string; // IST display
  note: string;
  rating: number | null;
  flagged: boolean;
}

export interface VisitReviewState {
  reviewed: boolean;
  note: string;
  rating: number | null;
  reviewedBy: string; // "Name (VER123) · Regional Manager · 20 Aug 2026"
  canReview: boolean;
  flag: {
    open: boolean; // the "Needs follow-up" flag is currently raised
    actionId: number | null; // its Action Registry entry
    due: string; // display due date of that action, or ""
    resolvedAt: string; // display date the flag was last resolved, or ""
  };
  defaultFlagDue: string; // YYYY-MM-DD prefill for a NEW flag (visit's follow-up date, else +7 days)
  history: ReviewHistoryRow[] | null; // null = this viewer doesn't see the audit trail
}

export interface ReviewInput {
  note: string; // optional
  rating: number | null; // 1–5 or null
  flag: boolean; // desired flag state after save
  flagDueDate?: string; // YYYY-MM-DD — required when RAISING a new flag
  flagNote?: string; // instruction for the follow-up action (falls back to the review note)
}

export const FLAG_ACTION_REASON = "RM review follow-up";
