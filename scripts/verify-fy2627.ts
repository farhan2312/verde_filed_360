/**
 * Snapshot of the FY-facing data used by the portal dropdowns/analytics, to verify an ingest.
 *   DOTENV_CONFIG_PATH=webapp/.env npx tsx -r dotenv/config scripts/verify-fy2627.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const fyLbl = (y: number) => `FY ${String(y % 100).padStart(2, "0")}-${String((y + 1) % 100).padStart(2, "0")}`;

async function main() {
  const saleFY = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE("financialYear",'(none)') fy, COUNT(*)::int n, MIN("soldAt") mn, MAX("soldAt") mx
     FROM "Sale" WHERE source='REAL' GROUP BY 1 ORDER BY 2 DESC`);
  console.log("── Sale bills by FY (REAL) ──");
  for (const r of saleFY) console.log(`  ${String(r.fy).padEnd(10)} ${String(r.n).padStart(7)}  ${r.mn ? String(r.mn).slice(0,10) : "-"} → ${r.mx ? String(r.mx).slice(0,10) : "-"}`);

  const lineFY = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE("financialYear",'(none)') fy, COUNT(*)::int n,
            COUNT("cropTag")::int tagged, MIN("soldAt") mn, MAX("soldAt") mx
     FROM "SaleLine" WHERE source='REAL' GROUP BY 1 ORDER BY 2 DESC`);
  console.log("\n── SaleLine by FY (REAL) — crop-tag coverage ──");
  for (const r of lineFY) console.log(`  ${String(r.fy).padEnd(10)} ${String(r.n).padStart(7)} lines · ${String(r.tagged).padStart(7)} crop-tagged (${(r.tagged/r.n*100).toFixed(1)}%)  ${r.mn?String(r.mn).slice(0,10):"-"} → ${r.mx?String(r.mx).slice(0,10):"-"}`);

  const years = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT (EXTRACT(YEAR FROM sl."soldAt")::int - CASE WHEN EXTRACT(MONTH FROM sl."soldAt") < 4 THEN 1 ELSE 0 END) y
     FROM "SaleLine" sl WHERE sl."soldAt" IS NOT NULL ORDER BY 1`);
  console.log("\n── FY dropdown options (Analytics facet — derived from SaleLine.soldAt) ──");
  console.log("  " + years.map((r) => `${r.y} = ${fyLbl(r.y)}`).join("   |   "));

  const [vseg, lseg] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE("valueSegment",'(null)') s, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' GROUP BY 1 ORDER BY 2 DESC`),
    prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE("lifecycleSegment",'(null)') s, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  console.log("\n── Farmer value segments ──   " + vseg.map((r) => `${r.s}:${r.n}`).join("  "));
  console.log("── Farmer lifecycle segments ── " + lseg.map((r) => `${r.s}:${r.n}`).join("  "));

  const topCrops = await prisma.$queryRawUnsafe<any[]>(
    `SELECT crop, COUNT(*)::int farmers FROM (SELECT unnest("salesCropTags") crop FROM "Farmer" WHERE source='REAL') t GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  const cropDropdown = await prisma.farmer.count({ where: { source: "REAL", salesCropTags: { isEmpty: false } } });
  console.log(`\n── Sales-crop dropdown (Farmer.salesCropTags) — ${cropDropdown.toLocaleString()} farmers tagged; top 15 ──`);
  for (const r of topCrops) console.log(`  ${String(r.crop).padEnd(16)} ${r.farmers}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
