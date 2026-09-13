"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

export interface ProductVM {
  id: number;
  rawName: string;
  name: string;
  mainCategory: string | null;
  subCategory: string | null;
  uom: string | null;
  taxRate: number | null;
  cropTag: string | null;
  isSeed: boolean;
  lastPrice: number | null;
  avgPrice: number | null;
  totalQty: number;
  totalRevenue: number;
  lineCount: number;
  firstSoldAt: string | null;
  lastSoldAt: string | null;
  active: boolean;
  // ── Inventory master columns ──
  itemCode: string | null;
  brand: string | null;
  packSize: string | null;
  hsnCode: string | null;
  technicalName: string | null;
  activeIngredients: string | null;
  targetCrops: string[];
  targetPests: string[];
  targetCropsRaw: string | null;
  targetPestsRaw: string | null;
  alternativeProducts: string | null;
  mappingConfidence: string | null;
  qualityFlag: string | null;
  statusFlag: string | null;
  originalItemName: string | null;
  originalBrand: string | null;
  originalDescription: string | null;
}

export interface ProductFacets {
  mainCategories: string[];
  subCategories: string[];
  cropTags: string[];
  uoms: string[];
  targetCrops: string[]; // from the master's Target Crops
  targetPests: string[]; // from the master's Target Pests / Diseases / Weeds
}

export interface ProductFilters {
  q?: string;
  mainCategory?: string;
  subCategory?: string;
  cropTag?: string;
  targetCrop?: string; // Product.targetCrops has
  targetPest?: string; // Product.targetPests has
  uom?: string;
  seedOnly?: boolean;
  includeInactive?: boolean;
  sort?: "revenue" | "qty" | "name" | "recent";
  page?: number;
  pageSize?: number;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const PRODUCT_SELECT = {
  id: true, rawName: true, name: true, mainCategory: true, subCategory: true, uom: true,
  taxRate: true, cropTag: true, isSeed: true, lastPrice: true, avgPrice: true,
  totalQty: true, totalRevenue: true, lineCount: true, firstSoldAt: true, lastSoldAt: true, active: true,
  itemCode: true, brand: true, packSize: true, hsnCode: true, technicalName: true, activeIngredients: true,
  targetCrops: true, targetPests: true, targetCropsRaw: true, targetPestsRaw: true, alternativeProducts: true,
  mappingConfidence: true, qualityFlag: true, statusFlag: true, originalItemName: true, originalBrand: true, originalDescription: true,
} satisfies Prisma.ProductSelect;

const toVM = (p: Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>): ProductVM =>
  ({ ...p, firstSoldAt: iso(p.firstSoldAt), lastSoldAt: iso(p.lastSoldAt) });

function buildWhere(f: ProductFilters): Prisma.ProductWhereInput {
  const w: Prisma.ProductWhereInput = {};
  if (!f.includeInactive) w.active = true;
  w.mergedIntoId = null; // hide products folded into another
  if (f.mainCategory) w.mainCategory = f.mainCategory;
  if (f.subCategory) w.subCategory = f.subCategory;
  if (f.cropTag) w.cropTag = f.cropTag;
  if (f.targetCrop) w.targetCrops = { has: f.targetCrop };
  if (f.targetPest) w.targetPests = { has: f.targetPest };
  if (f.uom) w.uom = f.uom;
  if (f.seedOnly) w.isSeed = true;
  if (f.q?.trim()) {
    const q = f.q.trim();
    w.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { rawName: { contains: q, mode: "insensitive" } },
      { itemCode: { contains: q, mode: "insensitive" } },
      { technicalName: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
    ];
  }
  return w;
}

export async function listProducts(f: ProductFilters = {}): Promise<{ rows: ProductVM[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, f.pageSize ?? 50);
  const where = buildWhere(f);
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    f.sort === "qty" ? { totalQty: "desc" }
      : f.sort === "name" ? { name: "asc" }
        : f.sort === "recent" ? { lastSoldAt: { sort: "desc", nulls: "last" } }
          : { totalRevenue: "desc" };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: PRODUCT_SELECT }),
    prisma.product.count({ where }),
  ]);
  return { rows: rows.map(toVM), total, page, pageSize };
}

export async function getProductFacets(): Promise<ProductFacets> {
  const [mains, subs, crops, uoms, tCrops, tPests] = await Promise.all([
    prisma.product.findMany({ where: { mainCategory: { not: null }, active: true }, distinct: ["mainCategory"], select: { mainCategory: true }, orderBy: { mainCategory: "asc" } }),
    prisma.product.findMany({ where: { subCategory: { not: null }, active: true }, distinct: ["subCategory"], select: { subCategory: true }, orderBy: { subCategory: "asc" } }),
    prisma.product.findMany({ where: { cropTag: { not: null }, active: true }, distinct: ["cropTag"], select: { cropTag: true }, orderBy: { cropTag: "asc" } }),
    prisma.product.findMany({ where: { uom: { not: null }, active: true }, distinct: ["uom"], select: { uom: true }, orderBy: { uom: "asc" } }),
    prisma.$queryRaw<{ t: string }[]>`SELECT DISTINCT unnest("targetCrops") t FROM "Product" WHERE active = true ORDER BY 1`,
    prisma.$queryRaw<{ t: string }[]>`SELECT DISTINCT unnest("targetPests") t FROM "Product" WHERE active = true ORDER BY 1`,
  ]);
  return {
    mainCategories: mains.map((m) => m.mainCategory!).filter(Boolean),
    subCategories: subs.map((s) => s.subCategory!).filter(Boolean),
    cropTags: crops.map((c) => c.cropTag!).filter(Boolean),
    uoms: uoms.map((u) => u.uom!).filter(Boolean),
    targetCrops: tCrops.map((c) => c.t).filter(Boolean),
    targetPests: tPests.map((p) => p.t).filter(Boolean),
  };
}

export interface ProductPatch {
  name?: string; mainCategory?: string | null; subCategory?: string | null;
  uom?: string | null; taxRate?: number | null; cropTag?: string | null;
}

export async function updateProduct(id: number, patch: ProductPatch): Promise<{ ok: boolean; error?: string }> {
  try {
    const data: Prisma.ProductUpdateInput = {};
    if (patch.name !== undefined) { const n = patch.name.trim(); if (!n) return { ok: false, error: "Name can't be empty." }; data.name = n; }
    if (patch.mainCategory !== undefined) data.mainCategory = patch.mainCategory || null;
    if (patch.subCategory !== undefined) data.subCategory = patch.subCategory || null;
    if (patch.uom !== undefined) data.uom = patch.uom || null;
    if (patch.taxRate !== undefined) data.taxRate = patch.taxRate;
    if (patch.cropTag !== undefined) data.cropTag = patch.cropTag || null;
    await prisma.product.update({ where: { id }, data });
    revalidatePath("/products");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Update failed" }; }
}

export async function toggleProductActive(id: number, active: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.product.update({ where: { id }, data: { active } });
    revalidatePath("/products");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed" }; }
}

/** Fold `sourceId` into `targetId`: re-point its sale lines, recompute the target, deactivate the source. */
export async function mergeProduct(sourceId: number, targetId: number): Promise<{ ok: boolean; error?: string }> {
  if (sourceId === targetId) return { ok: false, error: "Pick two different products." };
  try {
    // Atomic: re-point lines, recompute the target, hide the source — all-or-nothing
    // so a mid-op failure can't leave a double-counted phantom product.
    await prisma.$transaction(async (tx) => {
      await tx.saleLine.updateMany({ where: { productId: sourceId }, data: { productId: targetId } });
      const agg = await tx.saleLine.aggregate({
        where: { productId: targetId }, _sum: { qty: true, basic: true }, _count: { _all: true },
        _min: { soldAt: true }, _max: { soldAt: true },
      });
      const last = await tx.saleLine.findFirst({ where: { productId: targetId, soldAt: { not: null }, qty: { gt: 0 } }, orderBy: { soldAt: "desc" }, select: { unitPrice: true } });
      const qty = agg._sum.qty ?? 0;
      const rev = Math.round(agg._sum.basic ?? 0); // base/pre-tax revenue
      await tx.product.update({
        where: { id: targetId },
        data: { totalQty: qty, totalRevenue: rev, lineCount: agg._count._all, avgPrice: qty > 0 ? rev / qty : null, lastPrice: last?.unitPrice ?? null, firstSoldAt: agg._min.soldAt ?? null, lastSoldAt: agg._max.soldAt ?? null },
      });
      await tx.product.update({
        where: { id: sourceId },
        data: { active: false, mergedIntoId: targetId, totalQty: 0, totalRevenue: 0, lineCount: 0, avgPrice: null, lastPrice: null },
      });
    });
    revalidatePath("/products");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Merge failed" }; }
}

/** Lightweight product options for the merge picker. */
export async function searchProductOptions(q: string, excludeId: number): Promise<{ id: number; name: string; category: string | null }[]> {
  const rows = await prisma.product.findMany({
    where: { active: true, mergedIntoId: null, id: { not: excludeId }, OR: [{ name: { contains: q, mode: "insensitive" } }, { rawName: { contains: q, mode: "insensitive" } }] },
    select: { id: true, name: true, mainCategory: true }, take: 20, orderBy: { totalRevenue: "desc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.mainCategory }));
}
