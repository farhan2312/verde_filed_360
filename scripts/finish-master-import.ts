/**
 * Finish the master import after the streaming inserts:
 *  1) Backfill bill-level Sale for master bills NOT already present (efficient anti-join).
 *  2) Link SaleLine.saleId in id-range chunks (bounded, observable).
 *  3) Log the SalesImport row.
 * Safe to re-run (all steps are idempotent).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FILE_LABEL = "Verde Agrotech Master CRM May 2023-Mar 2026.xlsx";

async function main() {
  const t0 = Date.now();

  console.log("1) Backfilling missing Sale bills (group → anti-join)…");
  const backfilled = await prisma.$executeRawUnsafe(`
    WITH bills AS (
      SELECT sl."orderNo" ono,
             (array_agg(sl."farmerId"))[1] fid,
             MIN(sl."soldAt") minat,
             (array_agg(sl."itemRaw" ORDER BY sl."totalPrice" DESC))[1] topitem,
             COUNT(*) cnt,
             (array_agg(sl."mainCategory" ORDER BY sl."totalPrice" DESC))[1] cat,
             ROUND(SUM(sl."totalPrice"))::int amt,
             (array_agg(sl."store"))[1] store,
             (array_agg(sl."financialYear"))[1] fy
      FROM "SaleLine" sl
      WHERE sl."farmerId" IS NOT NULL AND sl."orderNo" <> ''
      GROUP BY sl."orderNo"
    )
    INSERT INTO "Sale" ("farmerId","invoice","soldAt","date","items","itemCount","category","amount","amountNum","store","financialYear","source","createdAt")
    SELECT b.fid, b.ono, b.minat, to_char(b.minat, 'DD Mon YYYY'),
           b.topitem || CASE WHEN b.cnt > 1 THEN ' · +' || (b.cnt - 1) || ' more' ELSE '' END,
           b.cnt::int, b.cat, '₹' || to_char(b.amt, 'FM999,999,999'), b.amt, b.store, b.fy, 'REAL'::"DataSource", now()
    FROM bills b
    WHERE NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s."invoice" = b.ono)`);
  console.log(`   backfilled ${Number(backfilled).toLocaleString()} bills (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  console.log("2) Linking SaleLine.saleId in chunks…");
  const maxRow = await prisma.$queryRawUnsafe<{ max: number | null }[]>(`SELECT MAX(id)::int max FROM "SaleLine"`);
  const maxId = maxRow[0]?.max ?? 0;
  let linked = 0;
  const STEP = 50000;
  for (let lo = 0; lo <= maxId; lo += STEP) {
    const hi = lo + STEP - 1;
    const r = await prisma.$executeRawUnsafe(
      `UPDATE "SaleLine" sl SET "saleId" = s."id" FROM "Sale" s
       WHERE s."invoice" = sl."orderNo" AND sl."saleId" IS NULL AND sl."id" BETWEEN ${lo} AND ${hi}`);
    linked += Number(r);
    process.stdout.write(`\r   linked ${linked.toLocaleString()} (up to id ${hi})`);
  }
  process.stdout.write("\n");

  console.log("3) Logging SalesImport…");
  const [lines, bills, farmersNew] = await Promise.all([
    prisma.saleLine.count(),
    prisma.$queryRawUnsafe<{ c: number }[]>(`SELECT COUNT(DISTINCT "orderNo")::int c FROM "SaleLine" WHERE "orderNo"<>''`),
    prisma.farmer.count({ where: { code: { startsWith: "C" }, source: "REAL" } }),
  ]);
  const range = await prisma.$queryRawUnsafe<{ mn: string | null; mx: string | null }[]>(
    `SELECT MIN("soldAt")::date::text mn, MAX("soldAt")::date::text mx FROM "SaleLine"`);
  await prisma.salesImport.deleteMany({ where: { uploadedBy: "master-import" } });
  await prisma.salesImport.create({ data: {
    filename: FILE_LABEL, fileType: "xlsx", fileSizeKb: 78192, uploadedBy: "master-import", status: "SUCCESS",
    lineItems: lines, bills: bills[0].c, newCustomers: farmersNew, salesInserted: lines, skipped: 201311,
    rangeStart: range[0].mn, rangeEnd: range[0].mx,
  } });

  console.log(`\n✓ Finished in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min. Sale total now:`, (await prisma.sale.count()).toLocaleString());
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
