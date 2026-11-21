/**
 * Set store-region crops (Store.cropTags) in bulk — the scripted equivalent of
 * Settings -> Store Crops, for when every store (or a whole list of them) needs the same crops.
 *
 *   DRY=1 npx tsx scripts/set-store-crops.ts cotton tobacco        # report only
 *   npx tsx scripts/set-store-crops.ts cotton tobacco              # apply to every REAL store
 *   npx tsx scripts/set-store-crops.ts cotton --stores AGRO0055,AGRO0008
 *   MODE=replace npx tsx scripts/set-store-crops.ts cotton tobacco # set exactly these, dropping others
 *
 * MODE defaults to "add", so re-running is idempotent and never drops a crop someone set by hand.
 *
 * Crop names go through the same `cleanCrop` canonicaliser as sales and visits, so "Cotton", "cotton"
 * and "Kapas" all land on the single tag `cotton`. An unrecognised name aborts rather than being
 * silently dropped.
 *
 * Why this matters: a store's crops are inherited LIVE by every farmer attached to it (there is no
 * copy on the Farmer row). Putting a crop on a store therefore makes all of that store's farmers match
 * it under the cluster builder's "Store region" source. It does NOT touch the Farmers-page crop
 * filter, analytics, or campaign revenue matching — those still read only sales and visit crops.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { cleanCrop } from "../lib/crop-clean";

const prisma = new PrismaClient();
const DRY = !!process.env.DRY;
const MODE = (process.env.MODE ?? "add") as "add" | "replace";

function parseArgs(argv: string[]) {
  const crops: string[] = [];
  let only: string[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--stores") { only = (argv[++i] ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean); continue; }
    crops.push(argv[i]);
  }
  return { crops, only };
}

async function main() {
  const { crops: raw, only } = parseArgs(process.argv.slice(2));
  if (!raw.length) throw new Error('Name at least one crop, e.g. `npx tsx scripts/set-store-crops.ts cotton tobacco`.');
  if (MODE !== "add" && MODE !== "replace") throw new Error(`MODE must be "add" or "replace", got "${MODE}".`);

  // Canonicalise up front: a typo must stop the run, not quietly set nothing.
  const want: string[] = [];
  for (const r of raw) {
    const c = cleanCrop(r.replace(/_/g, " "));
    if (!c) throw new Error(`"${r}" is not a crop name the cleaner recognises — nothing was changed.`);
    want.push(c);
  }
  const wanted = [...new Set(want)].sort();

  const stores = await prisma.store.findMany({
    where: { source: "REAL", ...(only ? { code: { in: only } } : {}) },
    orderBy: [{ zone: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, zone: true, cropTags: true },
  });
  if (only) {
    const missing = only.filter((c) => !stores.some((s) => s.code.toUpperCase() === c));
    if (missing.length) throw new Error(`No REAL store with code(s): ${missing.join(", ")}`);
  }
  if (!stores.length) throw new Error("No stores matched.");

  const farmers = await prisma.farmer.groupBy({ by: ["storeId"], where: { source: "REAL", storeId: { not: null } }, _count: { _all: true } });
  const fCount = new Map(farmers.map((f) => [f.storeId!, f._count._all]));

  const plan = stores.map((s) => {
    const next = MODE === "replace" ? wanted : [...new Set([...s.cropTags, ...wanted])].sort();
    return { ...s, next, changed: next.join("|") !== [...s.cropTags].sort().join("|"), farmers: fCount.get(s.id) ?? 0 };
  });

  console.log(`${DRY ? "[DRY RUN] " : ""}mode=${MODE}  crops=[${wanted.join(", ")}]  stores=${plan.length}`);
  console.log(`${plan.filter((p) => p.changed).length} store(s) will change, ${plan.filter((p) => !p.changed).length} already correct.\n`);
  for (const p of plan) {
    const mark = p.changed ? "*" : " ";
    console.log(`${mark} ${p.code.padEnd(12)} ${String(p.zone ?? "-").padEnd(15)} farmers=${String(p.farmers).padStart(5)}  [${p.cropTags.join(", ") || "none"}] -> [${p.next.join(", ")}]`);
  }
  const affected = plan.filter((p) => p.changed).reduce((n, p) => n + p.farmers, 0);
  console.log(`\nFarmers who will newly inherit these crops through their store: ${affected.toLocaleString()}`);

  if (DRY) { console.log("\nDRY run - nothing written."); return; }

  const toWrite = plan.filter((p) => p.changed);
  if (!toWrite.length) { console.log("\nNothing to do."); return; }
  await prisma.$transaction(toWrite.map((p) => prisma.store.update({ where: { id: p.id }, data: { cropTags: p.next } })));
  console.log(`\nUpdated ${toWrite.length} store(s).`);

  const after = await prisma.store.findMany({ where: { source: "REAL" }, select: { cropTags: true } });
  const have = wanted.every((c) => after.filter((s) => s.cropTags.includes(c)).length >= toWrite.length);
  console.log(`Verify: ${after.filter((s) => s.cropTags.length).length} of ${after.length} REAL stores now have crops set; wanted tags present on every updated store: ${have}`);
  console.log("Note: cached crop facets (STATS_TAG) refresh on their own revalidate; the Settings tab reads live.");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
