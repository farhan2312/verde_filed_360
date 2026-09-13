/**
 * Streaming importer for the Master CRM sales file (825MB sheet, 683k line-items).
 * Two passes over the extracted sheet1.xml:
 *   Pass 1 — discover distinct Products + Farmers (by valid phone), accumulate product rollups.
 *   Pass 2 — insert SaleLine rows (chunked createMany).
 * Then backfill bill-level Sale rows and link saleId; log a SalesImport row.
 *
 * Lines without a valid phone are DROPPED entirely (per spec).
 *
 * Prereqs (already extracted to scratchpad):
 *   ss.xml       = xl/sharedStrings.xml
 *   sheet1.xml   = xl/worksheets/sheet1.xml
 *
 * Env: DRY=1 → pass 1 only, report, no writes.
 */
import "dotenv/config";
import { readFileSync, createReadStream } from "fs";
import { PrismaClient, Prisma } from "@prisma/client";
import { cropFromItem } from "./crop-lib";

const prisma = new PrismaClient();
const SP = "C:/Users/Cosmos/AppData/Local/Temp/claude/C--Users-Cosmos-Documents-ua-agro-field-360/9310b961-a466-4156-9e10-1b15839a4613/scratchpad";
const SHEET = `${SP}/sheet1.xml`;
const SS = `${SP}/ss.xml`;
const DRY = process.env.DRY === "1";
const FILE_LABEL = "Verde Agrotech Master CRM May 2023-Mar 2026.xlsx";
const FILE_KB = Math.round(80068301 / 1024);

/* ───────────────── shared strings ───────────────── */
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}
console.log("Loading sharedStrings…");
const strings: string[] = [];
{
  const ss = readFileSync(SS, "utf8");
  const siRe = /<si>([\s\S]*?)<\/si>/g; let m: RegExpExecArray | null;
  while ((m = siRe.exec(ss)) !== null) {
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t: RegExpExecArray | null; let v = "";
    while ((t = tRe.exec(m[1])) !== null) v += t[1];
    strings.push(decodeEntities(v));
  }
}
console.log(`  ${strings.length.toLocaleString()} strings`);

/* ───────────────── normalizers ───────────────── */
function normPhone(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(d.length - 10);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length > 10) d = d.slice(d.length - 10);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const UOM_MAP: Record<string, string> = {
  KG: "KG", KGS: "KG", KILO: "KG", KILOGRAM: "KG",
  GRAM: "GRAM", GRAMS: "GRAM", GM: "GRAM", GMS: "GRAM", G: "GRAM",
  BAG: "BAG", BAGS: "BAG", BORA: "BAG",
  ML: "ML", LTR: "LTR", LITRE: "LTR", LITER: "LTR", LT: "LTR", L: "LTR",
  PCS: "PCS", PC: "PCS", PIECE: "PCS", PIECES: "PCS", NG: "PCS",
  NOS: "NOS", NO: "NOS", BUCKET: "BUCKET", ROL: "ROLL", ROLL: "ROLL",
};
function normUOM(raw?: string): string | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  const base = /^(?:\d+\s*)?([A-Z]+)/.exec(u);
  if (base && UOM_MAP[base[1]]) return UOM_MAP[base[1]];
  return UOM_MAP[u] ?? u;
}
function parseDate(raw?: string): Date | null {
  if (!raw) return null;
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(raw.trim());
  if (!m) return null;
  const dd = +m[1], mm = +m[2]; let year = +m[3];
  if (year < 100) year += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || year < 2015 || year > 2030) return null;
  return new Date(Date.UTC(year, mm - 1, dd));
}
function parseNum(s?: string): number { if (s == null) return 0; const n = parseFloat(String(s).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
function fmtFY(h?: string): string | null { if (!h) return null; const s = String(h).replace(/\D/g, ""); return s.length === 4 ? `FY ${s.slice(0, 2)}-${s.slice(2)}` : h; }
function alnum(s?: string): string { return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

/* ───────────────── column indices ───────────────── */
const IX = { A: 0, B: 1, C: 2, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, R: 17, T: 19, U: 20, V: 21, W: 22, Y: 24, AA: 26, AD: 29 };
function colToIdx(col: string): number { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }

/* ───────────────── row streamer (backpressure via async iterator) ───────────────── */
async function* rowIterator(): AsyncGenerator<{ cells: Record<number, string>; rowNum: number }> {
  const stream = createReadStream(SHEET, { encoding: "utf8", highWaterMark: 1 << 20 });
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  // Capture the whole attribute run + value; detect t="s" independent of attribute
  // order (Excel writes s before t, other tools write t before s).
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
  let buf = "";
  for await (const chunk of stream as AsyncIterable<string>) {
    buf += chunk;
    let m: RegExpExecArray | null; let lastEnd = 0; rowRe.lastIndex = 0;
    const out: { cells: Record<number, string>; rowNum: number }[] = [];
    while ((m = rowRe.exec(buf)) !== null) {
      const cells: Record<number, string> = {};
      let c: RegExpExecArray | null; cellRe.lastIndex = 0;
      while ((c = cellRe.exec(m[2])) !== null) {
        if (c[3] == null) continue;
        cells[colToIdx(c[1])] = /\bt="s"/.test(c[2]) ? strings[+c[3]] : c[3];
      }
      out.push({ cells, rowNum: +m[1] });
      lastEnd = rowRe.lastIndex;
    }
    buf = buf.slice(lastEnd);
    for (const r of out) yield r;
  }
}

/* ───────────────── Pass 1: discover ───────────────── */
type ProdAcc = { mainCat?: string; subCat?: string; uom?: string; taxRate?: number; isSeed: boolean; cropTag?: string | null; qty: number; revenue: number; lines: number; firstAt?: Date; lastAt?: Date; lastPrice?: number; lastPriceAt?: number };
const products = new Map<string, ProdAcc>();
const farmersDisc = new Map<string, { name?: string; store?: string }>();
const orderSet = new Set<string>();
let rows = 0, retained = 0, dropped = 0, noItem = 0;
let minDate: Date | null = null, maxDate: Date | null = null;

async function pass1() {
  console.log("Pass 1 — discovering products & farmers…");
  for await (const { cells, rowNum } of rowIterator()) {
    if (rowNum === 1) continue;
    rows++;
    if (rows % 100000 === 0) process.stderr.write(`  pass1 ${rows.toLocaleString()} rows\n`);
    const phone = normPhone(cells[IX.W]);
    if (!phone) { dropped++; continue; }
    const item = (cells[IX.I] || "").trim();
    if (!item) { noItem++; dropped++; continue; }
    retained++;

    const mainCat = cells[IX.B]?.trim() || undefined;
    const qty = parseNum(cells[IX.J]);
    const total = parseNum(cells[IX.F]);
    const dt = parseDate(cells[IX.R]);
    if (dt) { if (!minDate || dt < minDate) minDate = dt; if (!maxDate || dt > maxDate) maxDate = dt; }
    orderSet.add(cells[IX.E] || "");

    let p = products.get(item);
    if (!p) {
      const isSeed = mainCat === "SEEDS";
      p = { mainCat, subCat: cells[IX.C]?.trim() || undefined, uom: normUOM(cells[IX.K]) || undefined, taxRate: parseNum(cells[IX.L]) + parseNum(cells[IX.M]), isSeed, cropTag: isSeed ? cropFromItem(item) : null, qty: 0, revenue: 0, lines: 0 };
      products.set(item, p);
    }
    p.qty += qty; p.revenue += total; p.lines++;
    if (dt) {
      if (!p.firstAt || dt < p.firstAt) p.firstAt = dt;
      if (!p.lastAt || dt > p.lastAt) p.lastAt = dt;
      const t = dt.getTime();
      // Only advance last unit price on positive-qty lines (a return/credit line has qty<=0 and no meaningful unit price).
      if (qty > 0 && (p.lastPriceAt == null || t >= p.lastPriceAt)) { p.lastPriceAt = t; p.lastPrice = total / qty; }
    }

    if (!farmersDisc.has(phone)) farmersDisc.set(phone, { name: cells[IX.U]?.trim() || undefined, store: cells[IX.A]?.trim() || undefined });
  }
}

/* ───────────────── main ───────────────── */
async function main() {
  const t0 = Date.now();
  await pass1();
  console.log("\n── Pass 1 summary ──");
  console.log(`rows=${rows.toLocaleString()} retained=${retained.toLocaleString()} dropped(no phone/item)=${dropped.toLocaleString()} (noItem=${noItem})`);
  console.log(`distinct products=${products.size.toLocaleString()} distinct valid phones=${farmersDisc.size.toLocaleString()} distinct bills=${orderSet.size.toLocaleString()}`);
  console.log(`date range ${minDate?.toISOString().slice(0, 10)} → ${maxDate?.toISOString().slice(0, 10)}`);
  const seedProducts = [...products.values()].filter((p) => p.isSeed);
  const cropped = seedProducts.filter((p) => p.cropTag).length;
  console.log(`seed products=${seedProducts.length} with crop tag=${cropped}`);

  // Store match preview.
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const storeMap = new Map<string, number>();
  for (const s of stores) storeMap.set(alnum(s.name), s.id);
  let storeHit = 0, storeMiss = 0; const missSample = new Set<string>();
  for (const f of farmersDisc.values()) { if (storeMap.has(alnum(f.store))) storeHit++; else { storeMiss++; if (missSample.size < 8 && f.store) missSample.add(f.store); } }
  console.log(`store match (by discovered farmer's store): hit=${storeHit} miss=${storeMiss} sampleMiss=${[...missSample]}`);

  // Farmer new-vs-existing preview.
  const existing = await prisma.farmer.findMany({ select: { id: true, mobile: true } });
  const phoneMap = new Map<string, number>();
  for (const f of existing) { const n = normPhone(f.mobile); if (n && !phoneMap.has(n)) phoneMap.set(n, f.id); }
  let matchF = 0, newF = 0;
  for (const phone of farmersDisc.keys()) { if (phoneMap.has(phone)) matchF++; else newF++; }
  console.log(`farmers: match existing=${matchF.toLocaleString()} new-to-create=${newF.toLocaleString()} (existing base=${existing.length.toLocaleString()})`);

  if (DRY) { console.log(`\nDRY run — no writes. (${((Date.now() - t0) / 1000).toFixed(0)}s)`); await prisma.$disconnect(); return; }

  // Guard against accidental double-import.
  if ((await prisma.saleLine.count()) > 0 && process.env.FORCE !== "1") {
    console.log("\nSaleLine already populated — set FORCE=1 to wipe & reimport. Aborting."); await prisma.$disconnect(); return;
  }
  if (process.env.FORCE === "1") {
    console.log("FORCE=1 — clearing SaleLine + Product…");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "SaleLine" RESTART IDENTITY`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Product"`);
  }

  /* ── Insert products (with rollups) ── */
  console.log("\nInserting products…");
  const prodData = [...products.entries()].map(([raw, v]) => ({
    rawName: raw, name: raw, mainCategory: v.mainCat ?? null, subCategory: v.subCat ?? null, uom: v.uom ?? null,
    taxRate: v.taxRate ?? null, cropTag: v.cropTag ?? null, isSeed: v.isSeed,
    lastPrice: v.lastPrice ?? null, avgPrice: v.qty > 0 ? v.revenue / v.qty : null,
    totalQty: v.qty, totalRevenue: v.revenue, lineCount: v.lines,
    firstSoldAt: v.firstAt ?? null, lastSoldAt: v.lastAt ?? null,
  }));
  for (let i = 0; i < prodData.length; i += 1000) await prisma.product.createMany({ data: prodData.slice(i, i + 1000), skipDuplicates: true });
  const prodRows = await prisma.product.findMany({ select: { id: true, rawName: true } });
  const prodMap = new Map(prodRows.map((p) => [p.rawName, p.id]));
  console.log(`  products in DB: ${prodMap.size.toLocaleString()}`);

  /* ── Create new farmers ── */
  console.log("Creating new farmers…");
  const newFarmers = [...farmersDisc.entries()].filter(([phone]) => !phoneMap.has(phone))
    .map(([phone, f]) => ({ code: `C${phone}`, name: f.name || "Customer", mobile: phone, storeId: storeMap.get(alnum(f.store)) ?? null, source: "REAL" as const }));
  for (let i = 0; i < newFarmers.length; i += 4000) await prisma.farmer.createMany({ data: newFarmers.slice(i, i + 4000), skipDuplicates: true });
  console.log(`  created ${newFarmers.length.toLocaleString()} farmers`);
  // Rebuild full phone→id map.
  const allF = await prisma.farmer.findMany({ select: { id: true, mobile: true } });
  phoneMap.clear();
  for (const f of allF) { const n = normPhone(f.mobile); if (n && !phoneMap.has(n)) phoneMap.set(n, f.id); }

  /* ── Pass 2: insert SaleLines ── */
  console.log("Pass 2 — inserting SaleLines…");
  let buffer: Prisma.SaleLineCreateManyInput[] = [];
  let inserted = 0, r2 = 0;
  const flush = async () => { if (!buffer.length) return; await prisma.saleLine.createMany({ data: buffer }); inserted += buffer.length; buffer = []; };
  for await (const { cells, rowNum } of rowIterator()) {
    if (rowNum === 1) continue;
    r2++;
    const phone = normPhone(cells[IX.W]); if (!phone) continue;
    const item = (cells[IX.I] || "").trim(); if (!item) continue;
    const productId = prodMap.get(item); if (!productId) continue;
    const qty = parseNum(cells[IX.J]);
    const total = parseNum(cells[IX.F]);
    buffer.push({
      orderNo: cells[IX.E] || "", productId, itemRaw: item,
      store: cells[IX.A]?.trim() || null, storeId: storeMap.get(alnum(cells[IX.A])) ?? null,
      farmerId: phoneMap.get(phone) ?? null,
      qty, returnQty: parseNum(cells[IX.AD]), uom: normUOM(cells[IX.K]),
      unitPrice: qty > 0 ? total / qty : null, totalPrice: total, basic: parseNum(cells[IX.G]),
      cgstRate: parseNum(cells[IX.L]), sgstRate: parseNum(cells[IX.M]), cgst: parseNum(cells[IX.N]), sgst: parseNum(cells[IX.O]),
      discount: parseNum(cells[IX.P]), batchNo: cells[IX.T]?.trim() || null,
      soldAt: parseDate(cells[IX.R]), financialYear: fmtFY(cells[IX.H]),
      mainCategory: cells[IX.B]?.trim() || null, subCategory: cells[IX.C]?.trim() || null,
      custName: cells[IX.U]?.trim() || null, custPhone: phone, b2b: cells[IX.AA] === "1",
    });
    if (buffer.length >= 1000) { await flush(); if (inserted % 50000 < 1000) process.stderr.write(`  pass2 inserted ${inserted.toLocaleString()}\n`); }
  }
  await flush();
  console.log(`  inserted ${inserted.toLocaleString()} SaleLines`);

  /* ── Backfill bill-level Sale + link saleId ── */
  console.log("Backfilling Sale bills…");
  const backfilled: number = await prisma.$executeRawUnsafe(`
    INSERT INTO "Sale" ("farmerId","invoice","soldAt","date","items","itemCount","category","amount","amountNum","store","financialYear","source","createdAt")
    SELECT (array_agg(sl."farmerId"))[1], sl."orderNo", MIN(sl."soldAt"),
           to_char(MIN(sl."soldAt"), 'DD Mon YYYY'),
           (array_agg(sl."itemRaw" ORDER BY sl."totalPrice" DESC))[1] || CASE WHEN COUNT(*) > 1 THEN ' · +' || (COUNT(*) - 1) || ' more' ELSE '' END,
           COUNT(*)::int,
           MODE() WITHIN GROUP (ORDER BY sl."mainCategory"),
           '₹' || to_char(ROUND(SUM(sl."totalPrice")), 'FM999,999,999'),
           ROUND(SUM(sl."totalPrice"))::int,
           (array_agg(sl."store"))[1], (array_agg(sl."financialYear"))[1], 'REAL'::"DataSource", now()
    FROM "SaleLine" sl
    WHERE sl."farmerId" IS NOT NULL
      AND sl."orderNo" <> ''
      AND sl."orderNo" NOT IN (SELECT "invoice" FROM "Sale" WHERE "invoice" IS NOT NULL)
    GROUP BY sl."orderNo"`);
  console.log(`  backfilled ${Number(backfilled).toLocaleString()} Sale bills`);
  console.log("Linking SaleLine.saleId…");
  const linked: number = await prisma.$executeRawUnsafe(`UPDATE "SaleLine" sl SET "saleId" = s."id" FROM "Sale" s WHERE s."invoice" = sl."orderNo" AND sl."saleId" IS NULL`);
  console.log(`  linked ${Number(linked).toLocaleString()} lines`);

  /* ── Log import ── */
  await prisma.salesImport.create({ data: {
    filename: FILE_LABEL, fileType: "xlsx", fileSizeKb: FILE_KB, uploadedBy: "master-import", status: "SUCCESS",
    lineItems: rows, bills: orderSet.size, newCustomers: newFarmers.length, salesInserted: inserted, skipped: dropped,
    rangeStart: minDate?.toISOString().slice(0, 10) ?? null, rangeEnd: maxDate?.toISOString().slice(0, 10) ?? null,
  } });

  console.log(`\n✓ Import complete in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
