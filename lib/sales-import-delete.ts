import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Delete everything a sales import created: its Sale rows, the new-customer Farmers it introduced
 * (only ones still fully orphaned), and the SalesImport record + its audit entry.
 *
 * Row identification:
 *   • Imports run after this feature stamp `importId` on their Sale + Farmer rows → deleted exactly.
 *   • Legacy imports (no importId) fall back to the import's soldAt range, scoped to `importId: null`
 *     so a legacy range-delete can never swallow a newer, tagged import's rows in an overlapping range.
 *
 * Best-effort per step; returns what was removed. Callers must gate on sysadmin.
 */
export interface ImportDeletionScope { mode: "tagged" | "range" | "none"; saleWhere: Prisma.SaleWhereInput | null; farmerWhere: Prisma.FarmerWhereInput | null }
export interface ImportDeletionResult { sales: number; farmers: number; mode: ImportDeletionScope["mode"] }

const DAY = 86_400_000;
function parseDisplay(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s); // display strings are en-GB "1 Aug 2026" — Date parses these
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Work out which Sale/Farmer rows belong to this import, without deleting anything. */
export async function resolveImportScope(imp: { id: number; rangeStart: string | null; rangeEnd: string | null; createdAt: Date }): Promise<ImportDeletionScope> {
  const tagged = await prisma.sale.count({ where: { importId: imp.id } });
  if (tagged > 0) {
    return { mode: "tagged", saleWhere: { importId: imp.id }, farmerWhere: { importId: imp.id } };
  }
  // Legacy fallback: this import's date range, untagged rows only.
  const start = parseDisplay(imp.rangeStart);
  const end = parseDisplay(imp.rangeEnd);
  if (start && end) {
    const endExcl = new Date(end.getTime() + DAY); // rangeEnd is an inclusive display date
    const day0 = new Date(imp.createdAt); day0.setUTCHours(0, 0, 0, 0);
    const day1 = new Date(day0.getTime() + DAY);
    return {
      mode: "range",
      saleWhere: { source: "REAL", importId: null, soldAt: { gte: start, lt: endExcl } },
      // Legacy new customers can't be tagged; approximate by FARM-C rows created on the import's day.
      farmerWhere: { importId: null, code: { startsWith: "FARM-C-" }, createdAt: { gte: day0, lt: day1 } },
    };
  }
  return { mode: "none", saleWhere: null, farmerWhere: null };
}

export async function previewImportDeletion(imp: { id: number; rangeStart: string | null; rangeEnd: string | null; createdAt: Date }): Promise<ImportDeletionResult> {
  const scope = await resolveImportScope(imp);
  const sales = scope.saleWhere ? await prisma.sale.count({ where: scope.saleWhere }) : 0;
  const farmers = scope.farmerWhere ? await countOrphanedFarmers(scope.farmerWhere) : 0;
  return { sales, farmers, mode: scope.mode };
}

/** Farmers matching `where` that have NO other links (so removing them is safe). */
async function orphanedFarmerIds(where: Prisma.FarmerWhereInput): Promise<number[]> {
  const ids = (await prisma.farmer.findMany({ where, select: { id: true } })).map((f) => f.id);
  if (!ids.length) return [];
  const linked = new Set<number>();
  for (let i = 0; i < ids.length; i += 10_000) {
    const slice = ids.slice(i, i + 10_000);
    const inSlice = { farmerId: { in: slice } };
    const [sales, visits, members, actions, lines] = await Promise.all([
      prisma.sale.findMany({ where: inSlice, distinct: ["farmerId"], select: { farmerId: true } }),
      prisma.visit.findMany({ where: inSlice, distinct: ["farmerId"], select: { farmerId: true } }),
      prisma.campaignMember.findMany({ where: inSlice, distinct: ["farmerId"], select: { farmerId: true } }),
      prisma.action.findMany({ where: inSlice, distinct: ["farmerId"], select: { farmerId: true } }),
      prisma.saleLine.findMany({ where: inSlice, distinct: ["farmerId"], select: { farmerId: true } }),
    ]);
    for (const r of [...sales, ...visits, ...members, ...actions, ...lines]) if (r.farmerId != null) linked.add(r.farmerId);
  }
  return ids.filter((id) => !linked.has(id));
}
async function countOrphanedFarmers(where: Prisma.FarmerWhereInput): Promise<number> {
  return (await orphanedFarmerIds(where)).length;
}

export async function deleteImportData(impId: number): Promise<ImportDeletionResult & { ok: boolean; error?: string }> {
  const imp = await prisma.salesImport.findUnique({ where: { id: impId }, select: { id: true, filename: true, rangeStart: true, rangeEnd: true, createdAt: true } });
  if (!imp) return { ok: false, error: "Import not found.", sales: 0, farmers: 0, mode: "none" };

  const scope = await resolveImportScope(imp);

  // 1. Sales (SaleLine.saleId is now indexed, so the FK SetNull on delete is cheap).
  let sales = 0;
  if (scope.saleWhere) sales = (await prisma.sale.deleteMany({ where: scope.saleWhere })).count;

  // 2. Orphaned new-customer farmers (recomputed AFTER the sales are gone).
  let farmers = 0;
  if (scope.farmerWhere) {
    const orphans = await orphanedFarmerIds(scope.farmerWhere);
    for (let i = 0; i < orphans.length; i += 5_000) {
      farmers += (await prisma.farmer.deleteMany({ where: { id: { in: orphans.slice(i, i + 5_000) } } })).count;
    }
  }

  // 3. The import record + its own IMPORT audit entry.
  await prisma.salesImport.delete({ where: { id: imp.id } }).catch(() => {});
  if (imp.filename) await prisma.auditLog.deleteMany({ where: { action: "IMPORT", detail: { contains: imp.filename } } }).catch(() => {});

  return { ok: true, sales, farmers, mode: scope.mode };
}
