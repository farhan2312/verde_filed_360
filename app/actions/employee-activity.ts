"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { shortStoreName } from "@/lib/store-utils";

export interface EmployeeRow {
  id: number;
  name: string;
  code: string | null;
  mobile: string | null;
  role: string;            // display label
  territory: string;       // store short name or zone
  active: boolean;         // account status
  activeInPeriod: boolean; // did field work OR logged in during the window
  periodVisits: number;
  totalVisits: number;
  lastVisitAt: string | null;
  lastLoginAt: string | null;
  lastActiveAt: string | null; // max(lastVisit, lastLogin)
  memberSince: string | null;  // createdAt
}

export interface EmployeeActivity {
  kpis: { total: number; activeAccounts: number; inactiveAccounts: number; activeInPeriod: number };
  employees: EmployeeRow[];
  inactive: EmployeeRow[];
  windowLabel: string;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Employee activity analytics (sysadmin-only). Per-employee field stats (visits) in a date window plus
 * account status, last login, and tenure. Visits are attributed by officerName == user.name.
 */
export async function getEmployeeActivity(fromDate?: string, toDate?: string): Promise<EmployeeActivity | null> {
  if ((await getRole()) !== "sysadmin") return null;

  const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const to = toDate ? new Date(`${toDate}T00:00:00`) : null;
  const toExcl = to ? new Date(to.getTime() + 86_400_000) : null; // end-inclusive
  const windowLabel = from || to ? `${fromDate ?? "…"} → ${toDate ?? "…"}` : "All time";

  // Real employee accounts (DEMO seed rows excluded).
  const users = await prisma.user.findMany({
    where: { source: "REAL" },
    select: { id: true, name: true, roleLabel: true, role: true, employeeCode: true, mobile: true, storeId: true, zone: true, territory: true, active: true, lastLoginAt: true, lastSeenAt: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  const storeIds = [...new Set(users.map((u) => u.storeId).filter((x): x is number => x != null))];
  const stores = storeIds.length ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : [];
  const storeName = new Map(stores.map((s) => [s.id, shortStoreName(s.name) || s.name]));

  // Period visit stats by officer (window-bounded), and all-time totals.
  const periodWhere: Prisma.VisitWhereInput = { officerName: { not: null } };
  if (from || toExcl) periodWhere.visitedAt = { ...(from ? { gte: from } : {}), ...(toExcl ? { lt: toExcl } : {}) };

  const [periodGrp, totalGrp] = await Promise.all([
    prisma.visit.groupBy({ by: ["officerName"], where: periodWhere, _count: { _all: true }, _max: { visitedAt: true } }),
    prisma.visit.groupBy({ by: ["officerName"], where: { officerName: { not: null } }, _count: { _all: true }, _max: { visitedAt: true } }),
  ]);
  const key = (s: string) => s.trim().toLowerCase();
  const periodByName = new Map(periodGrp.map((g) => [key(g.officerName!), { n: g._count._all, last: g._max.visitedAt }]));
  const totalByName = new Map(totalGrp.map((g) => [key(g.officerName!), { n: g._count._all, last: g._max.visitedAt }]));

  const rows: EmployeeRow[] = users.map((u) => {
    const p = periodByName.get(key(u.name)) ?? { n: 0, last: null as Date | null };
    const t = totalByName.get(key(u.name)) ?? { n: 0, last: null as Date | null };
    const inWin = (d: Date | null) => !!(d && (!from || d >= from) && (!toExcl || d < toExcl));
    const loggedInPeriod = inWin(u.lastLoginAt) || inWin(u.lastSeenAt);
    const lastActive = [t.last, u.lastLoginAt, u.lastSeenAt].filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;
    return {
      id: u.id, name: u.name, code: u.employeeCode, mobile: u.mobile,
      role: u.roleLabel || u.role,
      territory: (u.storeId != null ? storeName.get(u.storeId) : null) || u.zone || u.territory || "—",
      active: u.active,
      activeInPeriod: p.n > 0 || loggedInPeriod,
      periodVisits: p.n, totalVisits: t.n,
      lastVisitAt: iso(t.last), lastLoginAt: iso(u.lastLoginAt),
      lastActiveAt: iso(lastActive ?? null), memberSince: iso(u.createdAt),
    };
  });

  const activeAccounts = rows.filter((r) => r.active).length;
  return {
    kpis: {
      total: rows.length,
      activeAccounts,
      inactiveAccounts: rows.length - activeAccounts,
      activeInPeriod: rows.filter((r) => r.activeInPeriod).length,
    },
    employees: rows,
    inactive: rows.filter((r) => !r.active),
    windowLabel,
  };
}
