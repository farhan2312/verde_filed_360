/** Shared Action-registry enums, reasons + view-model (kept out of the "use server" actions file). */

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/**
 * Start of "today" at IST midnight (the server runs UTC, the users are in India) - the single, shared
 * overdue cutoff. An action is OVERDUE only when its dueDate is strictly before this: a follow-up due
 * *today* is still due, not overdue. Follow-up dueDates are stored as UTC midnight of the calendar day
 * the user picked, so IST midnight (18:30 UTC the evening before) sits correctly between "yesterday" and
 * "today" all day long in India. Every overdue count in the app (Action Registry, sidebar badge, Store
 * 360, Overall + leaderboards) must use this so the numbers agree - using `new Date()` instead wrongly
 * flags all of today's follow-ups as overdue.
 */
export const startOfToday = (now: Date = new Date()): Date => {
  const istMs = now.getTime() + IST_OFFSET_MS;
  return new Date(istMs - (((istMs % 86_400_000) + 86_400_000) % 86_400_000) - IST_OFFSET_MS);
};

export const ACTION_STATUSES = ["OPEN", "DONE"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Follow-up reasons — used by the visit form dropdown AND the manual "New action" form. */
export const FOLLOWUP_REASONS = [
  "Order Booking",
  "Product Demonstration",
  "Payment Collection",
  "Crop Stage Check",
  "Advisory / Recommendation",
  "Complaint / Issue Resolution",
  "Scheme / Subsidy Info",
  "Soil Test Result",
  "New Product Introduction",
  "Re-visit",
  "Other",
] as const;

export interface ActionVM {
  id: number;
  farmerId: number | null;
  farmerName: string;
  farmerMobile: string;
  farmerVillage: string;
  lastVisit: string | null; // ISO timestamp of the farmer's most recent visit (null = never)
  storeId: number | null;
  storeName: string;
  district: string;
  visitId: number | null;
  reason: string;
  note: string;
  workingComment: string; // latest working comment (full history via getActionComments)
  dueDate: string;   // ISO "YYYY-MM-DD"
  status: string;    // OPEN | DONE
  overdue: boolean;  // OPEN and past due
  createdBy: string;
  createdAt: string; // ISO
  completedBy: string;
  completedAt: string | null;
  completionNote: string;
}

export interface FarmerPick {
  id: number;
  name: string;
  mobile: string;
  village: string;
  storeId: number | null;
  storeName: string;
}
