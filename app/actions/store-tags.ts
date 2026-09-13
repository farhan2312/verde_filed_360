"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getScope, type Scope } from "@/lib/scope";

export interface StoreTagVM { id: number; name: string; color: string; sortOrder: number }

const PALETTE = ["#678722", "#1565C0", "#E65100", "#6A1B9A", "#00838F", "#C62828", "#EDA942"];
const SEED: { name: string; color: string }[] = [
  { name: "Priority", color: "#C62828" },
  { name: "High Potential", color: "#678722" },
  { name: "Border", color: "#E65100" },
  { name: "Urban", color: "#1565C0" },
  { name: "New", color: "#6A1B9A" },
];

async function sysadmin(): Promise<boolean> {
  const s = await getSession();
  return !!s?.isAdmin;
}

/** Full tag catalog (any signed-in user — needed for filters + display). Seeds a starter set once. */
export async function listStoreTags(): Promise<StoreTagVM[]> {
  try {
    if ((await prisma.storeTag.count()) === 0) {
      await prisma.storeTag.createMany({
        data: SEED.map((t, i) => ({ name: t.name, color: t.color, sortOrder: i })),
        skipDuplicates: true,
      });
    }
  } catch { /* ignore seed race */ }
  const rows = await prisma.storeTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return rows.map((t) => ({ id: t.id, name: t.name, color: t.color, sortOrder: t.sortOrder }));
}

/* ── Catalog CRUD — sysadmin only (Settings) ── */
export async function createStoreTag(name: string, color?: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await sysadmin())) return { ok: false, error: "System admins only." };
  const n = (name ?? "").trim();
  if (!n) return { ok: false, error: "Enter a tag name." };
  try {
    const count = await prisma.storeTag.count();
    await prisma.storeTag.create({ data: { name: n, color: color?.trim() || PALETTE[count % PALETTE.length], sortOrder: count } });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error && /Unique/.test(e.message) ? "A tag with that name already exists." : "Create failed." };
  }
}

export async function updateStoreTag(id: number, patch: { name?: string; color?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await sysadmin())) return { ok: false, error: "System admins only." };
  const data: { name?: string; color?: string } = {};
  if (patch.name != null) { const n = patch.name.trim(); if (!n) return { ok: false, error: "Name can't be empty." }; data.name = n; }
  if (patch.color != null && patch.color.trim()) data.color = patch.color.trim();
  try {
    await prisma.storeTag.update({ where: { id }, data });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error && /Unique/.test(e.message) ? "That name is taken." : "Update failed." };
  }
}

/** Delete a tag from the catalog AND pull it off every store that carried it. */
export async function deleteStoreTag(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!(await sysadmin())) return { ok: false, error: "System admins only." };
  try {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`UPDATE "Store" SET "tagIds" = array_remove("tagIds", $1) WHERE $1 = ANY("tagIds")`, id),
      prisma.storeTag.delete({ where: { id } }),
    ]);
    revalidatePath("/settings");
    revalidatePath("/map");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

/** Catalog + a store's current tags + whether the viewer may edit them (for the Map tag editor). */
export async function getStoreTagState(storeId: number): Promise<{ tags: StoreTagVM[]; assigned: number[]; canEdit: boolean }> {
  const scope = await getScope();
  const [catalog, store] = await Promise.all([
    listStoreTags(),
    prisma.store.findUnique({ where: { id: storeId }, select: { tagIds: true } }),
  ]);
  const canEdit =
    scope.role === "central" || scope.role === "sysadmin" ||
    (scope.role === "regional" && (scope.managedStoreIds ?? []).includes(storeId));
  return { tags: catalog, assigned: store?.tagIds ?? [], canEdit };
}

/** The subset of `ids` the viewer may tag: all of them for central/sysadmin, managed-only for an RM. */
function editableStoreIds(scope: Scope, ids: number[]): number[] {
  if (scope.role === "central" || scope.role === "sysadmin") return ids;
  if (scope.role === "regional") { const m = new Set(scope.managedStoreIds ?? []); return ids.filter((id) => m.has(id)); }
  return [];
}

/**
 * Bulk tag state for a multi-store selection on the Map: the catalog, how many of the selected stores
 * carry each tag (for the tri-state chips), the selection size, and how many the viewer may edit.
 */
export async function getStoreTagsBulkState(storeIds: number[]): Promise<{ tags: StoreTagVM[]; counts: Record<number, number>; total: number; editable: number; canEdit: boolean }> {
  const scope = await getScope();
  const ids = [...new Set(storeIds)].filter((n) => Number.isFinite(n));
  const [catalog, stores] = await Promise.all([
    listStoreTags(),
    prisma.store.findMany({ where: { id: { in: ids.length ? ids : [-1] } }, select: { id: true, tagIds: true } }),
  ]);
  const counts: Record<number, number> = {};
  for (const s of stores) for (const t of s.tagIds) counts[t] = (counts[t] ?? 0) + 1;
  const editable = editableStoreIds(scope, ids).length;
  return { tags: catalog, counts, total: stores.length, editable, canEdit: editable > 0 };
}

/** Add or remove ONE tag across the editable subset of the selected stores (idempotent, no duplicates). */
export async function applyStoreTagBulk(storeIds: number[], tagId: number, on: boolean): Promise<{ ok: boolean; applied: number; error?: string }> {
  const scope = await getScope();
  const ids = editableStoreIds(scope, [...new Set(storeIds)].filter((n) => Number.isFinite(n)));
  if (!ids.length) return { ok: false, applied: 0, error: "You can only tag stores you manage." };
  const exists = await prisma.storeTag.findUnique({ where: { id: tagId }, select: { id: true } });
  if (!exists) return { ok: false, applied: 0, error: "That tag no longer exists." };
  try {
    if (on) await prisma.$executeRawUnsafe(`UPDATE "Store" SET "tagIds" = array_append("tagIds", $1) WHERE id = ANY($2::int[]) AND NOT ($1 = ANY("tagIds"))`, tagId, ids);
    else await prisma.$executeRawUnsafe(`UPDATE "Store" SET "tagIds" = array_remove("tagIds", $1) WHERE id = ANY($2::int[])`, tagId, ids);
    revalidatePath("/map");
    return { ok: true, applied: ids.length };
  } catch (e) {
    return { ok: false, applied: 0, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/* ── Assignment — RM (own stores) / central / sysadmin ── */
export async function setStoreTags(storeId: number, tagIds: number[]): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  const canAll = scope.role === "central" || scope.role === "sysadmin";
  const canRm = scope.role === "regional" && (scope.managedStoreIds ?? []).includes(storeId);
  if (!canAll && !canRm) return { ok: false, error: "You can only tag stores you manage." };
  // Keep only ids that still exist in the catalog.
  const valid = new Set((await prisma.storeTag.findMany({ select: { id: true } })).map((t) => t.id));
  const clean = [...new Set(tagIds.filter((n) => valid.has(n)))];
  try {
    await prisma.store.update({ where: { id: storeId }, data: { tagIds: clean } });
    revalidatePath("/map");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
