/**
 * Auth helpers (server / node runtime). Password hashing (bcrypt) + reading the
 * current session from the request cookies.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  SESSION_COOKIE,
  verifySession,
  type SessionUser,
} from "./session-token";

export type { SessionUser } from "./session-token";

/**
 * The signed-in user, from the session cookie.
 *
 * Memoised per request with React's `cache`: getRole / getScope / getActor sit on top of this and are
 * called from the layout, the page and every server action it runs, so a single render used to verify
 * the same JWT dozens of times. The cache lives for one request only, so a changed cookie (sign-in,
 * sign-out, an admin switching persona) is always picked up on the next one.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
});

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
