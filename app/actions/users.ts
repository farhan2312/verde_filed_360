"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  KEY_TO_PRISMA,
  ROLE_GRAD,
  ROLE_ORDER,
  roleLabel,
  type RoleKey,
} from "@/lib/roles";

async function requireAdmin() {
  const s = await getSession();
  if (!s?.isAdmin) throw new Error("Not authorized");
  return s;
}

function isRoleKey(k: string): k is RoleKey {
  return (ROLE_ORDER as string[]).includes(k);
}

const initialsOf = (name: string) =>
  name.split(" ").map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "NA";

/* ─────────────── Pending approvals ─────────────── */

/** Approve a pending registration and assign a role. */
export async function approveUserAction(id: number, roleKey: string) {
  await requireAdmin();
  if (!isRoleKey(roleKey)) return;
  const [gradA, gradB] = ROLE_GRAD[roleKey];
  await prisma.user.update({
    where: { id },
    data: {
      approvalStatus: "APPROVED",
      role: KEY_TO_PRISMA[roleKey] as never,
      roleLabel: roleLabel(roleKey),
      gradA,
      gradB,
      active: true,
      lastActive: "Approved",
    },
  });
  revalidatePath("/users");
}

/** Decline a pending registration. */
export async function rejectUserAction(id: number) {
  await requireAdmin();
  await prisma.user.update({
    where: { id },
    data: { approvalStatus: "REJECTED", active: false },
  });
  revalidatePath("/users");
}

/** Change an approved user's role. */
export async function setUserRoleAction(id: number, roleKey: string) {
  await requireAdmin();
  if (!isRoleKey(roleKey)) return;
  const [gradA, gradB] = ROLE_GRAD[roleKey];
  await prisma.user.update({
    where: { id },
    data: {
      role: KEY_TO_PRISMA[roleKey] as never,
      roleLabel: roleLabel(roleKey),
      gradA,
      gradB,
    },
  });
  revalidatePath("/users");
}

/** Activate / deactivate a user. */
export async function setUserActiveAction(id: number, active: boolean) {
  await requireAdmin();
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/users");
}

/* ─────────────── Create / Edit / Delete (System Admin) ─────────────── */

export interface UserFormInput {
  employeeCode: string;
  name: string;
  roleKey: string;
  mobile: string;
  workEmail: string;
  territory: string;
  active: boolean;
  /** New/reset password. Blank on create → their mobile; blank on edit → keep current. */
  password: string;
}

/** Create a login-ready account (approved, forced password change on first login). */
export async function createUserAction(
  input: UserFormInput,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  await requireAdmin();
  const code = input.employeeCode.trim().toUpperCase();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "Employee code is required." };
  if (!name) return { ok: false, error: "Name is required." };
  if (!isRoleKey(input.roleKey)) return { ok: false, error: "Select a role." };
  const key = input.roleKey;
  const mobile = input.mobile.replace(/\D/g, "");
  try {
    const clash = await prisma.user.findUnique({ where: { employeeCode: code }, select: { id: true } });
    if (clash) return { ok: false, error: `Employee code ${code} already exists.` };
    const [gradA, gradB] = ROLE_GRAD[key];
    const passwordHash = await bcrypt.hash(input.password.trim() || mobile || "verde@123", 10);
    const created = await prisma.user.create({
      data: {
        employeeCode: code,
        name,
        role: KEY_TO_PRISMA[key] as never,
        roleLabel: roleLabel(key),
        initials: initialsOf(name),
        gradA,
        gradB,
        mobile: mobile || null,
        workEmail: input.workEmail.trim() || null,
        territory: input.territory.trim() || null,
        passwordHash,
        mustChangePassword: true,
        approvalStatus: "APPROVED",
        active: input.active,
        source: "REAL",
        lastActive: "Just added",
      },
      select: { id: true },
    });
    revalidatePath("/users");
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Create failed" };
  }
}

/** Update an existing user's details (System-Admin edit modal). */
export async function saveUser(
  input: UserFormInput & { id: number },
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const code = input.employeeCode.trim().toUpperCase();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  try {
    if (code) {
      const clash = await prisma.user.findFirst({
        where: { employeeCode: code, NOT: { id: input.id } },
        select: { id: true },
      });
      if (clash) return { ok: false, error: `Employee code ${code} is already used by someone else.` };
    }
    const data: Prisma.UserUpdateInput = {
      name,
      employeeCode: code || null,
      mobile: input.mobile.replace(/\D/g, "") || null,
      workEmail: input.workEmail.trim() || null,
      territory: input.territory.trim() || null,
      active: input.active,
    };
    if (isRoleKey(input.roleKey)) {
      const [gradA, gradB] = ROLE_GRAD[input.roleKey];
      data.role = KEY_TO_PRISMA[input.roleKey] as never;
      data.roleLabel = roleLabel(input.roleKey);
      data.gradA = gradA;
      data.gradB = gradB;
    }
    if (input.password.trim()) {
      data.passwordHash = await bcrypt.hash(input.password.trim(), 10);
      data.mustChangePassword = true;
    }
    await prisma.user.update({ where: { id: input.id }, data });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

/** Permanently delete a user account (can't delete yourself). */
export async function deleteUserAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const s = await requireAdmin();
  if (s.userId === id) return { ok: false, error: "You can't delete your own account." };
  try {
    await prisma.user.delete({ where: { id } });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

export interface UserActivityRow { id: number; ts: string; action: string; entity: string; detail: string; ip: string }

/**
 * Recent audit-trail entries attributed to an employee (matched by actor name — the AuditLog is
 * keyed by actor name, not user id). Returns [] when none are recorded. NB: granular login history
 * is not captured by the current AuditLog schema — only actions that write an AuditLog row appear.
 */
export async function getUserActivity(actorName: string): Promise<UserActivityRow[]> {
  const name = actorName?.trim();
  if (!name) return [];
  try {
    const logs = await prisma.auditLog.findMany({
      where: { actor: { equals: name, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return logs.map((l) => ({
      id: l.id,
      ts: l.displayTs ?? l.createdAt.toISOString().slice(0, 16).replace("T", " "),
      action: l.action,
      entity: l.entity ?? "",
      detail: l.detail ?? "",
      ip: l.ip ?? "",
    }));
  } catch {
    return [];
  }
}
