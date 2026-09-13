/**
 * Backfill Visit.storeId for already-logged visits that never captured a store, using the store of
 * the officer who filled the form. Matches the actual filler first (recordedByCode = employee code,
 * then recordedBy = user name), so the Visit Repository store + officer-scoped visibility work
 * retroactively. Only touches visits with a NULL storeId. Idempotent.
 *   DATABASE_URL=... npx tsx scripts/backfill-visit-store.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const before = await prisma.visit.count({ where: { storeId: null } });
  console.log(`Visits without a store before: ${before.toLocaleString()}`);

  // 1) By employee code of the actual form-filler (most reliable).
  const byCode = await prisma.$executeRawUnsafe(`
    UPDATE "Visit" v SET "storeId" = u."storeId"
    FROM "User" u
    WHERE v."storeId" IS NULL AND v."recordedByCode" IS NOT NULL AND btrim(v."recordedByCode") <> ''
      AND u."employeeCode" = v."recordedByCode" AND u."storeId" IS NOT NULL`);
  console.log(`  matched by employee code: ${Number(byCode).toLocaleString()}`);

  // 2) Fallback: by the recorded user's name.
  const byName = await prisma.$executeRawUnsafe(`
    UPDATE "Visit" v SET "storeId" = u."storeId"
    FROM "User" u
    WHERE v."storeId" IS NULL AND v."recordedBy" IS NOT NULL AND btrim(v."recordedBy") <> ''
      AND lower(btrim(u.name)) = lower(btrim(v."recordedBy")) AND u."storeId" IS NOT NULL`);
  console.log(`  matched by recorded-by name: ${Number(byName).toLocaleString()}`);

  const after = await prisma.visit.count({ where: { storeId: null } });
  console.log(`Visits still without a store: ${after.toLocaleString()} (filler is not a store-mapped user)`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
