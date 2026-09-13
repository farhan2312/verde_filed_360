/**
 * Rebuild Farmer.salesCropTags / cropTags from the sheet's Crops column ONLY (SaleLine.cropTag,
 * set by backfill-saleline-crop.ts from column AE). NO catalogue fallback, NO name inference —
 * per client instruction "only use the tagging given in the sheet, nothing else". Blank/0/junk
 * AE cells were already dropped to NULL by cleanCrop, so they simply contribute no tag.
 *
 *   npx tsx scripts/retag-farmer-crops-ae-only.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Rebuilding farmer crop tags — SHEET (AE) crop only, no fallback…");
  const updated: number = await prisma.$executeRawUnsafe(`
    UPDATE "Farmer" f
    SET "salesCropTags" = COALESCE(s.crops, '{}'::text[]),
        "cropTags" = ARRAY(
          SELECT DISTINCT e FROM unnest(COALESCE(s.crops, '{}'::text[]) || f."visitCropTags") e
          WHERE e IS NOT NULL AND btrim(e) <> '' ORDER BY e)
    FROM (SELECT id FROM "Farmer" WHERE source = 'REAL') rf
    LEFT JOIN (
      SELECT sl."farmerId" AS fid, array_agg(DISTINCT sl."cropTag") AS crops
      FROM "SaleLine" sl
      WHERE sl."farmerId" IS NOT NULL AND sl."cropTag" IS NOT NULL AND btrim(sl."cropTag") <> ''
      GROUP BY sl."farmerId"
    ) s ON s.fid = rf.id
    WHERE f.id = rf.id`);
  console.log(`  ${updated.toLocaleString()} REAL farmers rebuilt (sheet-AE crop only)`);

  const dist = await prisma.$queryRawUnsafe<{ crop: string; farmers: bigint }[]>(`
    SELECT crop, COUNT(*) farmers FROM (SELECT unnest("salesCropTags") crop FROM "Farmer" WHERE source='REAL') t
    GROUP BY 1 ORDER BY 2 DESC LIMIT 25`);
  console.log("\nTop sales-crop tags (from sheet):");
  for (const d of dist) console.log(`  ${(d.crop ?? "").padEnd(16)} ${Number(d.farmers).toLocaleString()}`);
  const tagged = await prisma.farmer.count({ where: { source: "REAL", salesCropTags: { isEmpty: false } } });
  console.log(`\nFarmers with >=1 sheet crop: ${tagged.toLocaleString()}`);
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)); });
