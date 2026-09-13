/**
 * One-time: segregate existing pest tags. The old single Farmer.pestTags was catalogue/purchase
 * derived, so it becomes the SALES side (salesPestTags). visitPestTags starts empty; pestTags stays
 * the union (unchanged here). Idempotent.
 *   DATABASE_URL=... npx tsx scripts/migrate-pest-segregation.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const n = await prisma.$executeRawUnsafe(`
    UPDATE "Farmer"
    SET "salesPestTags" = "pestTags"
    WHERE source = 'REAL'
      AND array_length("pestTags", 1) > 0
      AND COALESCE(array_length("salesPestTags", 1), 0) = 0`);
  const withSales = await prisma.farmer.count({ where: { source: "REAL", salesPestTags: { isEmpty: false } } });
  console.log(`salesPestTags seeded from pestTags for ${Number(n).toLocaleString()} farmers · now ${withSales.toLocaleString()} REAL farmers have a sales pest tag`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
