import { canAccess, type RoleKey } from "./roles";

export type NavId =
  | "dashboard" | "newVisit" | "visitRepo" | "actionRegistry" | "farmers" | "mapView"
  | "farmerCluster" | "analytics" | "actions" | "projects" | "campaigns" | "ghoshti"
  | "products" | "movement"
  | "users" | "salesImport" | "settings" | "audit" | "bugs" | "whatsappInbox";

/** A "view" can also be a detail variant of a nav id (for header titles). */
export type ViewId = NavId | "farmerDetail" | "visitDetail" | "projectDetail" | "ghoshtiDetail" | "training";

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
}

export const MAIN_NAV: NavItem[] = [
  { id: "analytics", label: "Analytics", href: "/analytics" },
  { id: "newVisit", label: "New Visit", href: "/visits/new" },
  { id: "visitRepo", label: "Visit Repo", href: "/visits" },
  { id: "actionRegistry", label: "Action Registry", href: "/action-registry" },
  { id: "farmers", label: "Farmer 360", href: "/farmers" },
  { id: "mapView", label: "Map View", href: "/map" },
  { id: "farmerCluster", label: "Farmer Clusters", href: "/clusters" },
  { id: "projects", label: "Projects", href: "/projects" },
  { id: "campaigns", label: "Campaigns", href: "/campaigns" },
  { id: "ghoshti", label: "Ghoshti", href: "/ghoshti" },
];

// Hidden from the sidebar for now (the whole SALES group disappears when empty). The /products and
// /movement pages still exist and work by URL — restore these two entries to bring the menu back.
export const SALES_NAV: NavItem[] = [
  // { id: "products", label: "Product Catalog", href: "/products" },
  // { id: "movement", label: "Stock / Movement", href: "/movement" },
];

export const ADMIN_NAV: NavItem[] = [
  { id: "whatsappInbox", label: "WhatsApp Inbox", href: "/whatsapp" },
  { id: "users", label: "Users", href: "/users" },
  { id: "salesImport", label: "Sales Import", href: "/imports" },
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "audit", label: "Audit Log", href: "/audit" },
  { id: "bugs", label: "Bug Tracker", href: "/bugs" },
];

/** Nav items visible to a role (RBAC). */
export function visibleNav(role: RoleKey) {
  const sales = SALES_NAV.filter((n) => canAccess(n.id, role));
  const admin = ADMIN_NAV.filter((n) => canAccess(n.id, role));
  return {
    main: MAIN_NAV.filter((n) => canAccess(n.id, role)),
    sales,
    admin,
    showSalesGroup: sales.length > 0,
    showAdminGroup: admin.length > 0,
  };
}

const ALL_HREFS = [...MAIN_NAV, ...SALES_NAV, ...ADMIN_NAV].map((n) => n.href);

/** The nav href that should appear active for a given pathname (longest prefix wins). */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const href of ALL_HREFS) {
    if (pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  // /visits/new must beat /visits; longest-prefix handles it, but guard exact /visits/<id>
  return best;
}

/** Map a pathname to a view id (drives header title/subtitle). */
export function routeToView(pathname: string): ViewId {
  if (pathname.startsWith("/visits/new")) return "newVisit";
  if (/^\/visits\/[^/]+/.test(pathname)) return "visitDetail";
  if (pathname.startsWith("/visits")) return "visitRepo";
  if (pathname.startsWith("/action-registry")) return "actionRegistry";
  if (/^\/farmers\/[^/]+/.test(pathname)) return "farmerDetail";
  if (pathname.startsWith("/farmers")) return "farmers";
  if (/^\/actions\/[^/]+/.test(pathname)) return "projectDetail";
  if (pathname.startsWith("/actions")) return "actions";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/campaigns")) return "campaigns";
  if (/^\/ghoshti\/[^/]+/.test(pathname)) return "ghoshtiDetail";
  if (pathname.startsWith("/ghoshti")) return "ghoshti";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/movement")) return "movement";
  if (pathname.startsWith("/map")) return "mapView";
  if (pathname.startsWith("/clusters")) return "farmerCluster";
  if (pathname.startsWith("/analytics")) return "analytics";
  if (pathname.startsWith("/imports")) return "salesImport";
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/audit")) return "audit";
  if (pathname.startsWith("/bugs")) return "bugs";
  if (pathname.startsWith("/whatsapp")) return "whatsappInbox";
  if (pathname.startsWith("/training")) return "training";
  return "analytics"; // Analytics is the home page (Dashboard was merged into it)
}
