/**
 * Append a period of raw line-item sales (CSV) into Postgres WITHOUT wiping history.
 *
 *   npx tsx scripts/import-newsales.ts
 *
 * Unlike import-sales.ts (which clears ALL source=REAL sales), this:
 *   • aggregates CSV line-items into bills (grouped by Order No),
 *   • creates Farmer records for customer mobiles not already on file
 *     (so new customers land in the book and the "New" segment is correct),
 *   • deletes only existing REAL sales in the file's date range (idempotent re-run),
 *   • inserts the bills as Sale rows joined to farmers by mobile.
 *
 * Source file + range are read from the CSV itself; safe to re-run.
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CSV =
  process.env.SALES_CSV ||
  "C:/Users/Cosmos/Documents/verde_field_360/Customer Wise Sales 1 April To 30th June.csv";
/** Only REAL sales on/after this date are cleared before re-insert (idempotency). */
const RANGE_START = "2026-04-01";

/** Minimal RFC-4180 CSV parser (handles quoted commas + escaped quotes). */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normMobile(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = String(v).replace(/\D/g, "");
  if (s.length > 10) s = s.slice(-10);
  return s.length === 10 && "6789".includes(s[0]) ? s : null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
function toIso(billDate: string): string | null {
  // Accepts 2- or 4-digit years ("01-Apr-26" or "01-Apr-2026"); 2-digit → 20YY.
  const m = billDate.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yyyy}-${mm}-${m[1].padStart(2, "0")}`;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const normName = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
const fyLabel = (fy: string) => (/^\d{4}$/.test(fy) ? `FY ${fy.slice(0, 2)}-${fy.slice(2)}` : fy || null);

interface Bill {
  order: string;
  total: number;
  itemNames: string[];
  category: string | null;
  dateIso: string | null;
  dateStr: string;
  mobile: string | null;
  store: string;
  name: string;
  village: string;
  fy: string;
}

async function chunkedCreate(table: "farmer" | "sale", data: Record<string, unknown>[]) {
  const CHUNK = 5000;
  let inserted = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    const res =
      table === "farmer"
        ? await prisma.farmer.createMany({ data: slice as never, skipDuplicates: true })
        : await prisma.sale.createMany({ data: slice as never, skipDuplicates: true });
    inserted += res.count;
    process.stdout.write(`\r  ${table} inserted: ${inserted}/${data.length}`);
  }
  process.stdout.write("\n");
  return inserted;
}

async function main() {
  console.log(`Reading ${CSV} …`);
  const raw = fs.readFileSync(CSV, "utf-8").replace(/^﻿/, "");
  const rows = parseCSV(raw);
  const header = rows[0].map((h) => h.trim().replace(/^﻿/, ""));
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iOrder = col("Order No"), iItem = col("Item Name"), iCat = col("MainCategory"),
    iTotal = col("Total"), iDate = col("BillDate"), iMobile = col("Cus Mobile"),
    iStore = col("Retailer Name"), iName = col("Cus Name"), iVillage = col("Cus Village"),
    iFy = col("Financial Year");

  // ── Aggregate line-items → bills ──
  const bills = new Map<string, Bill>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const order = (row[iOrder] || "").trim();
    if (!order) continue;
    let b = bills.get(order);
    if (!b) {
      b = {
        order, total: 0, itemNames: [], category: (row[iCat] || "").trim() || null,
        dateIso: toIso(row[iDate] || ""), dateStr: (row[iDate] || "").trim(),
        mobile: normMobile(row[iMobile]), store: (row[iStore] || "").trim(),
        name: (row[iName] || "").trim(), village: (row[iVillage] || "").trim(),
        fy: (row[iFy] || "").trim(),
      };
      bills.set(order, b);
    }
    b.total += parseFloat((row[iTotal] || "0").replace(/[^0-9.\-]/g, "")) || 0;
    const item = (row[iItem] || "").trim();
    if (item) b.itemNames.push(item);
  }
  const billArr = [...bills.values()];
  console.log(`  ${rows.length - 1} line-items → ${billArr.length} bills`);

  // ── Store name → {id, code, zone} for linking new farmers ──
  const stores = await prisma.store.findMany({ select: { id: true, code: true, name: true, zone: true } });
  const storeByName = new Map(stores.map((s) => [normName(s.name), s]));

  // ── Farmer mobile → id ──
  const loadFarmers = async () => {
    const map = new Map<string, number>();
    const fs2 = await prisma.farmer.findMany({ select: { id: true, mobile: true } });
    for (const f of fs2) { const m = normMobile(f.mobile); if (m && !map.has(m)) map.set(m, f.id); }
    return map;
  };
  let mobileToId = await loadFarmers();
  console.log(`  ${mobileToId.size} existing farmer mobiles on file`);

  // ── Create farmers for new customer mobiles ──
  const newByMobile = new Map<string, Bill>();
  for (const b of billArr) {
    if (!b.mobile || mobileToId.has(b.mobile) || newByMobile.has(b.mobile)) continue;
    newByMobile.set(b.mobile, b);
  }
  const newFarmerData = [...newByMobile.values()].map((b) => {
    const st = storeByName.get(normName(b.store));
    return {
      code: `FARMQ127-${b.mobile}`,
      name: (b.name || "New Customer").toUpperCase(), // name cleansing — store farmers in CAPS
      mobile: b.mobile,
      village: b.village || null,
      district: st?.zone || null,
      zone: st?.zone || null,
      storeId: st?.id ?? null,
      storeCode: st?.code ?? null,
      source: "REAL" as const,
    };
  });
  console.log(`New customers to create: ${newFarmerData.length}`);
  if (newFarmerData.length) await chunkedCreate("farmer", newFarmerData);
  mobileToId = await loadFarmers(); // reload to pick up new ids

  // ── Clear existing REAL sales in range (idempotent), then insert ──
  const del = await prisma.sale.deleteMany({
    where: { source: "REAL", soldAt: { gte: new Date(`${RANGE_START}T00:00:00Z`) } },
  });
  console.log(`Cleared ${del.count} existing REAL sales on/after ${RANGE_START}`);

  let matched = 0, unmatched = 0;
  const saleData: Record<string, unknown>[] = [];
  for (const b of billArr) {
    if (!b.mobile) { unmatched++; continue; }
    const farmerId = mobileToId.get(b.mobile);
    if (!farmerId) { unmatched++; continue; }
    matched++;
    const first = b.itemNames[0] ?? "Item";
    saleData.push({
      farmerId,
      invoice: b.order,
      date: b.dateStr || null,
      soldAt: b.dateIso ? new Date(`${b.dateIso}T00:00:00Z`) : null,
      items: b.itemNames.length > 1 ? `${first} · +${b.itemNames.length - 1} more` : first,
      itemCount: b.itemNames.length || null,
      category: b.category,
      amount: inr(b.total),
      amountNum: Math.round(b.total),
      store: b.store || null,
      financialYear: fyLabel(b.fy),
      source: "REAL" as const,
    });
  }
  const inserted = await chunkedCreate("sale", saleData);

  console.log(
    `\nDone. bills=${billArr.length} matched=${matched} unmatched(no mobile)=${unmatched} ` +
      `newFarmers=${newFarmerData.length} salesInserted=${inserted}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
