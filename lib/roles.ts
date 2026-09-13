/**
 * Role / persona model — verbatim from the original design (renderVals personas + nav flags).
 * The app uses a 4-persona switcher; each persona gates which nav items & screens are visible.
 */

export type RoleKey = "regional" | "officer" | "central" | "sysadmin" | "campaigner";

export interface Persona {
  key: RoleKey;
  name: string;
  role: string;
  init: string;
  /** CSS gradient used for the avatar chip. */
  color: string;
}

export const PERSONAS: Record<RoleKey, Persona> = {
  regional: {
    key: "regional",
    name: "Rajesh Verma",
    role: "Regional Manager",
    init: "RV",
    color: "linear-gradient(135deg,#93B93C,#EDA942)",
  },
  officer: {
    key: "officer",
    name: "Raj Kumar",
    role: "Agri Officer",
    init: "RK",
    color: "linear-gradient(135deg,#1565C0,#42A5F5)",
  },
  central: {
    key: "central",
    name: "Dr. Anita Sharma",
    role: "Central Admin",
    init: "AS",
    color: "linear-gradient(135deg,#7B1FA2,#CE93D8)",
  },
  sysadmin: {
    key: "sysadmin",
    name: "Vikash Mehta",
    role: "System Admin",
    init: "VM",
    color: "linear-gradient(135deg,#E65100,#FF8F00)",
  },
  campaigner: {
    key: "campaigner",
    name: "Call Team",
    role: "Campaigner",
    init: "CT",
    color: "linear-gradient(135deg,#00838F,#4DD0E1)",
  },
};

export const ROLE_ORDER: RoleKey[] = ["regional", "officer", "central", "sysadmin", "campaigner"];

/** Display label + avatar gradient for a role (reused from the persona map). */
export function roleLabel(key: RoleKey): string {
  return PERSONAS[key].role;
}
export function roleGradient(key: RoleKey): string {
  return PERSONAS[key].color;
}

/** Prisma Role enum ↔ persona RoleKey. */
export const PRISMA_TO_KEY: Record<string, RoleKey> = {
  SYSADMIN: "sysadmin",
  REGIONAL: "regional",
  CENTRAL: "central",
  ASR: "officer",
  STORE_MANAGER: "officer",
  CAMPAIGNER: "campaigner",
};
export const KEY_TO_PRISMA: Record<RoleKey, string> = {
  sysadmin: "SYSADMIN",
  regional: "REGIONAL",
  central: "CENTRAL",
  officer: "ASR",
  campaigner: "CAMPAIGNER",
};

/** Avatar gradient stops per role (used in the Users table + new accounts). */
export const ROLE_GRAD: Record<RoleKey, [string, string]> = {
  regional: ["#93B93C", "#EDA942"],
  officer: ["#1565C0", "#42A5F5"],
  central: ["#7B1FA2", "#CE93D8"],
  sysadmin: ["#E65100", "#FF8F00"],
  campaigner: ["#00838F", "#4DD0E1"],
};

/** Roles a user may request at registration (admin is granted, not requested). */
export const REQUESTABLE_ROLES: { key: RoleKey; label: string }[] = [
  { key: "officer", label: "Agri Officer" },
  { key: "regional", label: "Regional Manager" },
  { key: "central", label: "Central Team" },
  { key: "campaigner", label: "Campaigner (call team)" },
];

/** Roles a System Admin may assign when creating/editing a user. */
export const ADMIN_ROLE_CHOICES: { key: RoleKey; label: string }[] = [
  { key: "officer", label: "Agri Officer" },
  { key: "regional", label: "Regional Manager" },
  { key: "central", label: "Central Admin" },
  { key: "sysadmin", label: "System Admin" },
  { key: "campaigner", label: "Campaigner (call team)" },
];

/** Which views each role may access (from the showX flags in renderVals). */
export const NAV_VISIBILITY: Record<string, (r: RoleKey) => boolean> = {
  dashboard: () => true,
  newVisit: (r) => r === "regional" || r === "officer" || r === "sysadmin",
  visitRepo: () => true,
  actionRegistry: () => true, // follow-ups; scoped per role (officer→store, RM→district)
  farmers: () => true, // Farmer 360 — scoped per role (officer→store, RM→region)
  mapView: (r) => r !== "officer", // officers work a single store; RMs see their region only
  farmerCluster: (r) => r !== "officer", // RMs may view (region-scoped) clusters but not create them
  analytics: () => true,
  actions: (r) =>
    r === "regional" || r === "central" || r === "officer" || r === "sysadmin",
  campaigns: () => true, // all roles; officers/RMs get a store/region-scoped view
  ghoshti: () => true, // Farmer meetups; scoped per role, with a tiered approval flow
  projects: (r) => r === "central" || r === "sysadmin", // initiated by the central team only
  products: (r) => r === "regional" || r === "central" || r === "sysadmin",
  movement: (r) => r === "regional" || r === "central" || r === "sysadmin",
  users: (r) => r === "central" || r === "sysadmin",
  whatsappInbox: (r) => r === "sysadmin", // WhatsApp inbox — system admins only
  salesImport: (r) => r === "sysadmin" || r === "central",
  settings: (r) => r === "sysadmin",
  bugs: (r) => r === "sysadmin",
  audit: (r) => r === "sysadmin",
};

export function canAccess(view: string, role: RoleKey): boolean {
  // Campaigners are a locked-down call team: the Campaigns page is the ONLY app view they may reach.
  // (The global Training/Help link is not gated through here.)
  if (role === "campaigner") return view === "campaigns";
  const fn = NAV_VISIBILITY[view];
  return fn ? fn(role) : true;
}

/** Per-role dashboard subtitle (from the dashSubs map). */
export const DASHBOARD_SUBTITLES: Record<RoleKey, string> = {
  regional: "Agra Region · Sunday, June 22, 2026",
  officer: "My Territory · Sunday, June 22, 2026",
  central: "All Regions · Organization Overview",
  sysadmin: "System Administration",
  campaigner: "Call Team",
};

/** View title + subtitle (from the titles map). Subtitles that depend on role/data
 *  are resolved at render time; these are the static parts. */
export function viewTitle(
  view: string,
  role: RoleKey,
  extras?: { step?: number; projectCount?: number; activeCount?: number },
): [string, string] {
  switch (view) {
    case "dashboard":
      return ["Dashboard", DASHBOARD_SUBTITLES[role]];
    case "analytics":
      return [
        "Analytics & Insights",
        role === "officer"
          ? "My store — overview & deep-dive"
          : role === "regional"
            ? "My region — overview & deep-dive"
            : "Organization overview & cross-region analysis",
      ];
    case "newVisit":
      return ["New Visit Entry", `Step ${(extras?.step ?? 0) + 1} of 5`];
    case "farmers":
      return ["Farmer 360", "1,284 registered farmers · Segmented view"];
    case "farmerDetail":
      return ["Farmer 360 — Profile", ""];
    case "actions":
      return [
        "Action Planner",
        `${extras?.projectCount ?? 0} projects · ${extras?.activeCount ?? 0} active`,
      ];
    case "projectDetail":
      return ["Project Details", ""];
    case "mapView":
      return ["Map View", "Browse stores, filter farmers, and save clusters for action"];
    case "farmerCluster":
      return ["Farmer Clusters", "Saved farmer groups for targeted actions"];
    case "visitRepo":
      return [
        "Visit Repository",
        "Complete visit records across all officers & stores",
      ];
    case "actionRegistry":
      return ["Action Registry", "Follow-ups assigned to stores, with due dates"];
    case "visitDetail":
      return ["Visit Detail", ""];
    case "users":
      return ["User Management", "4 active users · Role-based access"];
    case "salesImport":
      return ["Sales Sync", "ERP sales feed — daily schedule, on-demand runs & history"];
    case "settings":
      return ["System Settings", "Configuration & master data"];
    case "audit":
      return ["Audit Log", "System activity & data changes"];
    case "whatsappInbox":
      return ["WhatsApp Inbox", "Everyone who has messaged the official number"];
    case "bugs":
      return ["Bug Tracker", "Reports filed through the portal · triage & resolve"];
    case "training":
      return ["Training & Help", "Guides and how-to videos for the portal"];
    case "campaigns":
      return ["Campaigns", "Segmented customer targeting & outreach"];
    case "ghoshti":
      return ["Ghoshti", "Farmer meetups · attendance & approvals"];
    case "ghoshtiDetail":
      return ["Ghoshti Detail", ""];
    case "projects":
      return ["Projects", "Bundle farmer clusters into reusable projects"];
    case "products":
      return ["Product Catalog", "All products sold · categories, pricing & sales"];
    case "movement":
      return ["Stock / Movement", "Product velocity & demand signal across stores"];
    default:
      return ["Analytics & Insights", "Overview & deep-dive"];
  }
}
