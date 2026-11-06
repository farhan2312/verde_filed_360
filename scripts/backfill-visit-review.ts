/**
 * One-time backfill for the Visit Review upgrade (rating / flag / revision history):
 *  1. firstReviewedAt = reviewedAt for visits reviewed before the column existed (turnaround / SLA).
 *  2. Seed one REVIEWED VisitReviewRevision per already-reviewed visit that has no history yet, stamped
 *     with the original reviewer + reviewedAt, so the history timeline isn't empty for old reviews.
 * Idempotent — re-running changes nothing. Dry run by default.
 *   DATABASE_URL=... npx tsx scripts/backfill-visit-review.ts [--apply]
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const [{ n: needFirst }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int n FROM "Visit" WHERE "reviewedAt" IS NOT NULL AND "firstReviewedAt" IS NULL`);
  const [{ n: needRev }] = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int n FROM "Visit" v WHERE v."reviewedAt" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "VisitReviewRevision" r WHERE r."visitId" = v.id)`);
  console.log(`Reviewed visits missing firstReviewedAt: ${needFirst}`);
  console.log(`Reviewed visits with no revision history: ${needRev}`);
  if (!APPLY) { console.log("Dry run — pass --apply to write."); return; }

  const a = await prisma.$executeRawUnsafe(
    `UPDATE "Visit" SET "firstReviewedAt" = "reviewedAt" WHERE "reviewedAt" IS NOT NULL AND "firstReviewedAt" IS NULL`);
  const b = await prisma.$executeRawUnsafe(`
    INSERT INTO "VisitReviewRevision" ("visitId", action, note, rating, flagged, "actorName", "actorCode", "actorRole", "createdAt")
    SELECT v.id, 'REVIEWED', v."reviewNote", v."reviewRating", v."reviewFlagged", v."reviewedByName", v."reviewedByCode", v."reviewedByRole", v."reviewedAt"
    FROM "Visit" v
    WHERE v."reviewedAt" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "VisitReviewRevision" r WHERE r."visitId" = v.id)`);
  console.log(`Set firstReviewedAt on ${a} visits; seeded ${b} revision rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
