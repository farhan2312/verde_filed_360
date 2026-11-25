/**
 * Remove the test visits logged during the November 2026 rollout, where officers tried the visit form
 * against made-up farmers ("TEST", "TESTING", "TEST ALOK NASVADI", "Jalundh test", ...).
 *
 *   DRY=1 npx tsx scripts/delete-test-visits.ts    # report only
 *   npx tsx scripts/delete-test-visits.ts          # apply
 *
 * The rule is the farmer's name containing "test", case-insensitive, anywhere — which is how these
 * entries are identifiable; there is no test flag on Visit (every row is source=REAL).
 *
 * What it removes, and why in this order:
 *   1. Actions raised by those visits. Action.visitId is ON DELETE SET NULL, so deleting a visit does
 *      NOT remove its follow-up — it would silently leave an orphaned open task on the Action
 *      Registry. They have to go explicitly, and first.
 *   2. The visits themselves.
 *   3. The test farmer rows, but ONLY those with no invoices and no sale lines. Sale.farmerId is ON
 *      DELETE CASCADE, so deleting a farmer who has ERP sales destroys their invoice rows; a farmer
 *      with any sales history is reported and kept. KEEP_FARMERS below pins that decision explicitly.
 *
 * Not recoverable except by re-running the sales backfill (which would re-create farmers and invoices
 * by invoice number). Visits and Actions are not in the ERP, so those are gone for good.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = !!process.env.DRY;

/** Farmer ids never to delete, whatever their name says. These have real ERP sales behind them. */
const KEEP_FARMERS = new Set<number>([81, 9562]);

async function main() {
  const visits = await prisma.$queryRawUnsafe<
    { id: number; fid: number | null; farmer: string | null; store: string | null; date: string | null; officer: string | null }[]
  >(`
    SELECT v.id, f.id fid, f.name farmer, s.code store, v.date, v."officerName" officer
    FROM "Visit" v LEFT JOIN "Farmer" f ON f.id = v."farmerId" LEFT JOIN "Store" s ON s.id = v."storeId"
    WHERE f.name ILIKE '%test%'
    ORDER BY v.id`);

  if (!visits.length) { console.log("No test visits found - nothing to do."); return; }
  const visitIds = visits.map((v) => v.id);

  const actions = await prisma.action.findMany({
    where: { visitId: { in: visitIds } },
    select: { id: true, visitId: true, reason: true, status: true, dueDate: true },
  });

  // Candidate farmers: named like a test, no sales of any kind, and no visit left once these go.
  const farmers = await prisma.$queryRawUnsafe<
    { id: number; name: string; invoices: number; lines: number; other_visits: number }[]
  >(`
    SELECT f.id, f.name,
      (SELECT COUNT(*)::int FROM "Sale" sa WHERE sa."farmerId" = f.id) invoices,
      (SELECT COUNT(*)::int FROM "SaleLine" sl WHERE sl."farmerId" = f.id) lines,
      (SELECT COUNT(*)::int FROM "Visit" v WHERE v."farmerId" = f.id AND NOT (v.id = ANY($1::int[]))) other_visits
    FROM "Farmer" f WHERE f.name ILIKE '%test%' ORDER BY f.id`, visitIds);

  const delFarmers = farmers.filter((f) => !KEEP_FARMERS.has(f.id) && f.invoices === 0 && f.lines === 0 && f.other_visits === 0);
  const keptFarmers = farmers.filter((f) => !delFarmers.some((d) => d.id === f.id));

  console.log(`${DRY ? "[DRY RUN] " : ""}matched by farmer name ILIKE '%test%'\n`);
  console.log(`VISITS to delete (${visits.length}):`);
  for (const v of visits) console.log(`  v${String(v.id).padStart(3)}  ${String(v.store ?? "-").padEnd(9)} ${String(v.date ?? "-").padEnd(12)} farmer#${String(v.fid ?? "-").padStart(5)} "${v.farmer}"  officer="${v.officer}"`);

  console.log(`\nACTIONS to delete (${actions.length}) - follow-ups raised by those visits:`);
  for (const a of actions) console.log(`  action#${String(a.id).padStart(3)} from v${a.visitId}  status=${a.status} due=${a.dueDate ? a.dueDate.toISOString().slice(0, 10) : "-"}  "${a.reason ?? ""}"`);

  console.log(`\nFARMERS to delete (${delFarmers.length}) - test records with no sales:`);
  for (const f of delFarmers) console.log(`  #${String(f.id).padStart(5)} "${f.name}"`);

  console.log(`\nFARMERS kept (${keptFarmers.length}) - real sales attached, deleting them would cascade their invoices away:`);
  for (const f of keptFarmers) console.log(`  #${String(f.id).padStart(5)} "${f.name}"  invoices=${f.invoices} saleLines=${f.lines} otherVisits=${f.other_visits}`);

  if (DRY) { console.log("\nDRY run - nothing written."); return; }

  const res = await prisma.$transaction(async (tx) => {
    const a = await tx.action.deleteMany({ where: { id: { in: actions.map((x) => x.id) } } });
    const v = await tx.visit.deleteMany({ where: { id: { in: visitIds } } });
    const f = await tx.farmer.deleteMany({ where: { id: { in: delFarmers.map((x) => x.id) } } });
    return { actions: a.count, visits: v.count, farmers: f.count };
  });
  console.log(`\nDeleted ${res.visits} visit(s), ${res.actions} action(s), ${res.farmers} farmer(s).`);

  const left = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int n FROM "Visit" v JOIN "Farmer" f ON f.id=v."farmerId" WHERE f.name ILIKE '%test%'`);
  const total = await prisma.visit.count();
  const orphan = await prisma.action.count({ where: { visitId: { in: visitIds } } });
  const inv = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int n FROM "Sale"`);
  console.log(`Verify: test visits remaining=${left[0].n}  total visits=${total}  orphaned actions=${orphan}  Sale rows intact=${inv[0].n}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
