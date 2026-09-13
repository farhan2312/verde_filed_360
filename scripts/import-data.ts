/**
 * Import REAL master data from the Excel workbooks into Postgres.
 *
 *   npm run db:import
 *
 * Reads:
 *   data/master-data.xlsx   — stores, store GPS, 88k farmers, employees
 *   data/field-options.xlsx — 22 visit-form field option sets
 *
 * Idempotent: stores/employees/field-options are upserted; farmers are inserted
 * with skipDuplicates so re-runs don't error.
 */
import "dotenv/config";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), "data");

type Row = Record<string, unknown>;

function readSheet(file: string, sheet: string): Row[] {
  const wb = XLSX.readFile(path.join(DATA_DIR, file));
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet "${sheet}" not found in ${file}`);
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: true });
  // Normalise keys: trim whitespace
  return rows.map((r) => {
    const o: Row = {};
    for (const k of Object.keys(r)) o[k.trim()] = r[k];
    return o;
  });
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function importStores() {
  const stores = readSheet("master-data.xlsx", "1 Stores Master Data");
  const gps = readSheet("master-data.xlsx", "2. Stores GPS");
  const gpsByCode = new Map<string, { lat: number | null; lng: number | null }>();
  for (const g of gps) {
    const code = str(g["Store Code"]);
    if (code) gpsByCode.set(code, { lat: num(g["LAT"]), lng: num(g["LOG"]) });
  }

  let n = 0;
  for (const s of stores) {
    const code = str(s["Store Code"]);
    if (!code) continue;
    const geo = gpsByCode.get(code) ?? { lat: null, lng: null };
    await prisma.store.upsert({
      where: { code },
      update: {
        name: str(s["Store Name"]) ?? code,
        status: str(s["Status"]) ?? "Active",
        zone: str(s["Zone"]),
        address: str(s["Address"]),
        empCode: str(s["EMPCode"]),
        regionalManager: str(s["Regional Manager"]),
        lat: geo.lat,
        lng: geo.lng,
        source: "REAL",
      },
      create: {
        code,
        name: str(s["Store Name"]) ?? code,
        status: str(s["Status"]) ?? "Active",
        zone: str(s["Zone"]),
        address: str(s["Address"]),
        empCode: str(s["EMPCode"]),
        regionalManager: str(s["Regional Manager"]),
        lat: geo.lat,
        lng: geo.lng,
        source: "REAL",
      },
    });
    n++;
  }
  console.log(`  ✓ stores: ${n} (with ${gpsByCode.size} GPS rows joined)`);
}

async function importEmployees() {
  const rows = readSheet("master-data.xlsx", "4.Stores & Employee Mapping");
  const stores = await prisma.store.findMany({ select: { id: true, code: true } });
  const storeIdByCode = new Map(stores.map((s) => [s.code, s.id]));

  // Replace existing real employees to keep it idempotent
  await prisma.employee.deleteMany({ where: { source: "REAL" } });

  const data = rows
    .map((r) => {
      const name = str(r["Employee"]);
      if (!name) return null;
      const storeCode = str(r["Store Code"]);
      return {
        name,
        storeCode,
        storeId: storeCode ? storeIdByCode.get(storeCode) ?? null : null,
        mobile: str(r["Mobile No"]),
        email: str(r["Email_Id"]),
        designation: str(r["Designation"]),
        post: str(r["POST"]),
        source: "REAL" as const,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  await prisma.employee.createMany({ data: data as never });
  console.log(`  ✓ employees: ${data.length}`);
}

async function importFarmers() {
  const rows = readSheet("master-data.xlsx", "3.Farmer Master Data");
  const stores = await prisma.store.findMany({
    select: { id: true, code: true, zone: true },
  });
  const storeByCode = new Map(stores.map((s) => [s.code, s]));

  const data = rows
    .map((r) => {
      const code = str(r["Farmer Code"]);
      const name = str(r["Farmer Name"]);
      if (!code || !name) return null;
      const storeCode = str(r["Store Code"]);
      const store = storeCode ? storeByCode.get(storeCode) : undefined;
      return {
        code,
        name,
        mobile: str(r["Mobile No."]),
        village: str(r["Vilage Name"]),
        storeCode,
        storeId: store?.id ?? null,
        zone: store?.zone ?? null,
        district: store?.zone ?? null,
        source: "REAL" as const,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  // Bulk insert in chunks
  const CHUNK = 4000;
  let inserted = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const batch = data.slice(i, i + CHUNK);
    const res = await prisma.farmer.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
    inserted += res.count;
    process.stdout.write(`\r  … farmers: ${inserted}/${data.length}`);
  }
  process.stdout.write("\n");
  console.log(`  ✓ farmers: ${inserted}`);
}

/** Multi-select fields in the New Visit wizard (arrays in the design form state). */
const MULTISELECT = new Set([
  "Product",
  "Product Required",
  "Crop",
  "Water Source",
  "Current Problem",
  "Crop Risk",
  "Danger Zone",
]);
const TOGGLE = new Set([
  "Crop Insured",
  "Dairy Services",
  "FPO Member",
  "Interested in Contract Farming",
  "WhatsApp Available",
  "Soil Testing",
]);

function inputTypeFor(field: string, raw: string): string {
  if (TOGGLE.has(field)) return "toggle";
  if (/free\s*text/i.test(raw)) return "freetext";
  if (MULTISELECT.has(field)) return "multiselect";
  return "dropdown";
}

async function importFieldOptions() {
  const rows = readSheet("field-options.xlsx", "Sheet1");
  let n = 0;
  for (const r of rows) {
    const field = str(r["Field Name"]);
    const raw = str(r["Selection Options"]);
    if (!field || !raw) continue;
    const freetext = /free\s*text/i.test(raw);
    const options = freetext
      ? []
      : raw
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean);
    await prisma.fieldOption.upsert({
      where: { fieldName: field },
      update: { options, inputType: inputTypeFor(field, raw) },
      create: { fieldName: field, options, inputType: inputTypeFor(field, raw) },
    });
    n++;
  }
  console.log(`  ✓ field options: ${n}`);
}

async function main() {
  console.log("Importing real master data → Postgres …");
  await importStores();
  await importEmployees();
  await importFieldOptions();
  await importFarmers();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
