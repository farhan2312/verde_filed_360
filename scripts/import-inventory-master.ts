/**
 * Import the "Inventory Master_with Crop Mapping" xlsx into the Product catalog.
 *
 * Keyed by Item Code. All 20 master columns land on Product. Rows that match an
 * already-sold product (by normalized name) ENRICH that product in place — preserving
 * its sales rollups and identity (rawName/name/category); every other master row is
 * created as a new zero-sales catalog product. Idempotent: re-running upserts by itemCode.
 *
 *   npx tsx scripts/import-inventory-master.ts "C:/path/to/Inventory Master.xlsx"
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { cleanTargetCrops, cleanTargetPests } from "../lib/crop-pest";

const prisma = new PrismaClient();
const FILE = process.argv[2] || "C:/Users/Cosmos/Downloads/Inventory Master_with Crop Mapping (1).xlsx";
const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const str = (v: unknown) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };

async function main() {
  console.log("Reading", FILE);
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
    .slice(1).filter((r) => Array.isArray(r) && r.some((c) => c != null));
  console.log(`  ${rows.length} master rows`);

  // Column indices (fixed layout of this master).
  const C = { code: 0, clean: 1, cat: 2, sub: 3, brand: 4, pack: 5, uom: 6, hsn: 7, gst: 8,
    tech: 9, ai: 10, crops: 11, pests: 12, alt: 13, conf: 14, quality: 15, status: 16,
    origName: 17, origBrand: 18, origDesc: 19 };

  // Existing products → match sold ones by normalized name (preserve their rollups/identity).
  const existing = await prisma.product.findMany({ select: { id: true, rawName: true } });
  const byNorm = new Map<string, number>();
  for (const p of existing) { const k = norm(p.rawName); if (!byNorm.has(k)) byNorm.set(k, p.id); }
  const usedRaw = new Set(existing.map((p) => norm(p.rawName)));
  const claimed = new Set<number>();

  const updates: { id: number; data: Record<string, unknown> }[] = [];
  const creates: Record<string, unknown>[] = [];
  const seenCode = new Set<string>();

  for (const r of rows) {
    const itemCode = str(r[C.code]);
    if (!itemCode || seenCode.has(itemCode)) continue; // Item Code is the key + must be unique
    seenCode.add(itemCode);

    // Master columns common to both update + create.
    const master = {
      itemCode,
      brand: str(r[C.brand]),
      packSize: str(r[C.pack]),
      hsnCode: str(r[C.hsn]),
      technicalName: str(r[C.tech]),
      activeIngredients: str(r[C.ai]),
      targetCrops: cleanTargetCrops(str(r[C.crops])),
      targetPests: cleanTargetPests(str(r[C.pests])),
      targetCropsRaw: str(r[C.crops]),
      targetPestsRaw: str(r[C.pests]),
      alternativeProducts: str(r[C.alt]),
      mappingConfidence: str(r[C.conf]),
      qualityFlag: str(r[C.quality]),
      statusFlag: str(r[C.status]),
      originalItemName: str(r[C.origName]),
      originalBrand: str(r[C.origBrand]),
      originalDescription: str(r[C.origDesc]),
    };

    // Match an unclaimed sold product by original OR clean name.
    const hit = [norm(r[C.origName]), norm(r[C.clean])]
      .map((n) => byNorm.get(n))
      .find((id) => id != null && !claimed.has(id));

    if (hit != null) {
      claimed.add(hit);
      // Enrich in place — DON'T touch rawName/name/category (sales identity + analytics).
      updates.push({ id: hit, data: master });
    } else {
      // New catalog product — take identity from the master.
      let rawName = str(r[C.origName]) || str(r[C.clean]) || itemCode;
      if (usedRaw.has(norm(rawName))) rawName = `${rawName} (${itemCode})`;
      usedRaw.add(norm(rawName));
      creates.push({
        rawName,
        name: str(r[C.clean]) || rawName,
        mainCategory: str(r[C.cat]),
        subCategory: str(r[C.sub]),
        uom: str(r[C.uom]),
        taxRate: num(r[C.gst]),
        ...master,
      });
    }
  }

  console.log(`  enriching ${updates.length} sold products · creating ${creates.length} new catalog products`);

  // Apply updates with bounded concurrency.
  let done = 0;
  for (let i = 0; i < updates.length; i += 20) {
    await Promise.all(updates.slice(i, i + 20).map((u) => prisma.product.update({ where: { id: u.id }, data: u.data as never })));
    done += Math.min(20, updates.length - i);
    process.stdout.write(`\r  updated ${done}/${updates.length}`);
  }
  process.stdout.write("\n");

  // Insert new products in batches (skipDuplicates guards any rawName collision).
  let created = 0;
  for (let i = 0; i < creates.length; i += 1000) {
    const res = await prisma.product.createMany({ data: creates.slice(i, i + 1000) as never, skipDuplicates: true });
    created += res.count;
    process.stdout.write(`\r  created ${created}/${creates.length}`);
  }
  process.stdout.write("\n");

  const [total, withCode, withPests] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { itemCode: { not: null } } }),
    prisma.product.count({ where: { targetPests: { isEmpty: false } } }),
  ]);
  console.log(`\nProducts: total=${total} · withItemCode=${withCode} · withTargetPests=${withPests}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
