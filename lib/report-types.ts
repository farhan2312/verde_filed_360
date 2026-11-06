/** Shared (client + server) shapes for the weekly visit-review report. Stored as JSON on WeeklyReport. */

/** A counted theme with the visits it came from (traceability, R5). */
export interface Tally { label: string; count: number; visitIds: number[] }

export interface OfficerStat {
  name: string; visits: number; reviewed: number; pending: number; flagged: number; farmers: number; avgRating: number | null;
}
export interface StoreStat { name: string; visits: number; reviewed: number; pending: number; flagged: number }

/** A specific visit cited by the report. */
export interface VisitRef { id: number; farmer: string; officer: string; store: string; date: string; note: string; rating: number | null }

export interface ReportTotals {
  visits: number;
  reviewed: number;
  pending: number;
  flagged: number;
  withinSla: number; // reviewed within the SLA
  reviewedPct: number; // 0–100
  slaPct: number; // 0–100 — of ALL the week's visits, the share reviewed within SLA
  avgTurnaroundHrs: number | null;
  avgRating: number | null;
  rated: number;
  withComment: number;
  farmers: number; // distinct farmers visited
  officersActive: number;
  backlogPending: number; // ALL unreviewed visits in the RM's stores (not just this week)
  backlogOverdue: number; // … of which past the SLA
}

export interface ReportStats {
  version: 1;
  weekLabel: string; // "27 Oct – 2 Nov 2026"
  weekStartYmd: string;
  rmName: string;
  storeCount: number;
  slaHours: number;
  totals: ReportTotals;
  prev: { visits: number; reviewed: number; reviewedPct: number; slaPct: number } | null;
  officers: OfficerStat[];
  stores: StoreStat[];
  inactiveOfficers: string[]; // officers mapped to these stores who logged no visit this week
  problems: Tally[];
  crops: Tally[];
  pests: Tally[];
  productsRequired: Tally[];
  cropRisks: Tally[];
  problemCrop: Record<string, string>; // top problem → the crop it was mostly reported on
  flaggedVisits: VisitRef[];
  lowRated: VisitRef[]; // rated ≤ 2★
  recentComments: VisitRef[]; // RM comments left this week (latest few)
  oldestPending: VisitRef | null; // oldest unreviewed visit in the backlog
}

export interface SummaryBullet { text: string; visitIds: number[] }

export interface ReportSummary {
  narrative: string;
  findings: SummaryBullet[];
  concerns: SummaryBullet[];
  strategy: SummaryBullet[];
  source: "template" | "llm";
  notice?: string; // e.g. "AI summary unavailable — showing the standard summary"
}
