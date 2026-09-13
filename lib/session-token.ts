/**
 * Session token — signs/verifies the auth JWT. Edge-safe (jose only, no bcrypt,
 * no next/headers) so it can be used from middleware and server code alike.
 */
import { SignJWT, jwtVerify } from "jose";
import type { RoleKey } from "./roles";

export const SESSION_COOKIE = "verde_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  userId: number;
  name: string;
  employeeCode: string;
  roleKey: RoleKey;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: Number(payload.userId),
      name: String(payload.name),
      employeeCode: String(payload.employeeCode ?? ""),
      roleKey: payload.roleKey as RoleKey,
      isAdmin: Boolean(payload.isAdmin),
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
