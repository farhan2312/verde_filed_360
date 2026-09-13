/** Segment & lead-status visual maps — verbatim from the design (segColors / segBgs). */

export const SEGMENT_LABELS = [
  "High Value",
  "Medium Value",
  "New/Low",
  "Dormant",
] as const;
export type SegmentLabel = (typeof SEGMENT_LABELS)[number];

export const SEGMENT_COLORS: Record<SegmentLabel, string> = {
  "High Value": "#7DA02E",
  "Medium Value": "#1565C0",
  "New/Low": "#D4881F",
  Dormant: "#9E9E9E",
};

export const SEGMENT_BGS: Record<SegmentLabel, string> = {
  "High Value": "#F5F9EA",
  "Medium Value": "#E3F2FD",
  "New/Low": "#FEF6E9",
  Dormant: "#F5F5F5",
};

/** Map the Prisma Segment enum <-> display label. */
export const SEGMENT_ENUM_TO_LABEL: Record<string, SegmentLabel> = {
  HIGH_VALUE: "High Value",
  MEDIUM_VALUE: "Medium Value",
  NEW_LOW: "New/Low",
  DORMANT: "Dormant",
};
export const SEGMENT_LABEL_TO_ENUM: Record<SegmentLabel, string> = {
  "High Value": "HIGH_VALUE",
  "Medium Value": "MEDIUM_VALUE",
  "New/Low": "NEW_LOW",
  Dormant: "DORMANT",
};

export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Follow-up",
  "Converted",
  "Dormant",
] as const;
export type LeadStatusLabel = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_COLORS: Record<LeadStatusLabel, string> = {
  New: "#D4881F",
  Contacted: "#1565C0",
  "Follow-up": "#7B1FA2",
  Converted: "#7DA02E",
  Dormant: "#9E9E9E",
};

export const LEAD_ENUM_TO_LABEL: Record<string, LeadStatusLabel> = {
  NEW: "New",
  CONTACTED: "Contacted",
  FOLLOWUP: "Follow-up",
  CONVERTED: "Converted",
  DORMANT: "Dormant",
};
export const LEAD_LABEL_TO_ENUM: Record<LeadStatusLabel, string> = {
  New: "NEW",
  Contacted: "CONTACTED",
  "Follow-up": "FOLLOWUP",
  Converted: "CONVERTED",
  Dormant: "DORMANT",
};
