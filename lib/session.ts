import { cache } from "react";
import { cookies } from "next/headers";
import {
  PERSONAS,
  ROLE_ORDER,
  roleLabel,
  roleGradient,
  type RoleKey,
  type Persona,
} from "./roles";
import { initials } from "./format";
import { getSession } from "./auth";

/** Admin-only "view as role" impersonation cookie. */
export const ROLE_COOKIE = "ua_role";

function impersonatedRole(): RoleKey | null {
  const v = cookies().get(ROLE_COOKIE)?.value as RoleKey | undefined;
  return v && (ROLE_ORDER as string[]).includes(v) ? v : null;
}

/** Effective role for nav/RBAC. Admins may impersonate any role; others get their own. */
/** The effective role (an admin's impersonated role wins). Memoised per request. */
export const getRole = cache(async (): Promise<RoleKey> => {
  const s = await getSession();
  if (!s) return "regional";
  if (s.isAdmin) {
    const imp = impersonatedRole();
    if (imp) return imp;
  }
  return s.roleKey;
});

/** Sidebar footer identity. Admin impersonating → the demo persona; else the real user. Memoised per request. */
export const getPersona = cache(async (): Promise<Persona> => {
  const s = await getSession();
  if (!s) return PERSONAS.regional;
  if (s.isAdmin) {
    const imp = impersonatedRole();
    if (imp) return PERSONAS[imp];
  }
  return {
    key: s.roleKey,
    name: s.name,
    role: roleLabel(s.roleKey),
    init: initials(s.name),
    color: roleGradient(s.roleKey),
  };
});
