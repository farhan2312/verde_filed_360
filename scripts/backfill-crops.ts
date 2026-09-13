/**
 * Backfill the two labelled crop sets onto each farmer:
 *   salesCropTags — cleaned Crops column (AE) from the master sales upload
 *   visitCropTags — cleaned crops recorded during field visits (Visit.mainCrop + crops[])
 *   cropTags      — union of the two (what the crop filters match on)
 *
 * Run after the master import (needs scratchpad sheet1.xml + ss.xml) and after
 * compute-segments.ts. This is the sole owner of Farmer.cropTags now.
 *   npx tsx scripts/backfill-crops.ts
 */
import "dotenv/config";
import { readFileSync, createReadStream } from "fs";
import { PrismaClient } from "@prisma/client";
import { cleanCrop } from "./crop-lib";

const prisma = new PrismaClient();
const SP = "C:/Users/Cosmos/AppData/Local/Temp/claude/C--Users-Cosmos-Documents-ua-agro-field-360/9310b961-a466-4156-9e10-1b15839a4613/scratchpad";

function normPhone(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(d.length - 10);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length > 10) d = d.slice(d.length - 10);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}
function colToIdx(col: string): number { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (a: string[]) => (a.length ? `ARRAY[${a.map(q).join(",")}]::text[]` : "ARRAY[]::text[]");

async function main() {
  // Shared strings.
  console.log("Loading sharedStrings…");
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

  // Farmer mobile → id.
  console.log("Loading farmers…");
  const farmers = await prisma.farmer.findMany({ where: { source: "REAL" }, select: { id: true, mobile: true } });
  const phoneToId = new Map<string, number>();
  for (const f of farmers) { const n = normPhone(f.mobile); if (n && !phoneToId.has(n)) phoneToId.set(n, f.id); }

  const salesByFarmer = new Map<number, Set<string>>();
  const visitByFarmer = new Map<number, Set<string>>();
  const add = (map: Map<number, Set<string>>, id: number, crop: string) => { (map.get(id) ?? map.set(id, new Set()).get(id)!).add(crop); };

  // Pass over the sheet for the Crops column (AE=30) keyed by phone (W=22).
  console.log("Streaming Crops column…");
  const AE = colToIdx("AE"), W = colToIdx("W");
  const stream = createReadStream(`${SP}/sheet1.xml`, { encoding: "utf8", highWaterMark: 1 << 20 });
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
  let buf = ""; let rows = 0;
  for await (const chunk of stream as AsyncIterable<string>) {
    buf += chunk;
    let m: RegExpExecArray | null; let lastEnd = 0; rowRe.lastIndex = 0;
    while ((m = rowRe.exec(buf)) !== null) {
      const rn = +m[1]; lastEnd = rowRe.lastIndex;
      if (rn === 1) continue;
      rows++;
      let c: RegExpExecArray | null; cellRe.lastIndex = 0; let phoneCell: string | undefined, cropCell: string | undefined;
      while ((c = cellRe.exec(m[2])) !== null) {
        if (c[3] == null) continue;
        const idx = colToIdx(c[1]); const val = /\bt="s"/.test(c[2]) ? strings[+c[3]] : c[3];
        if (idx === W) phoneCell = val; else if (idx === AE) cropCell = val;
      }
      const phone = normPhone(phoneCell); if (!phone) continue;
      const id = phoneToId.get(phone); if (!id) continue;
      const crop = cleanCrop(cropCell); if (crop) add(salesByFarmer, id, crop);
    }
    buf = buf.slice(lastEnd);
    if (rows % 200000 < 5) process.stderr.write(`  ${rows} rows\n`);
  }
  console.log(`  farmers with a sales crop: ${salesByFarmer.size.toLocaleString()}`);

  // Field visits.
  console.log("Reading field visits…");
  const visits = await prisma.visit.findMany({ where: { farmerId: { not: null } }, select: { farmerId: true, mainCrop: true, crops: true } });
  for (const v of visits) {
    if (v.farmerId == null) continue;
    const mc = cleanCrop(v.mainCrop); if (mc) add(visitByFarmer, v.farmerId, mc);
    for (const c of v.crops) { const cc = cleanCrop(c); if (cc) add(visitByFarmer, v.farmerId, cc); }
  }
  console.log(`  farmers with a visit crop: ${visitByFarmer.size.toLocaleString()}`);

  // Reset then bulk-update.
  console.log("Resetting + writing crop tags…");
  await prisma.$executeRawUnsafe(`UPDATE "Farmer" SET "cropTags"=ARRAY[]::text[], "salesCropTags"=ARRAY[]::text[], "visitCropTags"=ARRAY[]::text[] WHERE source='REAL'`);
  const ids = new Set<number>([...salesByFarmer.keys(), ...visitByFarmer.keys()]);
  const rowsSql: string[] = [];
  for (const id of ids) {
    const sales = [...(salesByFarmer.get(id) ?? [])].sort();
    const visit = [...(visitByFarmer.get(id) ?? [])].sort();
    const union = [...new Set([...sales, ...visit])].sort();
    rowsSql.push(`(${id}::int, ${arr(sales)}, ${arr(visit)}, ${arr(union)})`);
  }
  let updated = 0;
  for (let i = 0; i < rowsSql.length; i += 2000) {
    const slice = rowsSql.slice(i, i + 2000);
    updated += await prisma.$executeRawUnsafe(
      `UPDATE "Farmer" f SET "salesCropTags"=v.s, "visitCropTags"=v.vv, "cropTags"=v.u
       FROM (VALUES ${slice.join(",")}) AS v(id, s, vv, u) WHERE f.id=v.id`);
    process.stdout.write(`\r  updated ${updated}/${rowsSql.length}`);
  }
  process.stdout.write("\n");

  // Report.
  const dist = await prisma.$queryRawUnsafe<{ crop: string; farmers: bigint }[]>(
    `SELECT unnest("cropTags") crop, COUNT(*) farmers FROM "Farmer" WHERE source='REAL' GROUP BY 1 ORDER BY 2 DESC`);
  console.log(`\nUnion crop base — ${dist.length} distinct crops:`);
  for (const d of dist) console.log(`  ${d.crop.padEnd(15)} ${Number(d.farmers).toLocaleString()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
