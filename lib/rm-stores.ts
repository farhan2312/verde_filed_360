import { prisma } from "@/lib/prisma";

/**
 * Regional-Manager → stores mapping for the review queue, the weekly-report engine and the
 * completion trend.
 *
 * In Verde a store can have SEVERAL managers: `Store.rmUserIds` (Int[]) is authoritative and
 * `Store.regionalManager` is only a denormalised comma-joined display label ("Asha R, Vikram S"),
 * so it is NOT a usable key. Everything that groups "by RM" therefore iterates REGIONAL *user
 * accounts* and resolves each one's stores by user id — a store with two RMs legitimately appears
 * under both of them. The legacy exact-name match is kept as a fallback so a store imported with a
 * manager name but no linked account still works; it is deliberately the SAME rule as
 * `managedStoreIdsFor` in lib/scope.ts, so a report never includes a store the RM's own row-level
 * scope would hide.
 */
export interface RmWithStores {
  userId: number; // the report / grouping key — never the display name
  name: string;
  code: string | null; // User.employeeCode, e.g. "VER074"
  workEmail: string | null;
  email: string | null;
  storeIds: number[];
}

type StoreRm = { id: number; rmUserIds: number[]; regionalManager: string | null };

const matches = (s: StoreRm, userId: number, lowerName: string) =>
  s.rmUserIds.includes(userId) || (!!lowerName && (s.regionalManager ?? "").trim().toLowerCase() === lowerName);

/** Every approved, active REGIONAL account with the stores it manages (name order). */
export async function allRmStores(): Promise<RmWithStores[]> {
  const [rms, stores] = await Promise.all([
    prisma.user.findMany({
      where: { role: "REGIONAL", active: true, approvalStatus: "APPROVED" },
      select: { id: true, name: true, employeeCode: true, workEmail: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.store.findMany({ select: { id: true, rmUserIds: true, regionalManager: true } }),
  ]);
  return rms.map((u) => {
    const lower = u.name.trim().toLowerCase();
    return {
      userId: u.id,
      name: u.name,
      code: u.employeeCode,
      workEmail: u.workEmail,
      email: u.email,
      storeIds: stores.filter((s) => matches(s, u.id, lower)).map((s) => s.id),
    };
  });
}

/**
 * Stores nobody manages — no linked RM account and no legacy manager name. Drives the review
 * queue's "Unassigned (no RM)" filter.
 */
export async function unassignedStoreIds(stores: StoreRm[]): Promise<number[]> {
  const rms = await prisma.user.findMany({
    where: { role: "REGIONAL", active: true, approvalStatus: "APPROVED" },
    select: { id: true, name: true },
  });
  return stores
    .filter((s) => !rms.some((u) => matches(s, u.id, u.name.trim().toLowerCase())))
    .map((s) => s.id);
}
