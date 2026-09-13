"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, getActor, canManage, ghoshtiScopeWhere, canApproveGhoshti } from "@/lib/scope";
import { toMobile10 } from "@/lib/whatsapp";
import { shortStoreName } from "@/lib/store-utils";
import type { RoleKey } from "@/lib/roles";

// ─────────────────────────── View models ───────────────────────────

export interface GhoshtiListItem {
  id: number;
  date: string; // ISO
  storeId: number | null;
  storeName: string; // short name
  zone: string | null;
  topic: string | null;
  status: string; // PENDING | APPROVED | REJECTED
  attendees: number;
  existingCount: number;
  createdBy: string;
  createdByRole: string | null;
  createdAt: string;
  canApprove: boolean; // may the current user approve/reject this one
}

export interface GhoshtiAttendeeVM {
  id: number;
  mobile: string;
  name: string | null;
  isExisting: boolean;
  matchedFarmerId: number | null;
  attended: boolean;
  remarks: string | null;
}

export interface GhoshtiDetailVM {
  id: number;
  date: string;
  storeId: number | null;
  storeName: string;
  zone: string | null;
  locationNote: string | null;
  topic: string | null;
  notes: string | null;
  status: string;
  createdBy: string;
  createdByCode: string | null;
  createdByRole: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
  attendees: GhoshtiAttendeeVM[];
  canApprove: boolean;
  canEdit: boolean; // creator (while pending) or admin
  canRecordAttendance: boolean; // creator/admin AND the Ghoshti is APPROVED (hard gate)
}

export interface GhoshtiStoreOption {
  id: number;
  name: string; // short name
  zone: string | null;
}

/** Stores this user may host a Ghoshti at (officer → own store; RM → own zone; admin → all). */
export async function getGhoshtiStoreOptions(): Promise<{ locked: boolean; stores: GhoshtiStoreOption[] }> {
  const scope = await getScope();
  let where: Prisma.StoreWhereInput | undefined;
  if (scope.role === "officer") {
    if (scope.storeId == null) return { locked: true, stores: [] };
    where = { id: scope.storeId };
  } else if (scope.role === "regional") {
    if (!scope.managedStoreIds?.length) return { locked: false, stores: [] };
    where = { id: { in: scope.managedStoreIds } };
  }
  const rows = await prisma.store.findMany({
    where,
    select: { id: true, name: true, zone: true },
    orderBy: { name: "asc" },
  });
  return {
    locked: scope.role === "officer",
    stores: rows.map((s) => ({ id: s.id, name: shortStoreName(s.name) || s.name, zone: s.zone })),
  };
}

// ─────────────────────────── Create ───────────────────────────

export async function createGhoshti(input: {
  date: string; // "YYYY-MM-DD"
  storeId: number;
  topic?: string;
  locationNote?: string;
  notes?: string;
}): Promise<{ ok: boolean; id?: number; error?: string }> {
  const scope = await getScope();
  if (scope.role !== "officer" && scope.role !== "regional" && !canManage(scope.role)) {
    return { ok: false, error: "You are not allowed to create a Ghoshti." };
  }
  const when = new Date(`${input.date}T00:00:00`);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a valid date." };
  if (!input.storeId) return { ok: false, error: "Pick a host store." };

  const store = await prisma.store.findUnique({ where: { id: input.storeId }, select: { id: true, name: true, zone: true } });
  if (!store) return { ok: false, error: "Store not found." };

  // Scope guard — a crafted storeId cannot escape the user's store(s).
  if (scope.role === "officer" && store.id !== scope.storeId) return { ok: false, error: "You can only host a Ghoshti at your own store." };
  if (scope.role === "regional" && !(scope.managedStoreIds ?? []).includes(store.id)) return { ok: false, error: "You can only host a Ghoshti at a store you manage." };

  const actor = await getActor();
  // Central/Sysadmin creations are the approvers themselves → auto-approved. Officer/RM → PENDING.
  const autoApprove = canManage(scope.role);

  const g = await prisma.ghoshti.create({
    data: {
      date: when,
      storeId: store.id,
      storeName: shortStoreName(store.name) || store.name,
      zone: store.zone,
      topic: input.topic?.trim() || null,
      locationNote: input.locationNote?.trim() || null,
      notes: input.notes?.trim() || null,
      status: autoApprove ? "APPROVED" : "PENDING",
      createdById: scope.userId,
      createdByName: actor.name,
      createdByCode: actor.code,
      createdByRole: scope.role,
      approvedByName: autoApprove ? actor.name : null,
      approvedByCode: autoApprove ? actor.code : null,
      approvedAt: autoApprove ? new Date() : null,
    },
  });
  revalidatePath("/ghoshti");
  return { ok: true, id: g.id };
}

// ─────────────────────────── Attendees ───────────────────────────

/** Live phone → farmer lookup for the attendance form (auto-fills the name when a farmer matches). */
export async function lookupGhoshtiFarmer(mobile: string): Promise<{ found: boolean; name: string | null }> {
  const m = toMobile10(mobile);
  if (!/^[6-9]\d{9}$/.test(m)) return { found: false, name: null };
  const f = await prisma.farmer.findFirst({ where: { mobile: m }, select: { name: true } });
  return { found: !!f, name: f?.name ?? null };
}

/** Classify + record attendees on a Ghoshti (read-only lookup against existing farmers by mobile). */
export async function addGhoshtiAttendees(input: {
  ghoshtiId: number;
  rows: { mobile: string; name?: string; remarks?: string }[];
}): Promise<{ ok: boolean; added?: number; existing?: number; skipped?: number; error?: string }> {
  const scope = await getScope();
  const g = await ghoshtiForWrite(input.ghoshtiId, scope);
  if (!g) return { ok: false, error: "Ghoshti not found or not editable." };
  // Hard gate (no exceptions): attendance can only be recorded once the Ghoshti is approved.
  if (g.status !== "APPROVED") return { ok: false, error: "This Ghoshti must be approved before attendance can be recorded." };

  // Normalize + dedup within the payload.
  const clean = new Map<string, { mobile: string; name?: string; remarks?: string }>();
  for (const r of input.rows) {
    const m = toMobile10(r.mobile);
    if (!/^[6-9]\d{9}$/.test(m)) continue;
    if (!clean.has(m)) clean.set(m, { mobile: m, name: r.name?.trim() || undefined, remarks: r.remarks?.trim() || undefined });
  }
  if (clean.size === 0) return { ok: false, error: "No valid 10-digit mobile numbers to add." };

  // Drop mobiles already recorded on this Ghoshti.
  const already = new Set(
    (await prisma.ghoshtiAttendee.findMany({ where: { ghoshtiId: g.id, mobile: { in: [...clean.keys()] } }, select: { mobile: true } })).map((a) => a.mobile),
  );
  const toAdd = [...clean.values()].filter((r) => !already.has(r.mobile));
  if (toAdd.length === 0) return { ok: true, added: 0, existing: 0, skipped: clean.size };

  // Read-only classify against existing farmers (loose match by mobile — no FK).
  const matches = new Map(
    (await prisma.farmer.findMany({ where: { mobile: { in: toAdd.map((r) => r.mobile) } }, select: { id: true, mobile: true, name: true } }))
      .map((f) => [f.mobile, f]),
  );

  const actor = await getActor();
  let existing = 0;
  await prisma.ghoshtiAttendee.createMany({
    data: toAdd.map((r) => {
      const f = matches.get(r.mobile);
      if (f) existing++;
      return {
        ghoshtiId: g.id,
        mobile: r.mobile,
        name: r.name ?? f?.name ?? null,
        isExisting: !!f,
        matchedFarmerId: f?.id ?? null,
        attended: true,
        remarks: r.remarks ?? null,
        recordedByName: actor.name,
        recordedByCode: actor.code,
      };
    }),
  });

  // If the Ghoshti is already APPROVED, keep the farmer write-back in sync immediately.
  if (g.status === "APPROVED") await flagAttendedFarmers(g.id, g.date);

  revalidatePath(`/ghoshti/${g.id}`);
  revalidatePath("/ghoshti");
  return { ok: true, added: toAdd.length, existing, skipped: clean.size - toAdd.length };
}

export async function removeGhoshtiAttendee(input: { ghoshtiId: number; attendeeId: number }): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const g = await ghoshtiForWrite(input.ghoshtiId, scope);
  if (!g) return { ok: false, error: "Ghoshti not found or not editable." };
  if (g.status !== "APPROVED") return { ok: false, error: "This Ghoshti must be approved before attendance can be edited." };
  await prisma.ghoshtiAttendee.deleteMany({ where: { id: input.attendeeId, ghoshtiId: g.id } });
  revalidatePath(`/ghoshti/${g.id}`);
  return { ok: true };
}

// ─────────────────────────── Approve / Reject ───────────────────────────

export async function approveGhoshti(ghoshtiId: number): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const g = await prisma.ghoshti.findUnique({ where: { id: ghoshtiId } });
  if (!g) return { ok: false, error: "Ghoshti not found." };
  if (!canApproveGhoshti(scope, g.createdByRole, g.zone)) return { ok: false, error: "You are not allowed to approve this Ghoshti." };
  if (!canManage(scope.role) && scope.userId != null && scope.userId === g.createdById) {
    return { ok: false, error: "You cannot approve a Ghoshti you created." };
  }

  const actor = await getActor();
  await prisma.ghoshti.update({
    where: { id: g.id },
    data: { status: "APPROVED", approvedByName: actor.name, approvedByCode: actor.code, approvedAt: new Date(), rejectionNote: null },
  });
  await flagAttendedFarmers(g.id, g.date);
  revalidatePath(`/ghoshti/${g.id}`);
  revalidatePath("/ghoshti");
  return { ok: true };
}

export async function rejectGhoshti(input: { ghoshtiId: number; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const g = await prisma.ghoshti.findUnique({ where: { id: input.ghoshtiId } });
  if (!g) return { ok: false, error: "Ghoshti not found." };
  if (!canApproveGhoshti(scope, g.createdByRole, g.zone)) return { ok: false, error: "You are not allowed to reject this Ghoshti." };

  const actor = await getActor();
  await prisma.ghoshti.update({
    where: { id: g.id },
    data: { status: "REJECTED", approvedByName: actor.name, approvedByCode: actor.code, approvedAt: new Date(), rejectionNote: input.note?.trim() || null },
  });
  revalidatePath(`/ghoshti/${g.id}`);
  revalidatePath("/ghoshti");
  return { ok: true };
}

export async function deleteGhoshti(ghoshtiId: number): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const g = await prisma.ghoshti.findUnique({ where: { id: ghoshtiId }, select: { id: true, createdById: true } });
  if (!g) return { ok: false, error: "Ghoshti not found." };
  const mine = scope.userId != null && scope.userId === g.createdById;
  if (!canManage(scope.role) && !mine) return { ok: false, error: "You cannot delete this Ghoshti." };
  await prisma.ghoshti.delete({ where: { id: g.id } }); // attendees cascade
  revalidatePath("/ghoshti");
  return { ok: true };
}

// ─────────────────────────── Reads ───────────────────────────

export async function listGhoshtis(filter?: { status?: string }): Promise<GhoshtiListItem[]> {
  const scope = await getScope();
  const scopeWhere = ghoshtiScopeWhere(scope);
  if (scopeWhere === "none") return [];
  const where = scopeWhere ? { ...scopeWhere } : {};
  if (filter?.status && filter.status !== "all") (where as Record<string, unknown>).status = filter.status;

  const rows = await prisma.ghoshti.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
    include: { _count: { select: { attendees: true } }, attendees: { where: { isExisting: true }, select: { id: true } } },
  });
  return rows.map((g) => ({
    id: g.id,
    date: g.date.toISOString(),
    storeId: g.storeId,
    storeName: g.storeName ?? "—",
    zone: g.zone,
    topic: g.topic,
    status: g.status,
    attendees: g._count.attendees,
    existingCount: g.attendees.length,
    createdBy: g.createdByName ?? "—",
    createdByRole: g.createdByRole,
    createdAt: g.createdAt.toISOString(),
    canApprove: g.status === "PENDING" && canApproveGhoshti(scope, g.createdByRole, g.zone)
      && !(!canManage(scope.role) && scope.userId != null && scope.userId === g.createdById),
  }));
}

export async function getGhoshti(id: number): Promise<GhoshtiDetailVM | null> {
  const scope = await getScope();
  const scopeWhere = ghoshtiScopeWhere(scope);
  if (scopeWhere === "none") return null;
  const g = await prisma.ghoshti.findFirst({
    where: scopeWhere ? { AND: [{ id }, scopeWhere] } : { id },
    include: { attendees: { orderBy: { id: "asc" } } },
  });
  if (!g) return null;

  const mine = scope.userId != null && scope.userId === g.createdById;
  return {
    id: g.id,
    date: g.date.toISOString(),
    storeId: g.storeId,
    storeName: g.storeName ?? "—",
    zone: g.zone,
    locationNote: g.locationNote,
    topic: g.topic,
    notes: g.notes,
    status: g.status,
    createdBy: g.createdByName ?? "—",
    createdByCode: g.createdByCode,
    createdByRole: g.createdByRole,
    approvedBy: g.approvedByName,
    approvedAt: g.approvedAt?.toISOString() ?? null,
    rejectionNote: g.rejectionNote,
    createdAt: g.createdAt.toISOString(),
    attendees: g.attendees.map((a) => ({
      id: a.id, mobile: a.mobile, name: a.name, isExisting: a.isExisting,
      matchedFarmerId: a.matchedFarmerId, attended: a.attended, remarks: a.remarks,
    })),
    canApprove: g.status === "PENDING" && canApproveGhoshti(scope, g.createdByRole, g.zone) && !(!canManage(scope.role) && mine),
    canEdit: canManage(scope.role) || (mine && g.status !== "REJECTED"),
    canRecordAttendance: g.status === "APPROVED" && (canManage(scope.role) || mine),
  };
}

// ─────────────────────────── Helpers ───────────────────────────

/** Fetch a Ghoshti the current user may add/remove attendees on (creator while not rejected, or admin). */
async function ghoshtiForWrite(id: number, scope: { role: RoleKey; userId: number | null }) {
  const g = await prisma.ghoshti.findUnique({ where: { id }, select: { id: true, status: true, date: true, createdById: true } });
  if (!g) return null;
  const mine = scope.userId != null && scope.userId === g.createdById;
  if (!canManage(scope.role) && !mine) return null;
  if (!canManage(scope.role) && g.status === "REJECTED") return null;
  return g;
}

/** Set Farmer.attendedGhoshti for every matched attendee of an approved Ghoshti (the single write-back). */
async function flagAttendedFarmers(ghoshtiId: number, date: Date) {
  const ids = (await prisma.ghoshtiAttendee.findMany({
    where: { ghoshtiId, matchedFarmerId: { not: null } },
    select: { matchedFarmerId: true },
  })).map((a) => a.matchedFarmerId).filter((x): x is number => x != null);
  if (ids.length === 0) return;
  await prisma.farmer.updateMany({
    where: { id: { in: [...new Set(ids)] } },
    data: { attendedGhoshti: true, attendedGhoshtiAt: date },
  });
}
