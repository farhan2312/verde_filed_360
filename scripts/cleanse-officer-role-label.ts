/**
 * Normalize the display role label for Agri Officers. Historically some User rows stored
 * "Agricultural Officer" and some "Agri Officer" (two writers used different labels), which showed
 * inconsistent badges (grey vs blue) since ROLE_META only styles "Agri Officer". Canonical = "Agri Officer".
 * Purely cosmetic — RBAC/scoping key off User.role (ASR/STORE_MANAGER), never this label.
 *   DATABASE_URL=... npx tsx scripts/cleanse-officer-role-label.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const before = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "roleLabel", COUNT(*)::int n FROM "User" GROUP BY 1 ORDER BY 2 DESC`);
  console.log("Role labels before:");
  console.table(before.map((r) => ({ roleLabel: r.roleLabel, n: Number(r.n) })));

  // Every officer-role user → "Agri Officer" (also mops up any literal "Agricultural Officer").
  const n = await prisma.$executeRawUnsafe(`
    UPDATE "User" SET "roleLabel" = 'Agri Officer'
    WHERE ("role" IN ('ASR','STORE_MANAGER') OR "roleLabel" = 'Agricultural Officer')
      AND ("roleLabel" IS DISTINCT FROM 'Agri Officer')`);
  console.log(`\nUpdated ${Number(n)} rows → "Agri Officer".`);

  const after = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "roleLabel", COUNT(*)::int n FROM "User" GROUP BY 1 ORDER BY 2 DESC`);
  console.log("Role labels after:");
  console.table(after.map((r) => ({ roleLabel: r.roleLabel, n: Number(r.n) })));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
