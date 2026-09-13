"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLE_COOKIE } from "@/lib/session";
import { getSession } from "@/lib/auth";
import { ROLE_ORDER, type RoleKey } from "@/lib/roles";

/** Admin-only "view as role" impersonation. Non-admins cannot change their role. */
export async function setRoleAction(role: RoleKey) {
  const session = await getSession();
  if (!session?.isAdmin) return;
  if (!(ROLE_ORDER as string[]).includes(role)) return;
  cookies().set(ROLE_COOKIE, role, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

/** Stop impersonating — return to the admin's own role. */
export async function clearRoleAction() {
  cookies().delete(ROLE_COOKIE);
  revalidatePath("/", "layout");
}
