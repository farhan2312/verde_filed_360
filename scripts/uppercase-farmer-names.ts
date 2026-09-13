/**
 * Name cleansing backfill: uppercase every REAL farmer's name (to match the New Visit rule that
 * now saves new farmers in CAPS). Idempotent — only touches names that aren't already all-caps.
 * Non-cased scripts (e.g. Devanagari) are left unchanged by upper().
 *   DATABASE_URL=... npx tsx scripts/uppercase-farmer-names.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const [{ n: before }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int n FROM "Farmer" WHERE source='REAL' AND name IS NOT NULL AND name <> upper(name)`);
  console.log(`REAL farmers with a non-caps name: ${before.toLocaleString()}`);
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "Farmer" SET name = upper(name) WHERE source='REAL' AND name IS NOT NULL AND name <> upper(name)`);
  console.log(`Uppercased ${Number(updated).toLocaleString()} farmer names.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
