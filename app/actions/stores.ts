"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const s = await getSession();
  if (!s?.isAdmin) throw new Error("Not authorized");
  return s;
}

type Result = { ok: boolean; error?: string };
const fail = (e: unknown, msg: string): Result => ({
  ok: false,
  error: e instanceof Error ? e.message : msg,
});

export interface StoreFormInput {
  code: string;
  name: string;
  status: string;
  zone: string;
  address: string;
  regionalManager: string;
  /** Form strings, parsed + validated server-side. */
  lat: string;
  lng: string;
}

/** Parse the optional lat/lng pair (both-or-neither, valid ranges). */
function parseLatLng(
  latStr: string,
  lngStr: string,
): { ok: true; lat: number | null; lng: number | null } | { ok: false; error: string } {
  const a = latStr.trim();
  const b = lngStr.trim();
  if (!a && !b) return { ok: true, lat: null, lng: null };
  if (!a || !b) return { ok: false, error: "Enter both latitude and longitude, or leave both blank." };
  const lat = Number(a);
  const lng = Number(b);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { ok: false, error: "Latitude/longitude must be numbers." };
  if (lat < -90 || lat > 90) return { ok: false, error: "Latitude must be between -90 and 90." };
  if (lng < -180 || lng > 180) return { ok: false, error: "Longitude must be between -180 and 180." };
  return { ok: true, lat, lng };
}

/** Create a store. */
export async function createStoreAction(input: StoreFormInput): Promise<Result> {
  await requireAdmin();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "Store code is required." };
  if (!name) return { ok: false, error: "Store name is required." };
  const gps = parseLatLng(input.lat, input.lng);
  if (!gps.ok) return { ok: false, error: gps.error };
  try {
    const clash = await prisma.store.findUnique({ where: { code }, select: { id: true } });
    if (clash) return { ok: false, error: `Store code ${code} already exists.` };
    await prisma.store.create({
      data: {
        code,
        name,
        status: input.status.trim() || "Active",
        zone: input.zone.trim() || null,
        address: input.address.trim() || null,
        regionalManager: input.regionalManager.trim() || null,
        lat: gps.lat,
        lng: gps.lng,
        source: "REAL",
      },
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return fail(e, "Create failed");
  }
}

/** Edit a store's details (never touches officer mapping). */
export async function updateStoreAction(input: StoreFormInput & { id: number }): Promise<Result> {
  await requireAdmin();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "Store code is required." };
  if (!name) return { ok: false, error: "Store name is required." };
  const gps = parseLatLng(input.lat, input.lng);
  if (!gps.ok) return { ok: false, error: gps.error };
  try {
    const clash = await prisma.store.findFirst({
      where: { code, NOT: { id: input.id } },
      select: { id: true },
    });
    if (clash) return { ok: false, error: `Store code ${code} is already used by another store.` };
    await prisma.store.update({
      where: { id: input.id },
      data: {
        code,
        name,
        status: input.status.trim() || "Active",
        zone: input.zone.trim() || null,
        address: input.address.trim() || null,
        regionalManager: input.regionalManager.trim() || null,
        lat: gps.lat,
        lng: gps.lng,
      },
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return fail(e, "Save failed");
  }
}

/** Map an agri officer (ASR user) to a store — 1:1 set-overwrite (moves them if already mapped). */
export async function assignOfficerAction(officerUserId: number, storeId: number): Promise<Result> {
  await requireAdmin();
  try {
    const user = await prisma.user.findUnique({ where: { id: officerUserId }, select: { id: true, role: true } });
    if (!user) return { ok: false, error: "User not found." };
    if (user.role !== "ASR") return { ok: false, error: "Only Agri Officers can be mapped to a store." };
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, zone: true, name: true } });
    if (!store) return { ok: false, error: "Store no longer exists — reload." };
    await prisma.user.update({
      where: { id: officerUserId },
      data: { storeId, zone: store.zone ?? undefined, territory: store.name },
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return fail(e, "Assign failed");
  }
}

/** Remove an officer's store mapping (keeps their zone/territory + account). */
export async function unassignOfficerAction(officerUserId: number): Promise<Result> {
  await requireAdmin();
  try {
    await prisma.user.update({ where: { id: officerUserId }, data: { storeId: null } });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return fail(e, "Unassign failed");
  }
}

export interface DeleteImpact {
  ok: boolean;
  farmers: number;
  officers: number;
  employees: number;
  visits: number;
  store?: { name: string; code: string };
  error?: string;
}

/** Dry-run: what a store delete would detach. No mutation. */
export async function getStoreDeleteImpactAction(storeId: number): Promise<DeleteImpact> {
  await requireAdmin();
  try {
    const [farmers, officers, employees, visits, store] = await Promise.all([
      prisma.farmer.count({ where: { storeId } }),
      prisma.user.count({ where: { storeId, role: "ASR" } }),
      prisma.employee.count({ where: { storeId } }),
      prisma.visit.count({ where: { storeId } }),
      prisma.store.findUnique({ where: { id: storeId }, select: { name: true, code: true } }),
    ]);
    if (!store) return { ok: false, farmers: 0, officers: 0, employees: 0, visits: 0, error: "Store not found." };
    return { ok: true, farmers, officers, employees, visits, store };
  } catch (e) {
    return { ok: false, farmers: 0, officers: 0, employees: 0, visits: 0, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Delete a store. Farmers/employees/visits auto-detach via FK (ON DELETE SET NULL);
 * ASR officers' loose `storeId` (no FK) is nulled explicitly in the same transaction.
 * `confirmFarmers` must match the current count (stale-count guard).
 */
export async function deleteStoreAction(
  storeId: number,
  opts: { confirmFarmers: number },
): Promise<Result> {
  await requireAdmin();
  try {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, code: true } });
    if (!store) return { ok: false, error: "Store already deleted — reload." };
    const farmers = await prisma.farmer.count({ where: { storeId } });
    if (opts.confirmFarmers !== farmers) {
      return { ok: false, error: `Farmer count changed (now ${farmers}). Reload and retry.` };
    }
    await prisma.$transaction([
      // Clear the denormalized storeCode strings (no FK) so a later store that
      // reuses this code can't inherit these rows in code-keyed views
      // (master-data counts, Cluster Builder). storeId is cleared by the FK.
      prisma.farmer.updateMany({ where: { storeCode: store.code }, data: { storeCode: null } }),
      prisma.employee.updateMany({ where: { storeCode: store.code }, data: { storeCode: null } }),
      // Null the loose ASR User.storeId (it has no FK to auto-clear it).
      prisma.user.updateMany({ where: { storeId, role: "ASR" }, data: { storeId: null } }),
      prisma.store.delete({ where: { id: storeId } }),
    ]);
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return fail(e, "Delete failed");
  }
}
