import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { initials } from "@/lib/format";
import { shortStoreName, storeColor } from "@/lib/store-utils";
import { PRISMA_TO_KEY, roleLabel, type RoleKey } from "@/lib/roles";
import { UserManagementScreen } from "@/components/users/UserManagementScreen";
import { PendingApprovals, type PendingUser } from "@/components/users/PendingApprovals";
import type {
  UserRow,
  OfficerLite,
  StoreMgmtRow,
  StoreMgmtData,
} from "@/components/users/types";

export const dynamic = "force-dynamic";

/** A store counts as operational (should have an officer) only when Active. */
const isActive = (status: string) => status.trim().toLowerCase() === "active";

async function loadPending(): Promise<PendingUser[]> {
  try {
    const rows = await prisma.user.findMany({
      where: { approvalStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((u) => {
      const key = (PRISMA_TO_KEY[u.role] ?? "officer") as RoleKey;
      return {
        id: u.id,
        name: u.name,
        code: u.employeeCode ?? "",
        requestedRoleKey: key,
        requestedRoleLabel: u.roleLabel ?? roleLabel(key),
        when: u.lastActive ?? "recently",
      };
    });
  } catch {
    return [];
  }
}

/** Directory order: admins first, then RMs, then the (many) officers. */
const ROLE_SORT: Record<string, number> = { sysadmin: 0, central: 1, regional: 2, officer: 3 };

/** Human "last active" label from a real timestamp (sign-in or last visit). */
function relTime(d: Date | null | undefined): string {
  if (!d) return "Never";
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", timeZone: "Asia/Kolkata",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

async function loadUsers(): Promise<UserRow[]> {
  try {
    const [dbUsers, stores, visitAgg] = await Promise.all([
      prisma.user.findMany({ where: { approvalStatus: "APPROVED" }, orderBy: { id: "asc" } }),
      prisma.store.findMany({ select: { id: true, name: true } }),
      // Most recent visit each officer recorded — a real activity signal beyond sign-in.
      prisma.visit.groupBy({
        by: ["officerName"],
        where: { officerName: { not: null }, visitedAt: { not: null } },
        _max: { visitedAt: true },
      }),
    ]);
    const storeById = new Map(stores.map((s) => [s.id, shortStoreName(s.name) || s.name]));
    const visitByName = new Map(
      visitAgg.filter((v) => v.officerName).map((v) => [v.officerName!.trim().toUpperCase(), v._max.visitedAt]),
    );
    return dbUsers
      .map((u) => {
        // "Last active" = most recent of a live activity heartbeat, a real sign-in, and their last visit.
        const lastVisit = visitByName.get(u.name.trim().toUpperCase()) ?? null;
        const activeAt = [u.lastSeenAt, u.lastLoginAt, lastVisit]
          .filter((d): d is Date => d != null)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        return {
        id: u.id,
        init: u.initials ?? initials(u.name),
        name: u.name,
        email: u.employeeCode ?? u.email ?? "",
        employeeCode: u.employeeCode ?? "",
        mobile: u.mobile ?? "",
        workEmail: u.workEmail ?? "",
        roleLabel: u.roleLabel ?? "",
        roleKey: PRISMA_TO_KEY[u.role] ?? "officer",
        grad: `linear-gradient(135deg, ${u.gradA ?? "#7DA02E"}, ${u.gradB ?? "#BDD67F"})`,
        territory: u.territory ?? "",
        // storeId is a loose reference — a deleted store leaves a dangling id, so fall back to "—".
        storeName: u.storeId != null ? storeById.get(u.storeId) ?? "—" : "—",
        zone: u.zone ?? "",
        lastActive: relTime(activeAt),
        visitsMtd: u.visitsMtd ?? "—",
        status: u.active ? "Active" : "Inactive",
        };
      })
      // Default order: by role (admins → officers), then alphabetically by name.
      .sort((a, b) =>
        (ROLE_SORT[a.roleKey] ?? 9) - (ROLE_SORT[b.roleKey] ?? 9) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  } catch {
    return [];
  }
}

const EMPTY_STORE_ADMIN: StoreMgmtData = {
  rows: [],
  allOfficers: [],
  unassignedOfficers: [],
  regionals: [],
  totals: {
    total: 0, active: 0, mapped: 0, unmapped: 0, closed: 0,
    officersAssigned: 0, officersUnassigned: 0, farmersMapped: 0,
  },
};

async function loadStoreMgmt(): Promise<StoreMgmtData> {
  try {
    const [stores, asr, regional, groups] = await Promise.all([
      prisma.store.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true, code: true, name: true, status: true, zone: true,
          address: true, regionalManager: true, lat: true, lng: true,
        },
      }),
      prisma.user.findMany({
        where: { role: "ASR", approvalStatus: "APPROVED" },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, employeeCode: true, storeId: true,
          zone: true, active: true, initials: true, gradA: true, gradB: true,
        },
      }),
      prisma.user.findMany({
        where: { role: "REGIONAL", approvalStatus: "APPROVED" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, zone: true },
      }),
      prisma.farmer.groupBy({ by: ["storeId"], _count: { _all: true } }),
    ]);

    const farmerByStore = new Map<number, number>();
    let farmersMapped = 0;
    for (const g of groups) {
      if (g.storeId != null) {
        farmerByStore.set(g.storeId, g._count._all);
        farmersMapped += g._count._all;
      }
    }
    const validStoreIds = new Set(stores.map((s) => s.id));

    const toOfficer = (u: (typeof asr)[number]): OfficerLite => ({
      id: u.id,
      name: u.name,
      code: u.employeeCode ?? "",
      init: u.initials ?? initials(u.name),
      grad: `linear-gradient(135deg, ${u.gradA ?? "#1565C0"}, ${u.gradB ?? "#42A5F5"})`,
      active: u.active,
      zone: u.zone ?? "",
      storeId: u.storeId,
    });
    const allOfficers = asr.map(toOfficer);
    const officersByStore = new Map<number, OfficerLite[]>();
    const unassignedOfficers: OfficerLite[] = [];
    for (const o of allOfficers) {
      if (o.storeId != null && validStoreIds.has(o.storeId)) {
        const arr = officersByStore.get(o.storeId);
        if (arr) arr.push(o);
        else officersByStore.set(o.storeId, [o]);
      } else {
        unassignedOfficers.push(o); // unassigned or dangling (points at a deleted store)
      }
    }

    const rows: StoreMgmtRow[] = stores.map((s) => {
      const officers = officersByStore.get(s.id) ?? [];
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        shortName: shortStoreName(s.name),
        status: s.status,
        zone: s.zone ?? "",
        address: s.address ?? "",
        regionalManager: s.regionalManager ?? "",
        lat: s.lat,
        lng: s.lng,
        hasGps: s.lat != null && s.lng != null,
        color: storeColor(s.id),
        farmerCount: farmerByStore.get(s.id) ?? 0,
        officers,
        unmapped: isActive(s.status) && !officers.some((o) => o.active),
      };
    });

    const activeCount = stores.filter((s) => isActive(s.status)).length;
    const officersAssigned = allOfficers.filter(
      (o) => o.storeId != null && validStoreIds.has(o.storeId),
    ).length;

    return {
      rows,
      allOfficers,
      unassignedOfficers,
      regionals: regional.map((r) => ({ id: r.id, name: r.name, zone: r.zone ?? "" })),
      totals: {
        total: stores.length,
        active: activeCount,
        mapped: rows.filter((r) => !r.unmapped && isActive(r.status)).length,
        unmapped: rows.filter((r) => r.unmapped).length,
        closed: stores.length - activeCount,
        officersAssigned,
        officersUnassigned: unassignedOfficers.length,
        farmersMapped,
      },
    };
  } catch {
    return EMPTY_STORE_ADMIN;
  }
}

export default async function UsersPage() {
  const role = await getRole();
  const canEdit = role === "sysadmin";
  const [users, storeAdmin, pending] = await Promise.all([
    loadUsers(),
    loadStoreMgmt(),
    canEdit ? loadPending() : Promise.resolve([]),
  ]);

  return (
    <>
      {canEdit && <PendingApprovals pending={pending} />}
      <UserManagementScreen users={users} storeAdmin={storeAdmin} canEdit={canEdit} />
    </>
  );
}
