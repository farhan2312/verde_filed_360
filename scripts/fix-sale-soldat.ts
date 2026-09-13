/**
 * One-off repair: backfill Sale.soldAt for REAL bills whose date string parsed but soldAt is NULL
 * (import-newsales previously rejected 2-digit years like "01-Apr-26"). Derives soldAt from the
 * stored "date" string (DD-Mon-YY). Safe/idempotent.
 *   DATABASE_URL=... npx tsx scripts/fix-sale-soldat.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const before = await prisma.sale.count({ where: { source: "REAL", soldAt: null } });
  console.log(`REAL sales with NULL soldAt before: ${before.toLocaleString()}`);
  const fixed = await prisma.$executeRawUnsafe(
    `UPDATE "Sale" SET "soldAt" = to_timestamp("date", 'DD-Mon-YY')
     WHERE source='REAL' AND "soldAt" IS NULL AND "date" ~ '^[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4}$'`,
  );
  const after = await prisma.sale.count({ where: { source: "REAL", soldAt: null } });
  console.log(`Fixed ${Number(fixed).toLocaleString()} · remaining NULL soldAt: ${after.toLocaleString()}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
