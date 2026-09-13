"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, getSession } from "@/lib/auth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE, type SessionUser } from "@/lib/session-token";
import { ROLE_COOKIE } from "@/lib/session";
import {
  PRISMA_TO_KEY,
  KEY_TO_PRISMA,
  REQUESTABLE_ROLES,
  ROLE_GRAD,
  roleLabel,
  type RoleKey,
} from "@/lib/roles";
import { initials } from "@/lib/format";

export interface AuthResult {
  ok?: boolean;
  error?: string;
}

/** Employee codes are case-insensitive; store & compare uppercased. */
const normCode = (v: string) => v.trim().toUpperCase();

async function issueSession(user: {
  id: number;
  name: string;
  employeeCode: string | null;
  role: string;
  mustChangePassword: boolean;
}) {
  const roleKey = PRISMA_TO_KEY[user.role] ?? "officer";
  const payload: SessionUser = {
    userId: user.id,
    name: user.name,
    employeeCode: user.employeeCode ?? "",
    roleKey,
    isAdmin: user.role === "SYSADMIN",
    mustChangePassword: user.mustChangePassword,
  };
  const token = await signSession(payload);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function loginAction(formData: FormData): Promise<AuthResult> {
  const code = normCode(String(formData.get("employeeCode") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!code || !password) return { error: "Enter your employee code and password." };

  try {
    const user = await prisma.user.findUnique({ where: { employeeCode: code } });
    if (!user || !user.passwordHash) return { error: "Invalid employee code or password." };
    if (user.approvalStatus === "PENDING")
      return { error: "Your account is awaiting admin approval." };
    if (user.approvalStatus === "REJECTED")
      return { error: "Your access request was declined. Contact the administrator." };
    if (!user.active) return { error: "This account has been deactivated." };

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return { error: "Invalid employee code or password." };

    // Stamp real last-active time (drives the Users "Last active" column).
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    await issueSession(user);
    cookies().delete(ROLE_COOKIE);
    return { ok: true };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}

export async function registerAction(formData: FormData): Promise<AuthResult> {
  const name = String(formData.get("name") ?? "").trim();
  const code = normCode(String(formData.get("employeeCode") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const roleRaw = String(formData.get("role") ?? "officer") as RoleKey;

  if (!name || !code || !password) return { error: "All fields are required." };
  if (code.length < 3) return { error: "Enter a valid employee code." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const roleKey: RoleKey = REQUESTABLE_ROLES.some((r) => r.key === roleRaw)
    ? roleRaw
    : "officer";

  try {
    const existing = await prisma.user.findUnique({ where: { employeeCode: code } });
    if (existing) return { error: "An account with this employee code already exists." };

    const [gradA, gradB] = ROLE_GRAD[roleKey];
    await prisma.user.create({
      data: {
        name,
        employeeCode: code,
        passwordHash: await hashPassword(password),
        role: KEY_TO_PRISMA[roleKey] as never,
        roleLabel: roleLabel(roleKey),
        initials: initials(name),
        gradA,
        gradB,
        approvalStatus: "PENDING",
        active: true,
        source: "REAL",
        lastActive: "Just registered",
        visitsMtd: "—",
      },
    });
    return { ok: true };
  } catch {
    return { error: "Could not create the account. Please try again." };
  }
}

/** Set a new password (used by the forced first-login change). Re-signs the session. */
export async function changePasswordAction(formData: FormData): Promise<AuthResult> {
  const session = await getSession();
  if (!session) return { error: "Your session has expired. Please sign in again." };

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  try {
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(password), mustChangePassword: false },
    });
    await issueSession(user); // refresh token so mustChangePassword clears immediately
    return { ok: true };
  } catch {
    return { error: "Could not update your password. Please try again." };
  }
}

export async function logoutAction(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  cookies().delete(ROLE_COOKIE);
}
