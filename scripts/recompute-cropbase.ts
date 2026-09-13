/**
 * Phase C — recompute product rollups + the exact farmer crop base from SaleLine.
 * Run AFTER the master import and AFTER compute-segments.ts (this overrides the
 * approximate maize/potato cropTags that compute-segments derives from Sale.items).
 *   npx tsx scripts/recompute-cropbase.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { cropFromItem } from "./crop-lib";

const prisma = new PrismaClient();

async function main() {
  console.log("0) Re-tagging seed products' cropTag from name (corrected rules)…");
  const prods = await prisma.product.findMany({ where: { isSeed: true }, select: { id: true, rawName: true } });
  const byCrop = new Map<string, number[]>();
  const nullIds: number[] = [];
  for (const p of prods) {
    const c = cropFromItem(p.rawName);
    if (c) { (byCrop.get(c) ?? byCrop.set(c, []).get(c)!).push(p.id); } else nullIds.push(p.id);
  }
  for (const [crop, ids] of byCrop) for (let i = 0; i < ids.length; i += 1000) await prisma.product.updateMany({ where: { id: { in: ids.slice(i, i + 1000) } }, data: { cropTag: crop } });
  for (let i = 0; i < nullIds.length; i += 1000) await prisma.product.updateMany({ where: { id: { in: nullIds.slice(i, i + 1000) } }, data: { cropTag: null } });
  console.log(`   ${prods.length} seed products re-tagged (${byCrop.size} crops, ${nullIds.length} untagged)`);

  console.log("1) Refreshing Product rollups from SaleLine…");
  const r1 = await prisma.$executeRawUnsafe(`
    UPDATE "Product" p SET
      "totalQty" = COALESCE(s.qty, 0), "totalRevenue" = COALESCE(s.rev, 0), "lineCount" = COALESCE(s.cnt, 0),
      "avgPrice" = CASE WHEN s.qty > 0 THEN s.rev / s.qty ELSE NULL END,
      "firstSoldAt" = s.fst, "lastSoldAt" = s.lst,
      "lastPrice" = (SELECT sl2."unitPrice" FROM "SaleLine" sl2
                     WHERE sl2."productId" = p.id AND sl2.qty > 0 AND sl2."soldAt" IS NOT NULL
                     ORDER BY sl2."soldAt" DESC LIMIT 1)
    FROM (SELECT "productId" pid, SUM(qty) qty, SUM(COALESCE("basic",0)) rev, COUNT(*) cnt, MIN("soldAt") fst, MAX("soldAt") lst
          FROM "SaleLine" GROUP BY "productId") s
    WHERE p.id = s.pid`);
  console.log(`   products updated: ${Number(r1)}`);

  // NB: Farmer.cropTags / salesCropTags / visitCropTags are owned by backfill-crops.ts
  // (sales Crops column + field visits). This script no longer sets them.

  console.log("2) Refreshing exact last maize/potato purchase per REAL farmer…");
  for (const crop of ["maize", "potato"] as const) {
    const item = crop === "maize" ? "lastMaizeItem" : "lastPotatoItem";
    const at = crop === "maize" ? "lastMaizeAt" : "lastPotatoAt";
    await prisma.$executeRawUnsafe(`
      UPDATE "Farmer" f SET "${item}" = sub.item, "${at}" = sub.at
      FROM (
        SELECT DISTINCT ON (sl."farmerId") sl."farmerId" fid, sl."itemRaw" item, sl."soldAt" at
        FROM "SaleLine" sl JOIN "Product" p ON p.id = sl."productId"
        WHERE p."cropTag" = '${crop}' AND sl."farmerId" IS NOT NULL AND sl."soldAt" IS NOT NULL
        ORDER BY sl."farmerId", sl."soldAt" DESC
      ) sub
      WHERE f.id = sub.fid AND f.source = 'REAL'`);
  }

  console.log("Done (crop tags are set by backfill-crops.ts).");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
