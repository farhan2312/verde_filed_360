/**
 * Import Verde's ERP master exports (CSV, repo root) into Postgres.
 *
 *   npx tsx scripts/import-verde-masters.ts            # apply
 *   DRY=1 npx tsx scripts/import-verde-masters.ts      # print what would happen, write nothing
 *
 * Reads:
 *   retailer_master.csv → Store (24) + Employee (store contact per store)
 *   bdm_master.csv      → Employee (BDM) + User (REGIONAL login, code = bdm_code)
 *   user_master.csv     → User (PENDING, CENTRAL) for the plausible Verde staff; ERP-vendor /
 *                         UA / guest / duplicate rows are skipped and listed
 *
 * RM scope in the app is `Store.regionalManager == User.name` (lib/scope.ts), so the store's
 * `bdm_id` is written as the BDM's display name and the BDM User gets the identical name.
 *
 * Passwords in the exports are plaintext and are NOT imported: BDMs get their mobile as the
 * default password, user_master people get "verde@123"; everyone must change it on first login.
 * Idempotent: everything is upserted by code (Store.code / User.employeeCode); Employee rows
 * tagged REAL are replaced.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DRY = !!process.env.DRY;
const ROOT = process.cwd();

type Row = Record<string, string>;
const readCsv = (file: string): Row[] =>
  parse(fs.readFileSync(path.join(ROOT, file), "utf8"), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true });

const nul = (v: string | undefined | null) => {
  const s = String(v ?? "").trim();
  return s === "" || s === "NULL" ? null : s;
};
const digits = (v: string | null) => (v ?? "").replace(/\D/g, "");
/** Normalise Indian mobiles to 10 digits; null if not a valid 6-9xxxxxxxxx number. */
const mobile10 = (v: string | null): string | null => {
  let d = digits(v);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};
const PLACEHOLDER_MOBILE = "9687641497"; // ERP default stamped on many accounts
const oneLine = (s: string | null) => (s ? s.split(/\s+/).join(" ").replace(/\s*,\s*/g, ", ").trim() : null);
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_m, p, c) => p + c.toUpperCase()).replace(/\s+/g, " ").trim();
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Districts, as written in each store's own address line (retailer_master.address). */
const DISTRICT: Record<string, string | null> = {
  AGRO0001: "Gandhinagar", AGRO0008: "Sabarkantha", AGRO0010: "Narmada", AGRO0011: "Narmada",
  AGRO0039: "Anand", AGRO0040: "Anand", AGRO0041: "Anand", AGRO0042: "Anand", AGRO0043: "Vadodara",
  AGRO0044: "Vadodara", AGRO0055: "Surendranagar", AGRO0056: "Vadodara", AGRO0063: "Anand",
  AGRO0067: "Vadodara", AGRO0079: "Aravalli", AGRO0080: "Vadodara", AGRO0109: "Vadodara",
  AGRO0116: "Sabarkantha", AGRO0117: "Bharuch", AGRO0118: "Chhota Udepur", AGRO0119: "Sabarkantha",
  AGRO0122: "Kheda", AGRO0123: "Chhota Udepur", AGRO0125: null, // Guest_Verde — test/guest account, no real location
};

const GRADS: [string, string][] = [
  ["#7DA02E", "#A4C954"], ["#5C7D22", "#7DA02E"], ["#1565C0", "#42A5F5"], ["#7B1FA2", "#CE93D8"],
  ["#D4881F", "#EDA942"], ["#00695C", "#4DB6AC"], ["#4527A0", "#9575CD"], ["#AD1457", "#F06292"],
];

// user_master rows that are not Verde staff (skipped, reported)
const SKIP_USERS: Record<string, string> = {
  "1": "ERP vendor / shared admin (ajit.nandvana@hsrp.in, placeholder mobile)",
  "11": "ERP vendor (sanjana.desai@hsrp.in)",
  "6": "UA Agro account (UA_PRICE, store@uaagro.in)",
  "35": "guest account (guest_user_verde)",
  "41": "duplicate of #42 hemil_patel (same name, no email/mobile)",
};

async function main() {
  const retailers = readCsv("retailer_master.csv");
  const bdms = readCsv("bdm_master.csv");
  const users = readCsv("user_master.csv");
  console.log(`${DRY ? "[DRY RUN] " : ""}retailers=${retailers.length} bdms=${bdms.length} users=${users.length}\n`);

  // ── BDM display names (Store.regionalManager must equal User.name) ──
  const bdmName = new Map<string, string>();
  for (const b of bdms) bdmName.set(b.id, titleCase(b.name));

  // ── Stores ──
  console.log("Stores");
  const storeIdByErpId = new Map<string, number>();
  for (const r of retailers) {
    const code = nul(r.retailer_code)!;
    const rawName = nul(r.name)!;
    const name = /^[A-Z0-9 ()\-]+$/.test(rawName) ? titleCase(rawName) : rawName; // ANKLAV → Anklav; keep mixed-case as-is
    const pin = nul(r.pincode);
    const address = [oneLine(nul(r.address)), pin && !(nul(r.address) ?? "").includes(pin) ? pin : null].filter(Boolean).join(", ");
    const zone = code in DISTRICT ? DISTRICT[code] : null;
    const rm = bdmName.get(r.bdm_id) ?? null;
    const data = { name, status: r.status === "1" ? "Active" : "Inactive", zone, address: address || null, regionalManager: rm, source: "REAL" as const };
    console.log(`  ${code} ${name.padEnd(34)} zone=${(zone ?? "—").padEnd(14)} RM=${rm ?? "—"}`);
    if (!DRY) {
      const s = await prisma.store.upsert({ where: { code }, update: data, create: { code, ...data } });
      storeIdByErpId.set(r.id, s.id);
    }
  }

  // ── Employees (replace REAL rows) ──
  console.log("\nEmployees");
  if (!DRY) await prisma.employee.deleteMany({ where: { source: "REAL" } });
  const employees: Array<Record<string, unknown>> = [];
  for (const r of retailers) {
    const contact = nul(r.contact_name);
    if (!contact) continue;
    employees.push({
      name: titleCase(contact), storeCode: nul(r.retailer_code), storeId: storeIdByErpId.get(r.id) ?? null,
      mobile: mobile10(nul(r.contact_number)), email: null, designation: "Store Contact", post: "Store Contact", source: "REAL",
    });
  }
  for (const b of bdms) {
    employees.push({
      name: bdmName.get(b.id)!, storeCode: null, storeId: null, mobile: mobile10(nul(b.contact_number)),
      email: nul(b.email), designation: "BDM", post: "Business Development Manager", source: "REAL",
    });
  }
  console.log(`  ${employees.length} rows (${retailers.length} store contacts + ${bdms.length} BDMs)`);
  if (!DRY) await prisma.employee.createMany({ data: employees as never });

  // ── BDM logins (REGIONAL) ──
  console.log("\nBDM logins (role REGIONAL, approved, password = mobile, must change)");
  let g = 0;
  for (const b of bdms) {
    const code = nul(b.bdm_code)!;
    const name = bdmName.get(b.id)!;
    const mob = mobile10(nul(b.contact_number));
    const stores = retailers.filter((r) => r.bdm_id === b.id);
    const districts = [...new Set(stores.map((r) => DISTRICT[r.retailer_code]).filter(Boolean))];
    const territory = districts.length ? districts.join(", ") : "—";
    const [gradA, gradB] = GRADS[g++ % GRADS.length];
    const data = {
      name, role: "REGIONAL" as const, roleLabel: "Regional Manager", initials: initialsOf(name), gradA, gradB,
      workEmail: nul(b.email), mobile: mob, territory, active: b.status === "1",
      approvalStatus: "APPROVED" as const, mustChangePassword: true, source: "REAL" as const,
    };
    console.log(`  ${code.padEnd(8)} ${name.padEnd(20)} active=${data.active} stores=${stores.length} territory=${territory}`);
    if (!DRY) {
      const passwordHash = await bcrypt.hash(mob ?? "verde@123", 10);
      await prisma.user.upsert({ where: { employeeCode: code }, update: data, create: { employeeCode: code, passwordHash, ...data } });
    }
  }

  // ── user_master → PENDING central-team users ──
  console.log("\nuser_master");
  const bdmEmails = new Set(bdms.map((b) => (nul(b.email) ?? "").toLowerCase()));
  for (const u of users) {
    const name = nul(u.name)!;
    const email = nul(u.email);
    if (SKIP_USERS[u.id]) { console.log(`  skip  #${u.id.padEnd(3)} ${name.padEnd(20)} — ${SKIP_USERS[u.id]}`); continue; }
    if (email && bdmEmails.has(email.toLowerCase())) { console.log(`  skip  #${u.id.padEnd(3)} ${name.padEnd(20)} — already imported as BDM`); continue; }
    const code = nul(u.username)!.toUpperCase();
    let mob = mobile10(nul(u.mobile));
    if (mob === PLACEHOLDER_MOBILE) mob = null;
    if (u.id === "16") mob = mob ?? "6357958835"; // Dhiraj Kumar Sharma — Central Office contact number in retailer_master
    const display = titleCase(name);
    const [gradA, gradB] = GRADS[g++ % GRADS.length];
    const data = {
      name: display, role: "CENTRAL" as const, roleLabel: "Central Team", initials: initialsOf(display), gradA, gradB,
      workEmail: email && email.includes("@") ? email : null, mobile: mob, territory: "HQ",
      active: u.status === "1", approvalStatus: "PENDING" as const, mustChangePassword: true, source: "REAL" as const,
    };
    console.log(`  add   #${u.id.padEnd(3)} ${display.padEnd(20)} code=${code.padEnd(12)} admin_flag=${u.admin_flag} mobile=${mob ?? "—"} → PENDING`);
    if (!DRY) {
      const passwordHash = await bcrypt.hash("verde@123", 10);
      await prisma.user.upsert({ where: { employeeCode: code }, update: data, create: { employeeCode: code, passwordHash, ...data } });
    }
  }

  if (!DRY) {
    const [stores, emps, usersN] = await Promise.all([prisma.store.count(), prisma.employee.count(), prisma.user.count()]);
    console.log(`\nDone. DB now: stores=${stores} employees=${emps} users=${usersN}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
