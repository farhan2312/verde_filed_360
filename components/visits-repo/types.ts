export interface VisitRecord {
  id: number;
  date: string;
  farmerName: string;
  village: string;
  district: string;
  crop: string;
  land: string;
  officer: string;
  purpose: string;
  storeName: string;
  storeId: number | null;
  rm: string; // the store's Regional Manager (denormalized name), "" if none
  avBg: string;
  needsFollowup: boolean;
  followUp: string; // display date of the scheduled follow-up, or ""
  reviewed: boolean; // has this visit been signed off / reviewed?
}

export interface VisitFilterState {
  officer: string;
  store: string;
  rm: string; // regional manager filter
  type: string;
  period: string;
  review: string; // "all" | "reviewed" | "pending"
  q: string; // free-text search (farmer name / mobile / village / officer)
  date: string; // exact visit date (YYYY-MM-DD), IST; overrides period/range when set
  from: string; // visit date range start (YYYY-MM-DD), IST
  to: string;   // visit date range end (YYYY-MM-DD), IST
}

export interface VisitFilterOptions {
  officers: string[];
  stores: string[];
  rms: string[];
  types: string[];
}
