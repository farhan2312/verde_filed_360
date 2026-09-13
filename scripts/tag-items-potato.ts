/**
 * Manual crop override (client req 2026-07-26): tag a curated list of fertilizer SKUs as POTATO.
 * These carry no crop in the sheet's AE column, but the client knows they're bought for potato.
 * Sets SaleLine.cropTag='potato' for exact itemRaw matches. Re-run after any master re-import,
 * then run scripts/retag-farmer-crops-ae-only.ts to fold the tags into Farmer.salesCropTags.
 *
 *   npx tsx scripts/tag-items-potato.ts          # dry run — report matches only
 *   APPLY=1 npx tsx scripts/tag-items-potato.ts  # write cropTag='potato'
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === "1";

const ITEMS = [
  "N.P.K.10:26:26 PPL 50 KG",
  "MOP 50 KG (UTTAM)",
  "N.P.K. 15:15:15 (SUPHALA) RCF 50 KG",
  "N.P.K 19:19:19 PPL 50 KG",
  "TSP IPL 50 KG",
  "MOP 50 KG (PPL)",
  "N.P.K. 20:20:00:13 PPL 50 KG",
  "N.P.K 20:20:00:13 (IPL) 50 KG",
  "N.P.K. 20:20:00:13 RCF 50 KG",
  "N.P.K. 12:32:16 PPL 50 KG",
  "MAHA ZYMITE PPL (JAI KISAN) 25 KG",
  "MOP NARMADA 50 KG",
  "BHARAT MOP ANNADATA 50 KG",
  "N.P.K. 20:20:00:13 OSTWAL 50 KG",
];

async function main() {
  console.log(`${APPLY ? "" : "[DRY] "}Tagging ${ITEMS.length} item(s) as potato…\n`);
  const rows = await prisma.$queryRawUnsafe<{ itemRaw: string; lines: bigint; farmers: bigint }[]>(
    `SELECT "itemRaw", COUNT(*) lines, COUNT(DISTINCT "farmerId") farmers
     FROM "SaleLine" WHERE "itemRaw" = ANY($1::text[]) GROUP BY 1 ORDER BY 2 DESC`, ITEMS);
  const matched = new Set(rows.map((r) => r.itemRaw));
  let totLines = 0, totFarmers = 0;
  console.log("MATCHED:");
  for (const r of rows) { console.log(`  ${String(Number(r.lines)).padStart(6)} lines · ${String(Number(r.farmers)).padStart(5)} farmers  ${r.itemRaw}`); totLines += Number(r.lines); }
  const unmatched = ITEMS.filter((i) => !matched.has(i));
  if (unmatched.length) {
    console.log(`\nUNMATCHED (${unmatched.length}) — no exact SaleLine.itemRaw; check spelling/spacing:`);
    for (const u of unmatched) {
      const sug = await prisma.$queryRawUnsafe<{ itemRaw: string; lines: bigint }[]>(
        `SELECT "itemRaw", COUNT(*) lines FROM "SaleLine" WHERE "itemRaw" ILIKE $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 3`,
        `%${u.replace(/\s+/g, "%")}%`);
      console.log(`  ✗ ${u}${sug.length ? "  →  did you mean: " + sug.map((s) => `"${s.itemRaw}" (${Number(s.lines)})`).join(" / ") : "  (no similar item found)"}`);
    }
  }
  const distinctFarmers = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT "farmerId") c FROM "SaleLine" WHERE "itemRaw" = ANY($1::text[]) AND "farmerId" IS NOT NULL`, ITEMS);
  totFarmers = Number(distinctFarmers[0]?.c ?? 0);
  console.log(`\nTotal: ${matched.size}/${ITEMS.length} items matched · ${totLines.toLocaleString()} lines · ${totFarmers.toLocaleString()} distinct farmers.`);

  if (APPLY && matched.size) {
    const upd = await prisma.$executeRawUnsafe(`UPDATE "SaleLine" SET "cropTag" = 'potato' WHERE "itemRaw" = ANY($1::text[])`, ITEMS);
    console.log(`\n✓ Applied: ${Number(upd).toLocaleString()} SaleLines set to cropTag='potato'.`);
    console.log("  Next: npx tsx scripts/retag-farmer-crops-ae-only.ts");
  } else if (!APPLY) {
    console.log("\nDry run — re-run with APPLY=1 to write.");
  }
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)); });
