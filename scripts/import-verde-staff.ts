/**
 * Import the Verde staff list (ASM / BDM / centre staff with EMP IDs) into Postgres.
 *
 *   npx tsx scripts/import-verde-staff.ts            # apply
 *   DRY=1 npx tsx scripts/import-verde-staff.ts      # print what would happen, write nothing
 *   FILE="C:/path/to/list.xlsx" npx tsx scripts/import-verde-staff.ts
 *
 * Source: "VERDE CURRENT STAFF LIST WITH EMP IDs" — a merged-cell sheet with three EMP ID columns
 * (ASM, BDM, employee). Hierarchy is ASM > BDM > centre staff; most centres have no deputed BDM.
 *
 * What it writes:
 *   • Store.regionalManager — the deputed BDM where there is one, otherwise the ASM. Centres under
 *     the currently VACANT ASM slot with no BDM get no RM (cleared), since RM scoping is by name
 *     (lib/scope.ts matches Store.regionalManager against User.name).
 *   • Store — creates the Dhansura centre, which exists in the staff list but not in the ERP
 *     retailer master, under a clearly temporary code until the ERP issues a real AGRO code.
 *   • Employee — rebuilt from the staff list; ERP store contacts are kept only when they are not
 *     the same person under a different spelling.
 *   • User — one ASR (Agri Officer) login per staff member, code = their VER id, default password =
 *     their mobile, forced change on first sign-in. BDMs in the staff list who have no login yet get
 *     a REGIONAL one. Nobody with an existing login is duplicated or deactivated.
 *
 * Idempotent: stores and users are upserted by code; Employee rows tagged REAL are replaced.
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DRY = !!process.env.DRY;
const FILE = process.env.FILE || "C:/Users/Cosmos/Documents/VERDE CURRENT STAFF LIST WITH EMP IDs- 07.10.2026.xlsx";

const nul = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" || s === "NULL" ? null : s;
};
/** First meaningful line of a merged manager cell ("Name\nCONTACT NO : …\nDOB : …"). */
const leadName = (s: string) =>
  s.split(/\r?\n/)[0].replace(/\(.*?\)/g, "").replace(/\b(CONTACT|Contact|DOB)\b.*$/i, "").replace(/\s+/g, " ").trim();
const mobile10 = (v: unknown): string | null => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_m, p, c) => p + c.toUpperCase()).replace(/\s+/g, " ").trim();
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const key = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

/** Staff-list centre name → Store.code. The spellings differ from the ERP retailer master. */
const CENTRE_TO_STORE: Record<string, string> = {
  ODE: "AGRO0039", SAVLI: "AGRO0043", KAPADWANJ: "AGRO0122", JHALUNDH: "AGRO0042",
  ANKLAV: "AGRO0063", PETLAD: "AGRO0041", MODASA: "AGRO0079", DHANSURA: "TBD-DHANSURA",
  IDAR: "AGRO0008", DEDIAPADA: "AGRO0010", DHRANGADHRA: "AGRO0055", KINKLOD: "AGRO0040",
  MAHUVAD: "AGRO0067", VADALI: "AGRO0116", ASHRAM: "AGRO0119", SARSA: "AGRO0117",
  RAJPIPLA: "AGRO0011", SEGWA: "AGRO0109", SIMALIYA: "AGRO0080", NASWADI: "AGRO0118",
  DHOLAR: "AGRO0044", GOLAMADI: "AGRO0123",
};

/** Dhansura is in the staff list but not the ERP retailer master — created under a temporary code. */
const DHANSURA = {
  code: "TBD-DHANSURA", name: "Dhansura", zone: "Aravalli", status: "Active",
  address: "Dhansura, Aravalli, Gujarat (awaiting ERP retailer code)",
};

const GRADS: [string, string][] = [
  ["#7DA02E", "#A4C954"], ["#5C7D22", "#7DA02E"], ["#1565C0", "#42A5F5"], ["#7B1FA2", "#CE93D8"],
  ["#D4881F", "#EDA942"], ["#00695C", "#4DB6AC"], ["#4527A0", "#9575CD"], ["#AD1457", "#F06292"],
];

interface Staff {
  asm: string | null; asmId: string | null;
  bdm: string | null; bdmId: string | null; // null bdm = "Not Deputed"
  centre: string; name: string; code: string | null; mobile: string | null; rawMobile: string | null;
}

function readStaff(): { staff: Staff[]; vacancies: string[] } {
  const rows = XLSX.utils.sheet_to_json<(string | null)[]>(
    XLSX.readFile(FILE).Sheets[XLSX.readFile(FILE).SheetNames[0]],
    { header: 1, defval: null, raw: false },
  ).slice(1);

  const staff: Staff[] = [];
  const vacancies: string[] = [];
  let asm: string | null = null, asmId: string | null = null;
  let bdm: string | null = null, bdmId: string | null = null;
  let centre: string | null = null;

  for (const r of rows) {
    // Merged manager cells: a new value starts a new block; the EMP ID may sit on a later row of it.
    if (nul(r[0])) {
      const v = leadName(String(r[0]));
      asm = /^VACANT$/i.test(v) ? null : titleCase(v);
      asmId = null;
    }
    if (nul(r[1])) asmId = nul(r[1]);
    if (nul(r[2])) {
      const v = leadName(String(r[2]));
      bdm = /not deputed/i.test(v) ? null : titleCase(v);
      bdmId = null;
    }
    if (nul(r[3])) bdmId = nul(r[3]);
    if (nul(r[4])) centre = String(r[4]).trim().toUpperCase();

    const name = nul(r[5]);
    if (!name || !centre) continue;
    if (/^VACANT/i.test(name)) { vacancies.push(centre); continue; }
    staff.push({
      asm, asmId, bdm, bdmId, centre, name: titleCase(name),
      code: nul(r[6])?.toUpperCase() ?? null,
      mobile: mobile10(r[7]), rawMobile: nul(r[7]),
    });
  }
  return { staff, vacancies };
}

async function main() {
  const { staff, vacancies } = readStaff();
  console.log(`${DRY ? "[DRY RUN] " : ""}staff=${staff.length} vacancies=${vacancies.length} (${vacancies.join(", ")})\n`);

  // ── Dhansura centre ──
  if (!DRY) {
    await prisma.store.upsert({
      where: { code: DHANSURA.code },
      update: { name: DHANSURA.name, zone: DHANSURA.zone, address: DHANSURA.address },
      create: { ...DHANSURA, source: "REAL" },
    });
  }
  console.log(`Store: ${DHANSURA.code} ${DHANSURA.name} (${DHANSURA.zone}) — temporary code, replace when the ERP issues one`);

  // ── Regional manager per centre: deputed BDM, else ASM, else none ──
  console.log("\nStore.regionalManager");
  const rmByCentre = new Map<string, string | null>();
  for (const s of staff) if (!rmByCentre.has(s.centre)) rmByCentre.set(s.centre, s.bdm ?? s.asm ?? null);
  let cleared = 0;
  for (const [centre, rm] of [...rmByCentre.entries()].sort()) {
    const code = CENTRE_TO_STORE[centre];
    if (!code) { console.log(`  !! ${centre}: no store mapping — skipped`); continue; }
    const via = rm ? (staff.find((s) => s.centre === centre)!.bdm ? "BDM" : "ASM") : "none (ASM slot vacant)";
    console.log(`  ${centre.padEnd(12)} ${code.padEnd(13)} ${(rm ?? "—").padEnd(20)} ${via}`);
    if (rm == null) cleared++;
    if (!DRY) await prisma.store.update({ where: { code }, data: { regionalManager: rm } }).catch(() => {});
  }
  console.log(`  (${cleared} centre(s) left without an RM until the vacant ASM slot is filled)`);

  // ── Employees: staff list is authoritative; keep ERP store contacts only if not the same person ──
  const storeRows = await prisma.store.findMany({ select: { id: true, code: true } });
  const storeIdByCode = new Map(storeRows.map((s) => [s.code, s.id]));
  // Drop an ERP store contact when the staff list already has that person — matched on mobile, or on
  // a shared surname+given-name pair, since the two sources spell names differently
  // ("Nayan Patel" vs "Nayankumar Patel").
  const staffKeys = new Set(staff.map((s) => key(s.name)));
  const staffMobiles = new Set(staff.map((s) => s.mobile).filter(Boolean) as string[]);
  const tokens = (n: string) => new Set(n.toUpperCase().split(/\s+/).filter((t) => t.length > 3));
  const staffTokenSets = staff.map((s) => tokens(s.name));
  const samePerson = (name: string, mob: string | null) => {
    if (mob && staffMobiles.has(mob)) return true;
    if (staffKeys.has(key(name))) return true;
    const t = tokens(name);
    if (t.size === 0) return false;
    // Two or more shared name tokens, or one shared token that is the whole of a short name.
    return staffTokenSets.some((st) => {
      const shared = [...t].filter((x) => st.has(x) || [...st].some((y) => y.startsWith(x) || x.startsWith(y)));
      return shared.length >= 2;
    });
  };
  const existingContacts = await prisma.employee.findMany({ where: { source: "REAL", designation: "Store Contact" } });
  const keptContacts = existingContacts.filter((e) => !samePerson(e.name, e.mobile));

  // A manager's EMP ID often sits on a later row of their merged block, so fill it in when it appears.
  const managers = new Map<string, { name: string; code: string | null; role: "ASM" | "BDM" }>();
  const noteManager = (name: string | null, code: string | null, role: "ASM" | "BDM") => {
    if (!name) return;
    const k = key(name);
    const cur = managers.get(k);
    if (!cur) managers.set(k, { name, code, role });
    else if (!cur.code && code) cur.code = code;
  };
  for (const s of staff) { noteManager(s.asm, s.asmId, "ASM"); noteManager(s.bdm, s.bdmId, "BDM"); }

  const employees: Record<string, unknown>[] = [
    ...staff.map((s) => ({
      name: s.name, storeCode: CENTRE_TO_STORE[s.centre] ?? null,
      storeId: storeIdByCode.get(CENTRE_TO_STORE[s.centre] ?? "") ?? null,
      mobile: s.mobile, email: null, designation: "Agri Officer", post: s.code ?? "Agri Officer", source: "REAL",
    })),
    ...[...managers.values()].map((m) => ({
      name: m.name, storeCode: null, storeId: null, mobile: null, email: null,
      designation: m.role, post: m.code ?? m.role, source: "REAL",
    })),
    ...keptContacts.map((e) => ({
      name: e.name, storeCode: e.storeCode, storeId: e.storeId, mobile: e.mobile, email: e.email,
      designation: e.designation, post: e.post, source: "REAL",
    })),
  ];
  console.log(`\nEmployees: ${staff.length} staff + ${managers.size} manager(s) + ${keptContacts.length} ERP store contact(s) kept` +
    ` (${existingContacts.length - keptContacts.length} dropped as duplicates of staff-list people)`);
  if (!DRY) {
    await prisma.employee.deleteMany({ where: { source: "REAL" } });
    await prisma.employee.createMany({ data: employees as never });
  }

  // ── Logins ──
  console.log("\nLogins");
  const existingUsers = await prisma.user.findMany({ select: { name: true, employeeCode: true } });
  const userByName = new Map(existingUsers.map((u) => [key(u.name), u.employeeCode]));
  let g = 0, made = 0;
  const skipped: string[] = [];

  // Managers from the staff list (ASM / BDM) → REGIONAL, unless they already have a login.
  for (const m of managers.values()) {
    const already = userByName.get(key(m.name));
    if (already) { console.log(`  skip  ${(m.code ?? "—").padEnd(8)} ${m.name.padEnd(22)} already has a login (${already})`); continue; }
    if (!m.code) { skipped.push(`${m.name} (${m.role}, no EMP ID)`); continue; }
    const [gradA, gradB] = GRADS[g++ % GRADS.length];
    const centres = [...new Set(staff.filter((s) => key(s.bdm ?? s.asm ?? "") === key(m.name)).map((s) => s.centre))];
    const data = {
      name: m.name, role: "REGIONAL" as const, roleLabel: "Regional Manager", initials: initialsOf(m.name),
      gradA, gradB, mobile: null, territory: centres.map(titleCase).join(", ") || "—", active: true,
      approvalStatus: "APPROVED" as const, mustChangePassword: true, source: "REAL" as const,
    };
    console.log(`  add   ${m.code.padEnd(8)} ${m.name.padEnd(22)} REGIONAL  centres=${centres.length}`);
    if (!DRY) {
      const passwordHash = await bcrypt.hash("verde@123", 10);
      await prisma.user.upsert({ where: { employeeCode: m.code }, update: data, create: { employeeCode: m.code, passwordHash, ...data } });
    }
    made++;
  }

  // Centre staff → ASR (Agri Officer). Password = mobile; fall back when the mobile is unusable.
  for (const s of staff) {
    if (!s.code) { skipped.push(`${s.name} (${s.centre}, no EMP ID)`); continue; }
    const storeCode = CENTRE_TO_STORE[s.centre] ?? null;
    const [gradA, gradB] = GRADS[g++ % GRADS.length];
    const data = {
      name: s.name, role: "ASR" as const, roleLabel: "Agri Officer", initials: initialsOf(s.name), gradA, gradB,
      mobile: s.mobile, storeId: storeIdByCode.get(storeCode ?? "") ?? null, territory: titleCase(s.centre),
      active: true, approvalStatus: "APPROVED" as const, mustChangePassword: true, source: "REAL" as const,
    };
    if (!s.mobile) console.log(`  warn  ${s.code.padEnd(8)} ${s.name.padEnd(22)} mobile "${s.rawMobile ?? ""}" unusable — password falls back to verde@123`);
    if (!DRY) {
      const passwordHash = await bcrypt.hash(s.mobile ?? "verde@123", 10);
      await prisma.user.upsert({ where: { employeeCode: s.code }, update: data, create: { employeeCode: s.code, passwordHash, ...data } });
    }
    made++;
  }
  console.log(`  ${made} login(s) created/updated`);
  if (skipped.length) console.log(`  NOT created (no EMP ID): ${skipped.join("; ")}`);

  if (!DRY) {
    const [stores, emps, users, asrs] = await Promise.all([
      prisma.store.count(), prisma.employee.count(), prisma.user.count(), prisma.user.count({ where: { role: "ASR" } }),
    ]);
    console.log(`\nDone. DB now: stores=${stores} employees=${emps} users=${users} (agri officers=${asrs})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
