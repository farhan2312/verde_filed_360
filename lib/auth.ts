/**
 * Auth helpers (server / node runtime). Password hashing (bcrypt) + reading the
 * current session from the request cookies.
 */
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  SESSION_COOKIE,
  verifySession,
  type SessionUser,
} from "./session-token";

export type { SessionUser } from "./session-token";

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
