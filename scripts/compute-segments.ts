/**
 * Compute CRM segmentation onto every REAL farmer (monthly rolling job).
 *   npx tsx scripts/compute-segments.ts
 *   SEGMENT_ASOF=2026-03-31 npx tsx scripts/compute-segments.ts   (override the anchor)
 *
 * Thin wrapper over lib/segment-engine.ts (the single source of truth — the same engine a sales
 * upload runs, scoped to the farmers it touched). This runs it FULL (every farmer).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { recomputeSegments } from "../lib/segment-engine";

const prisma = new PrismaClient();

async function main() {
  const asof = process.env.SEGMENT_ASOF ? new Date(`${process.env.SEGMENT_ASOF}T23:59:59Z`) : new Date();
  console.log(`Anchor (ASOF) = ${asof.toISOString().slice(0, 10)}`);
  const r = await recomputeSegments({ asof, onProgress: (m) => process.stdout.write(m) });
  console.log("Value segments:", JSON.stringify(r.value));
  console.log("Lifecycle segments:", JSON.stringify(r.lifecycle));
  console.log(`Leads (REAL farmers with no purchase) tagged LEAD: ${r.leads}`);
  console.log(`Leads converted to customers this run: ${r.converted}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
