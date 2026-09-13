/** Plain typed data shapes passed from the server page to client/presentational subcomponents. */

export interface FarmerSale {
  id: number;
  invoice: string;
  date: string;
  items: string;
  /** Base / pre-tax price for this invoice (the figure used in all calculations). */
  base: string;
  /** GST-inclusive final price for this invoice (display only — never used in any calculation). */
  amount: string;
  store: string;
}

export interface FarmerVisitLog {
  id: number;
  purpose: string;
  date: string;
  notes: string;
  by: string;
  /** Next-visit date the officer scheduled (display string), or "". */
  followUp: string;
}

export interface CropHistoryEntry {
  id: number;
  date: string;        // display date of the visit
  primary: string;     // primary crop recorded on that visit
  others: string[];    // secondary crops
  season: string;
  by: string;          // officer who logged it
  changedFrom: string | null; // previous visit's primary crop, if it changed at this visit
}

export interface StoreOfficer {
  name: string;
}

export interface FarmerStore {
  name: string;
  code: string;
  color: string;
  address: string;
  officers: StoreOfficer[];
}

export interface FarmerDetail {
  id: number;
  name: string;
  village: string;
  district: string;
  mobile: string;
  land: string; // e.g. "4.5" or "" if null
  crop: string;
  season: string;
  soil: string;
  status: string; // lead-status display label
  segment: string; // value-tier display label
  segBg: string;
  segColor: string;
  lifecycle: string; // lifecycle display label
  lifeBg: string;
  lifeColor: string;
  attendedGhoshti: boolean; // has attended at least one Ghoshti (farmer meetup)
  salesCrops: string[]; // crops from the sales upload (labelled)
  visitCrops: string[]; // crops from field visits (labelled)
  ltv: string; // computed lifetime value on BASE price, e.g. "₹0"
  ltvGst: string; // lifetime value incl GST (display only — never used in calculations)
  saleCount: number;
  visitCount: number;
  lastPurchaseAmt: string;
  lastPurchaseDate: string;
  store: FarmerStore | null;
  sales: FarmerSale[];
  visitLog: FarmerVisitLog[];
  cropHistory: CropHistoryEntry[]; // primary crop per visit, newest first, with change flags
  concerns: string;
  issues: string[];
}
