/**
 * Resolve the store link for provisioned ASR officers that ended up with no storeId.
 *   npx tsx scripts/fix-officer-stores.ts            (dry run — reports proposed matches)
 *   npx tsx scripts/fix-officer-stores.ts --commit    (applies storeId + zone)
 *
 * Match order per officer (by mobile): mapping Store Code → empcodes "Map-Store"
 * name → mapping "Store Name", each resolved against the DB stores (code or
 * normalised name).
 */
import "dotenv/config";
import path from "node:path";
import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const ROOT = path.resolve(process.cwd(), "..");
const rd = (f: string) => xlsx.readFile(path.join(ROOT, f), { cellDates: true });
const J = (wb: xlsx.WorkBook, n: string): Record<string, unknown>[] =>
  xlsx.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: true });
const mob = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);
const nkey = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); // name key: strip spaces/parens
const codeKey = (s: unknown) => String(s ?? "").trim().toUpperCase();

async function main() {
  // Officers provisioned without a store link.
  const orphans = await prisma.user.findMany({
    where: { role: "ASR", source: "REAL", storeId: null, mustChangePassword: true },
    select: { id: true, employeeCode: true, name: true, mobile: true },
  });
  console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} — ${orphans.length} ASR officers missing a store link\n`);

  const stores = await prisma.store.findMany({ select: { id: true, code: true, name: true, zone: true } });
  const byCode = new Map(stores.map((s) => [codeKey(s.code), s]));
  const byName = new Map(stores.map((s) => [nkey(s.name), s]));

  const emp = rd("empcodes.xlsx");
  const mas = rd("Verde Agrotech Master Data .xlsx");
  const empByMob = new Map<string, Record<string, unknown>>();
  for (const r of J(emp, "EmployeeWithCodes")) empByMob.set(mob(r["Mobile No"]), r);
  const mapByMob = new Map<string, Record<string, unknown>>();
  for (const r of J(mas, "4.Stores & Employee Mapping")) mapByMob.set(mob(r["Mobile No"]), r);

  const resolve = (o: { mobile: string | null }) => {
    const m = mob(o.mobile);
    const map = mapByMob.get(m) ?? {};
    const empr = empByMob.get(m) ?? {};
    const tries: Array<[string, ReturnType<typeof byCode.get>]> = [
      [`map.StoreCode=${map["Store Code"] ?? ""}`, byCode.get(codeKey(map["Store Code"]))],
      [`empcodes.Map-Store=${empr["Map-Store"] ?? ""}`, byName.get(nkey(empr["Map-Store"]))],
      [`map.StoreName=${map["Store Name"] ?? ""}`, byName.get(nkey(map["Store Name"]))],
    ];
    for (const [via, hit] of tries) if (hit) return { via, store: hit };
    return { via: "no match", store: null };
  };

  let fixed = 0;
  for (const o of orphans) {
    const { via, store } = resolve(o);
    console.log(`${o.employeeCode}  ${o.name}  (mob ${o.mobile})`);
    console.log(`   → ${store ? `${store.code} ${store.name} [${store.zone}]  via ${via}` : "UNRESOLVED — " + via}`);
    if (store && COMMIT) {
      await prisma.user.update({ where: { id: o.id }, data: { storeId: store.id, zone: store.zone, territory: store.zone } });
      fixed++;
    } else if (store) fixed++;
  }
  console.log(`\n${COMMIT ? "applied" : "resolvable"}: ${fixed}/${orphans.length}`);
  if (!COMMIT) console.log("(dry run — re-run with --commit to apply)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
