/**
 * Seed the internal login account (employee-code based).
 *   npm run db:accounts
 *
 * - VERDE999 / verde999 → System Admin (super admin)
 * Approved, no forced password change. Real users are created after the employee import
 * (or approved from the Users page once they self-register).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ACCOUNTS = [
  { code: "VERDE999", pw: "verde999", name: "Verde Agrotech Admin", role: "SYSADMIN", label: "System Admin", gradA: "#5C7D22", gradB: "#7DA02E", territory: "All Regions" },
] as const;

async function main() {
  for (const a of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(a.pw, 10);
    const data = {
      name: a.name,
      role: a.role as never,
      roleLabel: a.label,
      initials: a.code.replace(/[^A-Z0-9]/g, "").slice(-2),
      gradA: a.gradA,
      gradB: a.gradB,
      passwordHash,
      mustChangePassword: false,
      approvalStatus: "APPROVED" as const,
      active: true,
      territory: a.territory,
      lastActive: "Just now",
      visitsMtd: "—",
      source: "REAL" as const,
    };
    await prisma.user.upsert({
      where: { employeeCode: a.code },
      update: data,
      create: { employeeCode: a.code, ...data },
    });
    console.log(`  ✓ ${a.code} / ${a.pw}  (${a.label})`);
  }

  console.log("Accounts ready.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
