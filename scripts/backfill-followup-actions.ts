/**
 * Backfill Action Registry entries for follow-up visits that never got one. Early visits (logged
 * before the visit form auto-created an Action from the Next Follow-up Date) have a followUpDate but
 * no Action, so the Action Registry under-counts vs the "Need Follow-up" KPI. Creates one OPEN action
 * per such visit, mirroring app/actions/new-visit.ts (farmer + store + visit + due date + creator).
 * Idempotent — only visits with a followUpDate and NO existing action, and a linked farmer.
 *   DATABASE_URL=... npx tsx scripts/backfill-followup-actions.ts [--apply]
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const visits = await prisma.$queryRawUnsafe<any[]>(`
    SELECT v.id, v."farmerId", v."storeId", v."followUpDate", v."followUpReason", v."followUpComment",
           v."recordedBy", v."recordedByCode", v."officerName", f.name farmer
    FROM "Visit" v LEFT JOIN "Farmer" f ON f.id = v."farmerId"
    WHERE v."followUpDate" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Action" a WHERE a."visitId" = v.id)
    ORDER BY v.id`);

  const creatable = visits.filter((v) => v.farmerId != null && !Number.isNaN(new Date(`${v.followUpDate}T00:00:00Z`).getTime()));
  const skipped = visits.filter((v) => !creatable.includes(v));

  console.log(`Follow-up visits with no action: ${visits.length}`);
  console.log(`  will create: ${creatable.length}`);
  if (skipped.length) console.log(`  skipped (no farmer / bad date): ${skipped.map((v) => Number(v.id)).join(", ")}`);
  console.table(creatable.map((v) => ({
    visit: Number(v.id), farmer: v.farmer, due: v.followUpDate,
    store: v.storeId == null ? "—" : Number(v.storeId), by: v.recordedBy ?? v.officerName,
  })));

  if (!APPLY) { console.log("\nDRY RUN — re-run with --apply to create."); await prisma.$disconnect(); return; }

  let n = 0;
  for (const v of creatable) {
    await prisma.action.create({
      data: {
        farmerId: Number(v.farmerId),
        storeId: v.storeId == null ? null : Number(v.storeId),
        visitId: Number(v.id),
        reason: v.followUpReason || null,
        note: v.followUpComment || null,
        dueDate: new Date(`${v.followUpDate}T00:00:00Z`),
        status: "OPEN",
        createdByName: v.recordedBy || v.officerName || null,
        createdByCode: v.recordedByCode || null,
      },
    });
    n++;
  }
  console.log(`\nCreated ${n} actions.`);
  const totalNow = await prisma.action.count();
  const followupVisits = await prisma.visit.count({ where: { followUpDate: { not: null } } });
  console.log(`Actions now: ${totalNow}; follow-up visits: ${followupVisits}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
