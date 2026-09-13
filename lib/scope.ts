/**
 * Data-access scope for the current user. Central/Sysadmin see everything and may
 * create/extend projects & campaigns. Officers are scoped to their store; Regional
 * Managers to their zone (region). Used by the campaign server actions.
 */
import type { Prisma } from "@prisma/client";
import { getSession } from "./auth";
import { getRole } from "./session";
import { prisma } from "./prisma";
import type { RoleKey } from "./roles";

export interface Scope {
  role: RoleKey;
  userId: number | null;
  storeId: number | null; // officer's store
  zone: string | null; // regional manager's region label (display only — NOT the scope axis)
  managedStoreIds: number[] | null; // RM's assigned stores (Store.regionalManager == their name); null for non-RM
}

/**
 * The stores a Regional Manager actually manages — the STORES whose `regionalManager` is this RM (by
 * name). This is the authoritative RM↔store link (an RM's stores can span multiple districts, and a
 * district contains stores managed by OTHER RMs), so it — not `User.zone` — is the real scope axis.
 */
async function managedStoreIdsFor(name: string): Promise<number[]> {
  const n = name.trim();
  if (!n) return [];
  const rows = await prisma.store.findMany({
    where: { regionalManager: { equals: n, mode: "insensitive" } },
    select: { id: true },
  });
  return rows.map((s) => s.id);
}

export async function getScope(): Promise<Scope> {
  const [role, session] = await Promise.all([getRole(), getSession()]);
  if (!session) return { role, userId: null, storeId: null, zone: null, managedStoreIds: null };
  const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, storeId: true, zone: true } });
  const managedStoreIds = role === "regional" ? await managedStoreIdsFor(u?.name ?? "") : null;
  return { role, userId: session.userId, storeId: u?.storeId ?? null, zone: u?.zone ?? null, managedStoreIds };
}

/** Central team + Sysadmin may create / extend / delete projects & campaigns. */
export function canManage(role: RoleKey): boolean {
  return role === "central" || role === "sysadmin";
}

/**
 * May the current user act on (complete an action / sign off a visit) a record made by someone?
 * The maker themselves (by employee code, any role), the RM who manages that store, and any
 * central/sysadmin qualify. Officers may only act on their OWN records. Campaigners: never.
 */
export function canSignOff(
  scope: Scope,
  actorCode: string | null,
  target: { storeId: number | null; byCode: string | null | undefined },
): boolean {
  if (scope.role === "central" || scope.role === "sysadmin") return true;
  const isMaker = !!actorCode && !!target.byCode && target.byCode === actorCode;
  if (scope.role === "regional")
    return isMaker || (target.storeId != null && (scope.managedStoreIds ?? []).includes(target.storeId));
  if (scope.role === "officer") return isMaker;
  return false; // campaigner
}

/**
 * May the current user REVIEW / sign off a visit? Unlike action-completion, visit sign-off is
 * strictly a supervisory task: the managing RM and any central/sysadmin — NEVER the recording
 * officer on their own visit. An RM may sign off their own visits too (maker, or in-their-stores).
 */
export function canReviewVisit(
  scope: Scope,
  actorCode: string | null,
  target: { storeId: number | null; byCode: string | null | undefined },
): boolean {
  if (scope.role === "central" || scope.role === "sysadmin") return true;
  if (scope.role === "regional") {
    const isMaker = !!actorCode && !!target.byCode && target.byCode === actorCode;
    return isMaker || (target.storeId != null && (scope.managedStoreIds ?? []).includes(target.storeId));
  }
  return false; // officer / campaigner — sign-off is not theirs to give
}

/**
 * Row-level scope fragments. `null` = unrestricted (central/sysadmin); `"none"` = show
 * nothing (a scoped user with no store assigned — fail CLOSED, never open).
 *
 * Everyone is scoped by the STORE, never `Farmer.zone` (unreliable — ~19% null, some disagree). An
 * Agri Officer → their one store; a Regional Manager → the SET of stores they manage
 * (`scope.managedStoreIds`, from `Store.regionalManager`), which can span districts. Callers must AND
 * these on LAST, after any user-supplied filters, so a crafted query string can never widen them.
 */
export type Scoped<W> = W | "none" | null;

/** The RM's managed-store id list, or "none" when they manage no stores (fail closed). */
function rmStoreIds(scope: Scope): number[] | "none" {
  return scope.managedStoreIds && scope.managedStoreIds.length ? scope.managedStoreIds : "none";
}

export function farmerScopeWhere(scope: Scope): Scoped<Prisma.FarmerWhereInput> {
  if (scope.role === "campaigner") return "none"; // call team has no farmer-directory access — fail closed
  if (scope.role === "officer") return scope.storeId != null ? { storeId: scope.storeId } : "none";
  if (scope.role === "regional") { const ids = rmStoreIds(scope); return ids === "none" ? "none" : { storeId: { in: ids } }; }
  return null;
}

export function storeScopeWhere(scope: Scope): Scoped<Prisma.StoreWhereInput> {
  if (scope.role === "campaigner") return "none";
  if (scope.role === "officer") return scope.storeId != null ? { id: scope.storeId } : "none";
  if (scope.role === "regional") { const ids = rmStoreIds(scope); return ids === "none" ? "none" : { id: { in: ids } }; }
  return null;
}

/**
 * Visits use their own `storeId` when set, else fall back to the farmer's store —
 * visits recorded through the wizard currently persist a null storeId, and those
 * still belong to the farmer's store for access purposes.
 */
export function visitScopeWhere(scope: Scope): Scoped<Prisma.VisitWhereInput> {
  if (scope.role === "campaigner") return "none";
  if (scope.role === "officer") {
    if (scope.storeId == null) return "none";
    return { OR: [{ storeId: scope.storeId }, { storeId: null, farmer: { storeId: scope.storeId } }] };
  }
  if (scope.role === "regional") {
    const ids = rmStoreIds(scope);
    if (ids === "none") return "none";
    return { OR: [{ storeId: { in: ids } }, { storeId: null, farmer: { storeId: { in: ids } } }] };
  }
  return null;
}

/**
 * Ghoshti (farmer meetup) row-level scope. Ghoshtis carry a snapshot `storeId` (no relation), so scoping
 * keys off that. Officer → own store; RM → their managed stores; central/sysadmin → all.
 */
export function ghoshtiScopeWhere(scope: Scope): Scoped<Prisma.GhoshtiWhereInput> {
  if (scope.role === "campaigner") return "none";
  if (scope.role === "officer") return scope.storeId != null ? { storeId: scope.storeId } : "none";
  if (scope.role === "regional") { const ids = rmStoreIds(scope); return ids === "none" ? "none" : { storeId: { in: ids } }; }
  return null;
}

/**
 * Whether `scope` may approve/reject a Ghoshti created under `createdByRole` in `zone`.
 * Officer-created → RM of the SAME zone, or any central/sysadmin. RM-created → central/sysadmin only.
 * Nobody may approve their own creation implicitly here — callers still block self-approval by userId.
 */
export function canApproveGhoshti(
  scope: Scope,
  createdByRole: string | null | undefined,
  zone: string | null | undefined,
): boolean {
  if (scope.role === "central" || scope.role === "sysadmin") return true;
  if (createdByRole === "officer" && scope.role === "regional") {
    return !!scope.zone && scope.zone === zone;
  }
  return false;
}

export interface Actor {
  name: string;
  code: string | null; // User.employeeCode, e.g. "VERDE123"
  userId: number | null;
}

/**
 * Audit identity: the ACTUAL logged-in user (never the impersonated persona) —
 * recorded on visit forms and campaign-outreach marks alongside the timestamp.
 */
export async function getActor(): Promise<Actor> {
  const session = await getSession();
  if (!session) return { name: "Unknown", code: null, userId: null };
  const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, employeeCode: true } });
  return { name: u?.name ?? "Unknown", code: u?.employeeCode ?? null, userId: session.userId };
}
