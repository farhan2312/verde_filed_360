/**
 * Backfill the FY26-27 SaleLine rows from the line-item CSV.
 *
 * import-newsales.ts loaded this same file at the BILL level only (Sale rows, no lines),
 * so FY26-27 had zero SaleLine detail — the crop trend / crop breakdown were blank for it.
 * This inserts the per-line SaleLine rows, resolving each Item Name to a catalogue Product
 * (creating the few missing ones), and tagging each line's crop NAME-FIRST (cropFromItem,
 * e.g. PADDY→paddy) with a single-crop catalogue fallback (no guessing on multi-crop products).
 * Existing FY26-27 Sale bills are reused (linked by orderNo); no Sale amounts change.
 *
 *   DRY=1 npx tsx scripts/import-fy2627-lines.ts   # parse + report, no writes
 *   npx tsx scripts/import-fy2627-lines.ts         # do it (idempotent: clears FY 26-27 lines first)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import { cropFromItem, cleanCrop } from "./crop-lib";

const prisma = new PrismaClient();
const DRY = process.env.DRY === "1";
const CSV = process.env.SALES_CSV || "C:/Users/Cosmos/Downloads/Customer Wise Sales 1 April To 30th June.csv";
const FY_LABEL = "FY 26-27"; // idempotency key for this batch of lines

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\r") {} else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseBillDate(s: string): Date | null {
  const m = (s || "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()]; if (mon == null) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  return new Date(Date.UTC(y, mon, +m[1]));
}
function normMobile(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = String(v).replace(/\D/g, ""); if (s.length > 10) s = s.slice(-10);
  return s.length === 10 && "6789".includes(s[0]) ? s : null;
}
const parseNum = (v: string | undefined) => { const n = parseFloat((v || "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const normName = (s: string) => (s || "").toUpperCase().replace(/\s+/g, " ").trim();
const fyLabel = (fy: string) => (/^\d{4}$/.test(fy) ? `FY ${fy.slice(0, 2)}-${fy.slice(2)}` : fy || null);

async function main() {
  console.log(`${DRY ? "[DRY RUN] " : ""}Reading ${CSV} …`);
  const rows = parseCSV(fs.readFileSync(CSV, "utf-8").replace(/^﻿/, ""));
  const header = rows[0].map((h) => h.trim().replace(/^﻿/, ""));
  const col = (name: string) => { const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase()); if (i < 0) throw new Error(`Missing column: ${name}`); return i; };
  const C = {
    store: col("Retailer Name"), order: col("Order No"), item: col("Item Name"), mainCat: col("MainCategory"), subCat: col("SubCategory"),
    qty: col("Qty"), cgstR: col("CGST Rate"), sgstR: col("SGST Rate"), cgstV: col("CGST Value"), sgstV: col("SGST Value"),
    total: col("Total"), taxable: col("Taxable Value"), disc: col("DiscountAmount"), batch: col("Batch No"), uom: col("UOM"),
    crops: col("CROPS"),
    fy: col("Financial Year"), date: col("BillDate"), name: col("Cus Name"), mobile: col("Cus Mobile"), village: col("Cus Village"), retQty: col("Return Qty"),
  };

  // ── Resolve lookup maps ──
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const storeByName = new Map(stores.map((s) => [normName(s.name), s.id]));
  const farmers = await prisma.farmer.findMany({ select: { id: true, mobile: true } });
  const farmerByMobile = new Map<string, number>();
  for (const f of farmers) { const m = normMobile(f.mobile); if (m && !farmerByMobile.has(m)) farmerByMobile.set(m, f.id); }
  console.log(`  ${stores.length} stores · ${farmerByMobile.size} farmer mobiles`);

  // ── Distinct item names → product; note which are missing ──
  const itemMeta = new Map<string, { mainCat: string; subCat: string; uom: string; taxRate: number }>();
  for (let r = 1; r < rows.length; r++) {
    const item = (rows[r][C.item] || "").trim(); if (!item || itemMeta.has(item)) continue;
    itemMeta.set(item, { mainCat: (rows[r][C.mainCat] || "").trim(), subCat: (rows[r][C.subCat] || "").trim(), uom: (rows[r][C.uom] || "").trim(), taxRate: parseNum(rows[r][C.cgstR]) + parseNum(rows[r][C.sgstR]) });
  }
  const existing = await prisma.product.findMany({ where: { rawName: { in: [...itemMeta.keys()] } }, select: { id: true, rawName: true, targetCrops: true } });
  const prodByName = new Map(existing.map((p) => [p.rawName, { id: p.id, targetCrops: p.targetCrops }]));
  const missing = [...itemMeta.keys()].filter((nm) => !prodByName.has(nm));
  console.log(`  item names: ${itemMeta.size} · matched products: ${prodByName.size} · to create: ${missing.length}`);

  // ── Create missing products (name-derived crop for seeds) ──
  if (missing.length && !DRY) {
    const data = missing.map((nm) => { const m = itemMeta.get(nm)!; const isSeed = /SEED/i.test(m.mainCat) || /SEED/i.test(m.subCat) || cropFromItem(nm) != null; return { rawName: nm, name: nm, mainCategory: m.mainCat || null, subCategory: m.subCat || null, uom: m.uom || null, taxRate: m.taxRate || null, isSeed, cropTag: isSeed ? cropFromItem(nm) : null }; });
    for (let i = 0; i < data.length; i += 1000) await prisma.product.createMany({ data: data.slice(i, i + 1000), skipDuplicates: true });
    const reload = await prisma.product.findMany({ where: { rawName: { in: missing } }, select: { id: true, rawName: true, targetCrops: true } });
    for (const p of reload) prodByName.set(p.rawName, { id: p.id, targetCrops: p.targetCrops });
    console.log(`  created ${data.length} products`);
  }

  // crop for a line: SHEET ONLY — cleaned from the CSV's CROPS column (col AE). Client rule:
  // "only use the tagging given in the sheet, nothing else" (no name inference, no catalogue guess).
  const lineCrop = (cropsCell: string): string | null => cleanCrop(cropsCell);

  // ── Clear existing FY 26-27 lines (idempotent) ──
  if (!DRY) {
    const del = await prisma.saleLine.deleteMany({ where: { financialYear: FY_LABEL } });
    console.log(`  cleared ${del.count} existing ${FY_LABEL} SaleLines`);
  }

  // ── Build + insert SaleLines ──
  let buffer: Prisma.SaleLineCreateManyInput[] = [];
  let inserted = 0, noProduct = 0, noFarmer = 0, tagged = 0, badDate = 0;
  const flush = async () => { if (!buffer.length) return; if (!DRY) await prisma.saleLine.createMany({ data: buffer }); inserted += buffer.length; buffer = []; };
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const item = (row[C.item] || "").trim(); if (!item) continue;
    const prod = prodByName.get(item); if (!prod) { noProduct++; continue; } // only if DRY (real run created them)
    const phone = normMobile(row[C.mobile]);
    const farmerId = phone ? farmerByMobile.get(phone) ?? null : null; if (!farmerId) noFarmer++;
    const qty = parseNum(row[C.qty]);
    const total = parseNum(row[C.total]);
    const soldAt = parseBillDate(row[C.date]); if (!soldAt) badDate++;
    const crop = lineCrop(row[C.crops]); if (crop) tagged++;
    buffer.push({
      orderNo: (row[C.order] || "").trim(), productId: prod.id, itemRaw: item,
      store: (row[C.store] || "").trim() || null, storeId: storeByName.get(normName(row[C.store])) ?? null,
      farmerId, qty, returnQty: parseNum(row[C.retQty]), uom: (row[C.uom] || "").trim() || null,
      unitPrice: qty > 0 ? total / qty : null, totalPrice: total, basic: parseNum(row[C.taxable]),
      cgstRate: parseNum(row[C.cgstR]), sgstRate: parseNum(row[C.sgstR]), cgst: parseNum(row[C.cgstV]), sgst: parseNum(row[C.sgstV]),
      discount: parseNum(row[C.disc]), batchNo: (row[C.batch] || "").trim() || null,
      soldAt, financialYear: fyLabel((row[C.fy] || "").trim()),
      mainCategory: (row[C.mainCat] || "").trim() || null, subCategory: (row[C.subCat] || "").trim() || null,
      custName: (row[C.name] || "").trim() || null, custPhone: phone, b2b: false,
      cropTag: crop, source: "REAL" as const,
    });
    if (buffer.length >= 2000) await flush();
  }
  await flush();
  console.log(`\n  ${DRY ? "would insert" : "inserted"} ${inserted.toLocaleString()} SaleLines`);
  console.log(`  crop-tagged: ${tagged.toLocaleString()} (${(tagged / inserted * 100).toFixed(1)}%) · no farmer: ${noFarmer.toLocaleString()} · unparsed date: ${badDate.toLocaleString()}` + (DRY ? ` · no product (would be created): ${noProduct.toLocaleString()}` : ""));

  // ── Link saleId to existing FY26-27 bills ──
  if (!DRY) {
    const linked: number = await prisma.$executeRawUnsafe(`UPDATE "SaleLine" sl SET "saleId" = s."id" FROM "Sale" s WHERE s."invoice" = sl."orderNo" AND sl."saleId" IS NULL AND sl."financialYear" = '${FY_LABEL}'`);
    console.log(`  linked ${Number(linked).toLocaleString()} lines to existing Sale bills`);
    const orphan = await prisma.saleLine.count({ where: { financialYear: FY_LABEL, saleId: null } });
    console.log(`  lines still without a Sale bill: ${orphan.toLocaleString()}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
