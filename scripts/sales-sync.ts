/**
 * CLI for the ERP sales sync (backfills + ad-hoc windows).
 *
 *   npx tsx scripts/sales-sync.ts --from 2023-04-01 --to 2026-09-12     # backfill (month by month)
 *   npx tsx scripts/sales-sync.ts                                        # scheduled window (yesterday, IST)
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runSalesSync, scheduledWindow, getSyncSettings } from "../lib/sales-sync";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  let from = arg("from"), to = arg("to");
  let trigger: "BACKFILL" | "SCHEDULED" = "BACKFILL";
  if (!from || !to) {
    const { lookbackDays } = await getSyncSettings();
    ({ from, to } = scheduledWindow(lookbackDays));
    trigger = "SCHEDULED";
  }
  console.log(`Sales sync ${from} → ${to} (${trigger})`);
  const res = await runSalesSync({
    from, to, trigger, actor: "CLI",
    onProgress: (p) => console.log(`  [${p.step}/${p.total}] ${p.message}  records=${p.apiRecords} bills=${p.salesInserted} lines=${p.linesInserted} new=${p.newCustomers} skipped=${p.skipped}`),
  });
  console.log(`\n${res.status} in ${(res.durationMs / 1000).toFixed(1)}s — run #${res.runId}`);
  if (res.error) { console.error(res.error); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
