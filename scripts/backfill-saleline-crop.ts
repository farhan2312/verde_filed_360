/**
 * Backfill SaleLine.cropTag — the crop each sale line was for, cleaned per-line from the master
 * file's Crops column (AE). Keyed by (orderNo=col E, itemRaw=col I), matching import-mastercrm's
 * SaleLine construction. This is what campaign attribution matches on (a potato campaign can then
 * credit potato sales even though the catalogue has no potato-specific product).
 *
 * Needs the extracted sheet1.xml + ss.xml in the scratchpad (same as backfill-crops.ts).
 *   npx tsx scripts/backfill-saleline-crop.ts
 */
import "dotenv/config";
import { readFileSync, createReadStream } from "fs";
import { PrismaClient } from "@prisma/client";
import { cleanCrop } from "./crop-lib";

const prisma = new PrismaClient();
const SP = "C:/Users/Cosmos/AppData/Local/Temp/claude/C--Users-Cosmos-Documents-ua-agro-field-360/9310b961-a466-4156-9e10-1b15839a4613/scratchpad";
const SEP = String.fromCharCode(1); // key separator — cannot appear in an order number or item name

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}
function colToIdx(col: string): number { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  console.log("Loading sharedStrings...");
  const strings: string[] = [];
  {
    const ss = readFileSync(`${SP}/ss.xml`, "utf8");
    const siRe = /<si>([\s\S]*?)<\/si>/g; let m: RegExpExecArray | null;
    while ((m = siRe.exec(ss)) !== null) {
      const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t: RegExpExecArray | null; let v = "";
      while ((t = tRe.exec(m[1])) !== null) v += t[1];
      strings.push(decodeEntities(v));
    }
  }
  console.log(`  ${strings.length.toLocaleString()} shared strings`);

  // (orderNo, itemRaw) -> crop. First non-empty crop wins (same line = same crop context).
  const E = colToIdx("E"), I = colToIdx("I"), AE = colToIdx("AE");
  const keyToCrop = new Map<string, string>();
  const stream = createReadStream(`${SP}/sheet1.xml`, { encoding: "utf8", highWaterMark: 1 << 20 });
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
  let buf = "", rows = 0;
  console.log("Streaming master sheet for per-line crops...");
  for await (const chunk of stream as AsyncIterable<string>) {
    buf += chunk;
    let m: RegExpExecArray | null; let lastEnd = 0; rowRe.lastIndex = 0;
    while ((m = rowRe.exec(buf)) !== null) {
      const rn = +m[1]; lastEnd = rowRe.lastIndex;
      if (rn === 1) continue;
      rows++;
      let c: RegExpExecArray | null; cellRe.lastIndex = 0;
      let orderCell: string | undefined, itemCell: string | undefined, cropCell: string | undefined;
      while ((c = cellRe.exec(m[2])) !== null) {
        if (c[3] == null) continue;
        const idx = colToIdx(c[1]); const val = /\bt="s"/.test(c[2]) ? strings[+c[3]] : c[3];
        if (idx === E) orderCell = val; else if (idx === I) itemCell = val; else if (idx === AE) cropCell = val;
      }
      const item = (itemCell || "").trim();
      if (!item) continue; // importer skips lines with no item
      const crop = cleanCrop(cropCell);
      if (!crop) continue;
      const key = `${orderCell || ""}${SEP}${item}`;
      if (!keyToCrop.has(key)) keyToCrop.set(key, crop);
    }
    buf = buf.slice(lastEnd);
    if (rows % 200000 < 5) process.stderr.write(`  ${rows.toLocaleString()} rows - ${keyToCrop.size.toLocaleString()} keys\n`);
  }
  console.log(`  ${rows.toLocaleString()} rows scanned - ${keyToCrop.size.toLocaleString()} (order,item) keys with a crop`);

  console.log("Writing SaleLine.cropTag...");
  const entries = [...keyToCrop.entries()];
  let updated = 0;
  for (let i = 0; i < entries.length; i += 1000) {
    const slice = entries.slice(i, i + 1000);
    const values = slice.map(([k, crop]) => { const j = k.indexOf(SEP); return `(${q(k.slice(0, j))}, ${q(k.slice(j + 1))}, ${q(crop)})`; }).join(",");
    updated += await prisma.$executeRawUnsafe(
      `UPDATE "SaleLine" sl SET "cropTag" = v.c FROM (VALUES ${values}) AS v(o, i, c)
       WHERE sl."orderNo" = v.o AND sl."itemRaw" = v.i AND sl."cropTag" IS NULL`);
    if (i % 20000 === 0) process.stdout.write(`\r  ${updated.toLocaleString()} lines tagged (${Math.min(i + 1000, entries.length).toLocaleString()}/${entries.length.toLocaleString()} keys)`);
  }
  process.stdout.write("\n");

  const dist = await prisma.$queryRawUnsafe<{ crop: string; lines: bigint }[]>(
    `SELECT "cropTag" crop, COUNT(*) lines FROM "SaleLine" WHERE "cropTag" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 25`);
  console.log(`\nSaleLine.cropTag distribution (top 25):`);
  for (const d of dist) console.log(`  ${(d.crop ?? "").padEnd(15)} ${Number(d.lines).toLocaleString()}`);
  const tagged = await prisma.saleLine.count({ where: { cropTag: { not: null } } });
  const total = await prisma.saleLine.count();
  console.log(`\nTagged ${tagged.toLocaleString()} / ${total.toLocaleString()} SaleLines.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
