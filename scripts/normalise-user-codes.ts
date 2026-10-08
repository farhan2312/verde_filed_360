/**
 * Normalise login codes to the VER scheme and remove accounts that are not Verde staff.
 *
 *   DRY=1 npx tsx scripts/normalise-user-codes.ts   # report only
 *   npx tsx scripts/normalise-user-codes.ts         # apply
 *
 * Every login becomes VER<number>, so the sign-in page can show "VER" as a fixed prefix and people
 * type only their number.
 *
 *   • VERDE<n>  → VER<n>      (admins and central staff keep their number, losing only the "DE")
 *   • BDM027    → VER074      (Ashish Budholiya is on the staff sheet; RENAMED, not recreated, so his
 *                              user id survives and the 13 stores pointing at him in Store.rmUserIds
 *                              stay linked)
 *   • everything else that is not already VER<n> is deleted — the unused ERP BDM accounts and the
 *     rejected central-team rows that came from the ERP user_master import.
 *
 * Deleting a manager would leave dangling ids in Store.rmUserIds, so those are stripped first and the
 * store's display label is rebuilt from whoever is left.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = !!process.env.DRY;

/** Codes to rename, old → new. Anything else non-VER is removed. */
const RENAME: Record<string, string> = {
  BDM027: "VER074", // Ashish Budholiya — ASM, on the staff sheet
};

const isVer = (code: string | null) => /^VER\d+$/i.test(code ?? "");
/** VERDE1234 → VER1234 (same number, "VERDE" prefix shortened to "VER"). */
const fromVerde = (code: string | null) => {
  const m = /^VERDE(\d+)$/i.exec(code ?? "");
  return m ? `VER${m[1]}` : null;
};

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, employeeCode: true, name: true, role: true, approvalStatus: true, active: true, lastLoginAt: true },
    orderBy: [{ role: "asc" }, { employeeCode: "asc" }],
  });

  const renames: { id: number; from: string; to: string; name: string; role: string }[] = [];
  const deletes: typeof users = [];
  const keeps: typeof users = [];

  for (const u of users) {
    const code = u.employeeCode;
    if (isVer(code)) { keeps.push(u); continue; }
    const target = RENAME[(code ?? "").toUpperCase()] ?? fromVerde(code);
    if (target) renames.push({ id: u.id, from: code ?? "", to: target, name: u.name, role: u.role });
    else deletes.push(u);
  }

  console.log(`${DRY ? "[DRY RUN] " : ""}users=${users.length}  already VER=${keeps.length}  rename=${renames.length}  delete=${deletes.length}\n`);

  // Guard: a rename must not collide with a code that is staying.
  const taken = new Set(keeps.map((u) => (u.employeeCode ?? "").toUpperCase()));
  for (const r of renames) {
    if (taken.has(r.to.toUpperCase())) throw new Error(`Rename ${r.from} → ${r.to} collides with an existing account.`);
    taken.add(r.to.toUpperCase());
  }
  // Guard: never leave the portal without a usable system admin.
  const survivingAdmins = [...keeps, ...renames.map((r) => users.find((u) => u.id === r.id)!)]
    .filter((u) => u.role === "SYSADMIN" && u.active && u.approvalStatus === "APPROVED");
  if (!survivingAdmins.length) throw new Error("Refusing to run: no active system admin would survive.");
  console.log(`System admins surviving: ${survivingAdmins.length}`);

  console.log("\nRENAME");
  for (const r of renames) console.log(`  ${r.from.padEnd(12)} → ${r.to.padEnd(10)} ${r.name} (${r.role})`);

  console.log("\nDELETE");
  for (const u of deletes) {
    console.log(`  ${(u.employeeCode ?? "(none)").padEnd(12)} ${u.name.padEnd(24)} ${u.role.padEnd(9)} ${u.approvalStatus}` +
      ` lastLogin=${u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : "never"}`);
  }
  const everLoggedIn = deletes.filter((u) => u.lastLoginAt);
  if (everLoggedIn.length) console.log(`  !! ${everLoggedIn.length} of these HAVE signed in before: ${everLoggedIn.map((u) => u.employeeCode).join(", ")}`);

  if (DRY) return;

  // 1. Renames first — the id is preserved, so Store.rmUserIds keeps working.
  for (const r of renames) await prisma.user.update({ where: { id: r.id }, data: { employeeCode: r.to } });

  // 2. Strip deleted managers out of Store.rmUserIds and rebuild each store's display label.
  const goneIds = new Set(deletes.map((u) => u.id));
  const stores = await prisma.store.findMany({ where: { rmUserIds: { isEmpty: false } }, select: { id: true, code: true, rmUserIds: true } });
  let touched = 0;
  for (const st of stores) {
    const left = st.rmUserIds.filter((id) => !goneIds.has(id));
    if (left.length === st.rmUserIds.length) continue;
    const names = await prisma.user.findMany({ where: { id: { in: left } }, select: { name: true }, orderBy: { name: "asc" } });
    await prisma.store.update({
      where: { id: st.id },
      data: { rmUserIds: left, regionalManager: names.map((n) => n.name.trim()).filter(Boolean).join(", ") || null },
    });
    console.log(`  store ${st.code}: managers ${st.rmUserIds.length} → ${left.length}`);
    touched++;
  }
  if (touched) console.log(`  (${touched} store(s) had a removed manager stripped from rmUserIds)`);

  // 3. Clear the legacy name link for stores whose only manager is being deleted.
  const goneNames = deletes.map((u) => u.name.trim()).filter(Boolean);
  if (goneNames.length) {
    const r = await prisma.store.updateMany({
      where: { rmUserIds: { isEmpty: true }, regionalManager: { in: goneNames } },
      data: { regionalManager: null },
    });
    if (r.count) console.log(`  cleared the stale regionalManager name on ${r.count} store(s)`);
  }

  // 4. Delete the accounts.
  const del = await prisma.user.deleteMany({ where: { id: { in: [...goneIds] } } });
  console.log(`\nDeleted ${del.count} account(s).`);

  const after = await prisma.user.findMany({ select: { employeeCode: true, role: true } });
  const bad = after.filter((u) => !isVer(u.employeeCode));
  console.log(`Remaining: ${after.length} account(s); non-VER codes left: ${bad.length ? bad.map((u) => u.employeeCode).join(", ") : "none"}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
