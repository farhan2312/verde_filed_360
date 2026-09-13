/** Shared types for the Leads Pipeline screen. */

export type LeadCardData = {
  id: number;
  name: string;
  village: string | null;
  crop: string | null;
  land: number | null;
  lastVisit: string | null;
};

export type LeadColumnData = {
  key: string;
  title: string;
  color: string;
  count: number;
  items: LeadCardData[];
};
