"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cleanCrop } from "@/lib/crop-clean";
import { STATS_TAG } from "@/lib/stats";

/**
 * Store-region crops: the crops generally grown around each store. Farmers attached to a store pick
 * them up live (no copy on the Farmer row), for the cluster builder's "Store region" source and the
 * Farmer 360 crop chips. Editing is System admin only.
 */

export interface StoreCropRow { id: number; code: string; name: string; zone: string | null; crops: string[]; farmers: number }

async function sysadmin(): Promise<boolean> {
  const s = await getSession();
  return !!s?.isAdmin;
}

/** Canonical crop keys (same cleaner as sales + visits), de-duplicated and sorted. */
function clean(crops: string[]): string[] {
  // Keys like "bottle_gourd" go back through the cleaner as words so they map to themselves.
  return [...new Set(crops.map((c) => cleanCrop(c.replace(/_/g, " "))).filter((c): c is string => !!c))].sort();
}

export async function listStoreCrops(): Promise<StoreCropRow[] | null> {
  if (!(await sysadmin())) return null;
  const [stores, counts] = await Promise.all([
    prisma.store.findMany({ where: { source: "REAL" }, orderBy: [{ zone: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, zone: true, cropTags: true } }),
    prisma.farmer.groupBy({ by: ["storeId"], where: { source: "REAL", storeId: { not: null } }, _count: { _all: true } }),
  ]);
  const n = new Map(counts.map((c) => [c.storeId!, c._count._all]));
  return stores.map((s) => ({ id: s.id, code: s.code, name: s.name, zone: s.zone, crops: s.cropTags, farmers: n.get(s.id) ?? 0 }));
}

/**
 * Change crops on one or many stores. mode: "add" = add these crops, "remove" = take them off,
 * "replace" = set exactly these crops. Returns the stores' new crop lists.
 */
export async function updateStoreCrops(
  storeIds: number[],
  crops: string[],
  mode: "add" | "remove" | "replace",
): Promise<{ ok: boolean; error?: string; updated?: { id: number; crops: string[] }[] }> {
  if (!(await sysadmin())) return { ok: false, error: "System admins only." };
  const ids = [...new Set(storeIds)].filter((x) => Number.isInteger(x));
  if (!ids.length) return { ok: false, error: "Pick at least one store." };
  const want = clean(crops);
  if (!want.length && mode !== "replace") return { ok: false, error: "Pick at least one crop." };
  if (crops.length && !want.length) return { ok: false, error: "That isn't a recognised crop name." };
  try {
    const stores = await prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, cropTags: true } });
    const updated = stores.map((s) => {
      const cur = new Set(s.cropTags);
      const next = mode === "replace" ? want : mode === "add" ? clean([...cur, ...want]) : s.cropTags.filter((c) => !want.includes(c));
      return { id: s.id, crops: next };
    });
    await prisma.$transaction(updated.map((u) => prisma.store.update({ where: { id: u.id }, data: { cropTags: u.crops } })));
    revalidatePath("/settings");
    revalidateTag(STATS_TAG);
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
