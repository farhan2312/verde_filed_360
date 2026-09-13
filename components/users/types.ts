/** Plain typed shapes passed from the server page into the client subcomponents. */

export interface UserRow {
  id: number;
  init: string;
  name: string;
  /** Display sub-line under the name (the employee code). */
  email: string;
  employeeCode: string;
  mobile: string;
  workEmail: string;
  /** Display role label, e.g. "Agri Officer". */
  roleLabel: string;
  /** Persona role key: "officer" | "regional" | "central" | "sysadmin". */
  roleKey: string;
  /** linear-gradient(...) string for the avatar. */
  grad: string;
  territory: string;
  /** Mapped store (short name) — officers; "—" when unmapped or not a store role. */
  storeName: string;
  /** Region (User.zone) — mainly regional managers; "" when none. */
  zone: string;
  lastActive: string;
  visitsMtd: string;
  /** "Active" | "Inactive" */
  status: string;
}

/** A lightweight agri-officer (ASR user) for the store-management pick lists. */
export interface OfficerLite {
  id: number;
  name: string;
  code: string;
  init: string;
  /** linear-gradient(...) avatar. */
  grad: string;
  active: boolean;
  /** Their region (for same-zone candidate ranking). */
  zone: string;
  /** The store this officer is currently mapped to (null = unassigned). */
  storeId: number | null;
}

/** A store row for the all-stores management table. */
export interface StoreMgmtRow {
  id: number;
  code: string;
  name: string;
  shortName: string;
  status: string;
  zone: string;
  address: string;
  regionalManager: string;
  lat: number | null;
  lng: number | null;
  hasGps: boolean;
  color: string;
  farmerCount: number;
  officers: OfficerLite[];
  /** Operational store with no active officer. */
  unmapped: boolean;
}

/** A regional manager option (for the store RM picker). */
export interface RegionalOption {
  id: number;
  name: string;
  zone: string;
}

export interface StoreTotals {
  total: number;
  active: number;
  mapped: number;
  unmapped: number;
  closed: number;
  officersAssigned: number;
  officersUnassigned: number;
  farmersMapped: number;
}

/** Everything the Store Management tab needs. */
export interface StoreMgmtData {
  rows: StoreMgmtRow[];
  allOfficers: OfficerLite[];
  unassignedOfficers: OfficerLite[];
  regionals: RegionalOption[];
  totals: StoreTotals;
}
