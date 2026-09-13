/**
 * Retroactively apply the item-code → Target Crop/Pest classification to every farmer,
 * derived from what they have ALREADY purchased. The existing SaleLine → Product links are
 * the item mapping; each product now carries targetPests/targetCrops from the inventory master.
 *
 *   pestTags  ← union of the target pests of every product the farmer bought
 *   cropTags / salesCropTags ← existing tags UNION the products' target crops (enrich, never remove)
 *
 * Idempotent-ish: pests are recomputed from scratch; crops are unioned (additive).
 *   npx tsx scripts/backfill-farmer-pests.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("1) salesPestTags ← target pests of every purchased product; pestTags = sales ∪ visit…");
  const p1 = await prisma.$executeRawUnsafe(`
    UPDATE "Farmer" f
    SET "salesPestTags" = t.pests,
        "pestTags" = ARRAY(SELECT DISTINCT e FROM unnest(t.pests || f."visitPestTags") e
                           WHERE e IS NOT NULL AND btrim(e) <> '' ORDER BY e)
    FROM (
      SELECT sl."farmerId" fid, array_agg(DISTINCT pest ORDER BY pest) pests
      FROM "SaleLine" sl
      JOIN "Product" p ON p.id = sl."productId"
      CROSS JOIN LATERAL unnest(p."targetPests") pest
      WHERE sl."farmerId" IS NOT NULL
      GROUP BY sl."farmerId"
    ) t
    WHERE f.id = t.fid`);
  console.log(`   farmers updated: ${p1}`);

  console.log("2) cropTags / salesCropTags ← existing ∪ purchased products' target crops…");
  const p2 = await prisma.$executeRawUnsafe(`
    UPDATE "Farmer" f SET
      "cropTags"      = ARRAY(SELECT DISTINCT e FROM unnest(f."cropTags"      || t.crops) e ORDER BY e),
      "salesCropTags" = ARRAY(SELECT DISTINCT e FROM unnest(f."salesCropTags" || t.crops) e ORDER BY e)
    FROM (
      SELECT sl."farmerId" fid, array_agg(DISTINCT crop ORDER BY crop) crops
      FROM "SaleLine" sl
      JOIN "Product" p ON p.id = sl."productId"
      CROSS JOIN LATERAL unnest(p."targetCrops") crop
      WHERE sl."farmerId" IS NOT NULL
      GROUP BY sl."farmerId"
    ) t
    WHERE f.id = t.fid`);
  console.log(`   farmers updated: ${p2}`);

  const [withPests, distinctPests] = await Promise.all([
    prisma.farmer.count({ where: { pestTags: { isEmpty: false } } }),
    prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(DISTINCT p) n FROM "Farmer", unnest("pestTags") p`),
  ]);
  console.log(`\nFarmers with a pest tag: ${withPests.toLocaleString()} · distinct pests: ${Number(distinctPests[0].n)}`);

  const top = await prisma.$queryRawUnsafe<{ pest: string; n: bigint }[]>(
    `SELECT unnest("pestTags") pest, COUNT(*) n FROM "Farmer" GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  console.log("Top pests:");
  for (const r of top) console.log(`  ${r.pest.padEnd(24)} ${Number(r.n).toLocaleString()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
