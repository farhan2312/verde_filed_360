/**
 * Rebuild every REAL farmer's CROP tags from the sales data, "AE-first":
 *
 *   per sale line →  SaleLine.cropTag   (the master file's Crops column, col AE)  if present,
 *                    else the line's Product.targetCrops   (inventory-master catalogue fallback).
 *
 *   Farmer.salesCropTags = distinct union of that across the farmer's purchases  (REPLACES old values).
 *   Farmer.cropTags      = union(salesCropTags, visitCropTags).
 *
 * Pest tags (Farmer.pestTags) are left untouched — the sales file has no pest column, so pests stay
 * catalogue-derived. Both crop cleaners canonicalise to the same lowercase keys (cleanCrop for AE,
 * cleanTargetCrops for the catalogue), so the union never double-counts a crop.
 *
 * Depends on SaleLine.cropTag already holding the AE crop (scripts/backfill-saleline-crop.ts). If that
 * has never been run, every line falls back to the catalogue (i.e. the old behaviour) — run it first.
 *
 *   npx tsx scripts/retag-farmer-crops.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Rebuilding farmer crop tags — AE crop first, catalogue fallback…\n");

  // Single pass over EVERY real farmer (LEFT JOIN): those with sale-derived crops get them,
  // those without get an empty sales set. salesCropTags is REPLACED; cropTags = sales ∪ visit.
  const updated: number = await prisma.$executeRawUnsafe(`
    UPDATE "Farmer" f
    SET "salesCropTags" = COALESCE(s.crops, '{}'::text[]),
        "cropTags"      = ARRAY(
          SELECT DISTINCT e FROM unnest(COALESCE(s.crops, '{}'::text[]) || f."visitCropTags") e
          WHERE e IS NOT NULL AND btrim(e) <> '' ORDER BY e)
    FROM (SELECT id FROM "Farmer" WHERE source = 'REAL') rf
    LEFT JOIN (
      SELECT fid, array_agg(DISTINCT crop) AS crops
      FROM (
        -- (a) Sale lines: AE crop (Crops col) wins; else the line's catalogue crop.
        SELECT sl."farmerId" AS fid,
               unnest(
                 CASE
                   WHEN sl."cropTag" IS NOT NULL AND btrim(sl."cropTag") <> ''
                     THEN ARRAY[sl."cropTag"]                       -- AE crop wins
                   ELSE COALESCE(p."targetCrops", '{}'::text[])     -- else catalogue fallback
                 END
               ) AS crop
        FROM "SaleLine" sl
        JOIN "Product" p ON p.id = sl."productId"
        WHERE sl."farmerId" IS NOT NULL
        UNION ALL
        -- (b) Bills with NO sale lines (older app-uploaded): no AE available → catalogue crops
        --     from the bill's item codes, so these farmers don't lose their tags.
        SELECT s2."farmerId" AS fid, unnest(p."targetCrops") AS crop
        FROM "Sale" s2
        JOIN "Product" p ON p."itemCode" = ANY(s2."itemCodes")
        WHERE s2.source = 'REAL' AND s2."farmerId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "SaleLine" sl WHERE sl."orderNo" = s2.invoice)
      ) per_line
      WHERE crop IS NOT NULL AND btrim(crop) <> ''
      GROUP BY fid
    ) s ON s.fid = rf.id
    WHERE f.id = rf.id
  `);
  console.log(`  ${updated.toLocaleString()} REAL farmers rebuilt (AE-first, catalogue fallback)\n`);

  // How often did AE win vs the catalogue fallback?
  const [split] = await prisma.$queryRawUnsafe<{ ae: bigint; fallback: bigint }[]>(`
    SELECT COUNT(*) FILTER (WHERE sl."cropTag" IS NOT NULL AND btrim(sl."cropTag") <> '') ae,
           COUNT(*) FILTER (WHERE sl."cropTag" IS NULL OR btrim(sl."cropTag") = '')        fallback
    FROM "SaleLine" sl WHERE sl."farmerId" IS NOT NULL`);
  console.log(`Sale lines: ${Number(split.ae).toLocaleString()} tagged from AE (Crops col), ${Number(split.fallback).toLocaleString()} fell back to the catalogue`);

  const dist = await prisma.$queryRawUnsafe<{ crop: string; farmers: bigint }[]>(`
    SELECT crop, COUNT(*) farmers FROM (SELECT unnest("salesCropTags") crop FROM "Farmer" WHERE source='REAL') t
    GROUP BY 1 ORDER BY 2 DESC LIMIT 25`);
  console.log("\nTop sales-crop tags after rebuild:");
  for (const d of dist) console.log(`  ${(d.crop ?? "").padEnd(16)} ${Number(d.farmers).toLocaleString()}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)); });
