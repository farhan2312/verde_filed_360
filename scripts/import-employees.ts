/**
 * Provision employee login accounts from the master data.
 *   npx tsx scripts/import-employees.ts           (dry run — reports only)
 *   npx tsx scripts/import-employees.ts --commit   (writes User rows to the DB)
 *
 * Sources:
 *   - empcodes.xlsx / EmployeeWithCodes         (agri officers + a few, with UA codes in EMPCode)
 *   - Verde Agrotech Master Data.xlsx:
 *       "4.Stores & Employee Mapping"            (authoritative employee ↔ store list, by mobile)
 *       "1 Stores Master Data"                   (store → zone → regional manager + RM code)
 *       "BDM&Store Master"                       (extra name/mobile → UA code list)
 *
 * Rules (per the product owner):
 *   - Agri Officer (AGC) + Store Manager (CI)  → role ASR  ("Agri Officer"), linked 1:1 to their store.
 *   - Regional Manager (BDM) + Area Sales Mgr  → role REGIONAL, linked to their zone(s).
 *   - Login = the employee's UA code; default password = their mobile number; mustChangePassword = true.
 *   - mobile + work email recorded; email kept in the non-unique `workEmail` field for later notifications.
 *   - Employees WITHOUT a UA code are written to an HR spreadsheet (hr-employees-need-codes.xlsx),
 *     not provisioned — HR will issue codes, then we run a second batch.
 */
import "dotenv/config";
import path from "node:path";
import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const ROOT = path.resolve(process.cwd(), ".."); // repo root (files sit next to /webapp)

const rd = (f: string) => xlsx.readFile(path.join(ROOT, f), { cellDates: true });
const J = (wb: xlsx.WorkBook, n: string): Record<string, unknown>[] =>
  xlsx.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: true });
const R1 = (wb: xlsx.WorkBook, n: string): unknown[][] =>
  (xlsx.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" }) as unknown[][]).filter((r) =>
    r.some((c) => String(c).trim() !== ""),
  );
const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const mob = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);
const codeOk = (c: unknown) => /^UA\d+$/i.test(String(c ?? "").trim());
const initialsOf = (name: string) =>
  name.split(" ").map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "NA";

type Role = "ASR" | "REGIONAL";
const GRAD: Record<Role, [string, string]> = {
  ASR: ["#1565C0", "#42A5F5"],
  REGIONAL: ["#93B93C", "#EDA942"],
};

async function main() {
  const emp = rd("empcodes.xlsx");
  const mas = rd("Verde Agrotech Master Data .xlsx");

  // ── code universe: mobile→code and name→code ──
  const mobToCode = new Map<string, string>();
  const nameToCode = new Map<string, string>();
  const put = (m: string, nm: string, code: unknown) => {
    const c = String(code).trim();
    if (!codeOk(c)) return;
    if (m.length === 10 && !mobToCode.has(m)) mobToCode.set(m, c.toUpperCase());
    if (nm && !nameToCode.has(nm)) nameToCode.set(nm, c.toUpperCase());
  };
  for (const r of J(emp, "EmployeeWithCodes")) put(mob(r["Mobile No"]), norm(r["Full name"]), r["EMPCode"]);
  const BS = R1(mas, "BDM&Store Master");
  const bh = (BS[0] as unknown[]).map((c) => String(c).trim());
  const iFull = bh.indexOf("Full name"), iCode = bh.indexOf("Employee_Code"), iM2 = bh.lastIndexOf("Mobileno");
  for (const r of BS.slice(1)) put(mob(r[iM2]), norm(r[iFull]), r[iCode]);

  // ── stores master: code→zone, RM name→code, RM code→zones ──
  const SM = R1(mas, "1 Stores Master Data");
  const sh = (SM[0] as unknown[]).map((c) => String(c).trim());
  const iSC = sh.indexOf("Store Code"), iZoneS = sh.indexOf("Zone"), iRM = sh.indexOf("Regional Manager"), iEmp = sh.indexOf("EMPCode");
  const rmCodeToZones = new Map<string, Set<string>>();
  for (const r of SM.slice(1)) {
    const code = String(r[iEmp]).trim().toUpperCase();
    const rm = norm(r[iRM]);
    const zone = String(r[iZoneS]).trim();
    if (codeOk(code)) {
      if (rm && !nameToCode.has(rm)) nameToCode.set(rm, code);
      if (!rmCodeToZones.has(code)) rmCodeToZones.set(code, new Set());
      if (zone) rmCodeToZones.get(code)!.add(zone);
    }
  }

  // ── DB stores: code→{id, zone, name} ──
  const dbStores = await prisma.store.findMany({ select: { id: true, code: true, name: true, zone: true } });
  const storeByCode = new Map(dbStores.map((s) => [s.code.trim().toUpperCase(), s]));
  // store NAME → code, to recover a link when the mapping row lacks a store code
  const nameToStoreCode = new Map<string, string>();
  for (const s of dbStores) nameToStoreCode.set(norm(s.name), s.code.trim().toUpperCase());

  // ── the 169 mapping ──
  const SE = R1(mas, "4.Stores & Employee Mapping");
  const eh = (SE[0] as unknown[]).map((c) => String(c).trim());
  const iS = eh.indexOf("Store Code"), iN = eh.indexOf("Employee"), iMo = eh.indexOf("Mobile No"),
    iEm = eh.indexOf("Email_Id"), iDes = eh.indexOf("Designation"), iPost = eh.indexOf("POST"),
    iSN = eh.indexOf("Store Name");

  const roleOf = (des: unknown, post: unknown): Role => {
    const d = norm(des), p = norm(post);
    if (d === "BDM" || p === "REGIONAL MANAGER" || d.includes("SALES") || p.includes("SALES")) return "REGIONAL";
    return "ASR"; // AGC (agri officer) + CI (store manager) combined
  };

  const assigned = new Set<string>(); // UA codes already claimed
  const provisioned: Array<{
    code: string; name: string; role: Role; mobile: string; workEmail: string;
    storeId: number | null; zone: string | null; territory: string | null;
  }> = [];
  const hrList: Array<Record<string, string>> = [];

  for (const r of SE.slice(1)) {
    const name = String(r[iN]).replace(/\s+/g, " ").trim();
    const m = mob(r[iMo]);
    const workEmail = String(r[iEm]).trim();
    const role = roleOf(r[iDes], r[iPost]);
    const storeCode = String(r[iS]).trim().toUpperCase();
    const store = storeByCode.get(storeCode) ?? storeByCode.get(nameToStoreCode.get(norm(String(r[iSN]))) ?? "");

    let code = (m.length === 10 && mobToCode.get(m)) || nameToCode.get(norm(name)) || null;
    const collision = code ? assigned.has(code) : false;

    if (!code || collision) {
      hrList.push({
        "Full Name": name, "Mobile No": m, Email: workEmail,
        Designation: String(r[iDes]).trim(), POST: String(r[iPost]).trim(),
        "Store Code": storeCode, "Store Name": String(r[iSN] ?? "").trim(),
        "System Role": role, Reason: collision ? `UA code ${code} already used by another employee` : "No UA code in master data",
      });
      continue;
    }
    assigned.add(code);

    let zone: string | null = store?.zone ?? null;
    let territory: string | null = store?.zone ?? null;
    if (role === "REGIONAL") {
      const zones = [...(rmCodeToZones.get(code) ?? new Set())];
      zone = zones[0] ?? zone;
      territory = zones.length ? zones.join(", ") : territory;
    }
    provisioned.push({
      code, name, role, mobile: m, workEmail,
      storeId: role === "ASR" ? store?.id ?? null : null,
      zone, territory,
    });
  }

  // ── report ──
  const byRole = (rl: Role) => provisioned.filter((p) => p.role === rl).length;
  const noStore = provisioned.filter((p) => p.role === "ASR" && p.storeId === null).length;
  console.log(`\n${COMMIT ? "COMMIT" : "DRY RUN"} — employee provisioning`);
  console.log("─────────────────────────────────────────────");
  console.log(`Provision now (have UA code): ${provisioned.length}`);
  console.log(`   • ASR (agri officers + store managers): ${byRole("ASR")}   (missing store link: ${noStore})`);
  console.log(`   • REGIONAL (regional + area sales):     ${byRole("REGIONAL")}`);
  console.log(`Sent to HR list (no code / collision):    ${hrList.length}`);
  console.log(`   HR breakdown by role:`, hrList.reduce((a, h) => ((a[h["System Role"]] = (a[h["System Role"]] || 0) + 1), a), {} as Record<string, number>));

  // ── write HR spreadsheet ──
  const hrPath = path.join(ROOT, "hr-employees-need-codes.xlsx");
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(hrList), "Need UA Codes");
  xlsx.writeFile(wb, hrPath);
  console.log(`\nHR list written → ${hrPath}  (${hrList.length} rows)`);

  console.log("\nSample of accounts to create:");
  for (const p of provisioned.slice(0, 5))
    console.log(`   ${p.code}  ${p.name}  [${p.role}]  store:${p.storeId ?? "-"}  zone:${p.zone ?? "-"}  pw:${p.mobile}`);

  if (!COMMIT) {
    console.log("\n(dry run — no DB writes. Re-run with --commit to create the accounts.)");
    return;
  }

  // ── upsert ──
  let created = 0, updated = 0;
  for (const p of provisioned) {
    const passwordHash = await bcrypt.hash(p.mobile || p.code, 10);
    const [gradA, gradB] = GRAD[p.role];
    const data = {
      name: p.name,
      role: p.role as never,
      roleLabel: p.role === "ASR" ? "Agri Officer" : "Regional Manager",
      initials: initialsOf(p.name),
      gradA, gradB,
      mobile: p.mobile || null,
      workEmail: p.workEmail || null,
      storeId: p.storeId,
      zone: p.zone,
      territory: p.territory,
      passwordHash,
      mustChangePassword: true,
      approvalStatus: "APPROVED" as const,
      active: true,
      source: "REAL" as const,
    };
    const existing = await prisma.user.findUnique({ where: { employeeCode: p.code }, select: { id: true } });
    await prisma.user.upsert({ where: { employeeCode: p.code }, update: data, create: { employeeCode: p.code, ...data } });
    existing ? updated++ : created++;
  }
  console.log(`\n✓ committed. created ${created}, updated ${updated}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
