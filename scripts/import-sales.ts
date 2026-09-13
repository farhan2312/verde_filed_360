/**
 * Import farmer sales (bill-level) from the ETL output into Postgres.
 *
 *   1) python scripts ETL → bills.jsonl   (aggregates the raw Excel line items)
 *   2) npm run db:import-sales             (this script — joins to farmers by mobile)
 *
 * Joins each bill to a Farmer by normalized mobile number. Bills whose customer
 * mobile has no matching farmer are skipped and counted. Idempotent: clears
 * existing source=REAL sales first.
 */
import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BILLS =
  process.env.BILLS_FILE ||
  "C:/Users/Cosmos/AppData/Local/Temp/claude/C--Users-Cosmos-Documents-ua-agro-field-360/9310b961-a466-4156-9e10-1b15839a4613/scratchpad/bills.jsonl";

function normMobile(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = String(v).replace(/\D/g, "");
  if (s.length > 10) s = s.slice(-10);
  return s.length === 10 && "6789".includes(s[0]) ? s : null;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

interface Bill {
  mobile: string;
  invoice: string;
  dateIso: string | null;
  date: string;
  store: string | null;
  items: string;
  itemCount: number;
  category: string | null;
  amountNum: number;
  fy: string;
}

async function main() {
  console.log("Loading farmer mobile → id map …");
  const farmers = await prisma.farmer.findMany({ select: { id: true, mobile: true } });
  const mobileToId = new Map<string, number>();
  for (const f of farmers) {
    const m = normMobile(f.mobile);
    if (m && !mobileToId.has(m)) mobileToId.set(m, f.id);
  }
  console.log(`  ${mobileToId.size} distinct farmer mobiles indexed (of ${farmers.length} farmers)`);

  console.log("Clearing existing real sales …");
  const del = await prisma.sale.deleteMany({ where: { source: "REAL" } });
  console.log(`  removed ${del.count} old rows`);

  if (!fs.existsSync(BILLS)) throw new Error(`Bills file not found: ${BILLS}`);

  const rl = readline.createInterface({ input: fs.createReadStream(BILLS, "utf-8"), crlfDelay: Infinity });
  let batch: Array<Record<string, unknown>> = [];
  let matched = 0, unmatched = 0, inserted = 0, total = 0;
  const CHUNK = 5000;

  const flush = async () => {
    if (!batch.length) return;
    const res = await prisma.sale.createMany({ data: batch as never });
    inserted += res.count;
    batch = [];
    process.stdout.write(`\r  inserted: ${inserted}`);
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    const b = JSON.parse(line) as Bill;
    const farmerId = mobileToId.get(b.mobile);
    if (!farmerId) { unmatched++; continue; }
    matched++;
    batch.push({
      farmerId,
      invoice: b.invoice,
      date: b.date || null,
      soldAt: b.dateIso ? new Date(b.dateIso + "T00:00:00Z") : null,
      items: b.items || null,
      itemCount: b.itemCount ?? null,
      category: b.category || null,
      amount: inr(b.amountNum),
      amountNum: b.amountNum,
      store: b.store || null,
      financialYear: b.fy || null,
      source: "REAL" as const,
    });
    if (batch.length >= CHUNK) await flush();
  }
  await flush();
  process.stdout.write("\n");

  console.log(`Done. bills=${total} matched=${matched} unmatched=${unmatched} inserted=${inserted}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
