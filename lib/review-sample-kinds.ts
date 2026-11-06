/** The automatic review emails an admin can preview from Settings → Reviews & Reports (client-safe). */
export type SampleKind = "RM_REPORT" | "RM_DIGEST" | "CENTRAL_WEEK" | "CENTRAL_SLA";
export const SAMPLE_KINDS: { kind: SampleKind; label: string }[] = [
  { kind: "RM_REPORT", label: "RM · Weekly report ready" },
  { kind: "RM_DIGEST", label: "RM · Daily pending-review digest" },
  { kind: "CENTRAL_WEEK", label: "Central · Weekly all-regions roll-up" },
  { kind: "CENTRAL_SLA", label: "Central · Overdue-review (SLA) alert" },
];
