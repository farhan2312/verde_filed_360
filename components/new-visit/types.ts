/** Shared wizard form shape (maps to a Farmer + Visit draft, spec §3). */
export interface VisitForm {
  // Step 0 — Farmer & Location
  name: string;
  father: string;
  mobile: string;
  village: string;
  district: string;
  visitPurpose: string;
  /** The store this visit is recorded against. Auto-set + locked when the filler has one store;
   *  a mandatory manual pick for regional managers / admins who cover several stores. */
  storeId: number | null;
  /** "field" records the device GPS; "store" (filling in from the store) records no farmer location. */
  visitMode: "field" | "store";
  /** Captured device location for a field visit (null for a store visit or if unavailable). */
  gpsLat: number | null;
  gpsLng: number | null;
  // Step 1 — Land & Crops
  landHolding: string;
  soil: string;
  soilTesting: string;
  waterSource: string[];
  mainCrop: string;
  crop: string[];
  otherCrops: string;
  pests: string[];
  season: string;
  cropInsured: boolean;
  // Step 2 — Products & Issues
  product: string[];
  productRequired: string[];
  currentProblem: string[];
  cropRisk: string[];
  dangerZone: string[];
  // Step 3 — Commercial & Services
  annualExpense: string;
  purchaseFreq: string;
  otherShops: string;
  fpoMember: boolean;
  contractFarming: boolean;
  dairyServices: boolean;
  whatsappAvail: boolean;
  // Step 4 — Review & Submit
  leadStatus: string;
  followUpDate: string;
  followUpReason: string;
  followUpComment: string;
  /** Captured photos, as JPEG data-URL strings. */
  photos: string[];
  /** Recorded voice notes, as audio data-URL strings. */
  voiceNotes: string[];
  // Cross-cutting side-channels (not columns themselves)
  /** R6: free text for an "Other" chip, keyed by wizard field key (soil, waterSource, crop, product, …). */
  otherText: Record<string, string>;
  /** R5: detail text for a service toggle when ON, keyed by the service field key. */
  serviceDetail: Record<string, string>;
}

export const INITIAL_FORM: VisitForm = {
  name: "",
  father: "",
  mobile: "",
  village: "",
  district: "",
  visitPurpose: "",
  storeId: null,
  visitMode: "field",
  gpsLat: null,
  gpsLng: null,
  landHolding: "",
  soil: "",
  soilTesting: "Not Required",
  waterSource: [],
  mainCrop: "",
  crop: [],
  otherCrops: "",
  pests: [],
  season: "Rabi",
  cropInsured: false,
  product: [],
  productRequired: [],
  currentProblem: [],
  cropRisk: [],
  dangerZone: [],
  annualExpense: "",
  purchaseFreq: "",
  otherShops: "",
  fpoMember: false,
  contractFarming: false,
  dairyServices: false,
  whatsappAvail: false,
  leadStatus: "New",
  followUpDate: "",
  followUpReason: "",
  followUpComment: "",
  photos: [],
  voiceNotes: [],
  otherText: {},
  serviceDetail: {},
};

/** Full record returned by the server-side mobile lookup (for autofill + edit). */
export interface FarmerLookup {
  id: number;
  name: string;
  village: string;
  district: string;
  mainCrop: string;
  segmentLabel: string | null;
  leadStatusLabel: string | null;
  ltv: string; // formatted ₹ or "—"
  lastVisit: string; // display date or "—"
}

export interface FarmerLookupResult {
  found: boolean;
  farmer?: FarmerLookup;
  /** Descriptive fields from the farmer's most recent visit, to prefill the form (editable).
   *  Excludes event-only fields (photos, voice notes, follow-up, visit purpose). */
  prefill?: Partial<VisitForm>;
}
