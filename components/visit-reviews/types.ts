import type { VisitReviewState } from "@/lib/visit-review-types";

export type QueueStatus = "all" | "pending" | "overdue" | "reviewed" | "flagged";
export type QueueSort = "newest" | "oldest";

/** SLA marker: pending → ok / due-soon / overdue; reviewed → met / late. */
export type SlaState = "ok" | "due-soon" | "overdue" | "met" | "late";

export interface QueueRow {
  id: number;
  visitDate: string; // display (IST)
  loggedAt: string; // display (IST) — the SLA clock starts here
  farmer: string;
  village: string;
  officer: string;
  store: string;
  rm: string;
  purpose: string;
  crop: string;
  reviewed: boolean;
  flagged: boolean;
  rating: number | null;
  reviewedBy: string;
  age: string; // pending: time waiting; reviewed: turnaround
  sla: SlaState;
}

export interface QueueFilters {
  status: QueueStatus;
  officer: string; // "all" | name
  store: string; // "all" | short store name
  rm: string; // "all" | RM user id | "__none" (stores with no RM)
  q: string;
  from: string; // YYYY-MM-DD (IST visit date)
  to: string;
  sort: QueueSort;
}

export type QueueCounts = Record<QueueStatus, number>;

export interface QueueOptions {
  officers: string[];
  stores: string[];
  // RM accounts, value = user id: a Verde store can have several RMs, so the filter can never key
  // off Store.regionalManager (a comma-joined display label). null = RM filter hidden (RMs).
  rms: { value: string; label: string }[] | null;
}

export interface DrawerSummary {
  id: number;
  farmer: string;
  farmerId: number | null;
  mobile: string;
  village: string;
  store: string;
  officer: string;
  recordedBy: string;
  visitDate: string;
  loggedAt: string;
  purpose: string;
  mode: string;
  mainCrop: string;
  crops: string[];
  season: string;
  problems: string[];
  pests: string[];
  productRequired: string[];
  productsUsed: string[];
  cropRisk: string[];
  notes: string;
  followUp: string; // "12 Nov 2026 · Payment Collection — note"
  photoCount: number;
  voiceNoteCount: number;
}

export interface DrawerData {
  summary: DrawerSummary;
  review: VisitReviewState;
}
