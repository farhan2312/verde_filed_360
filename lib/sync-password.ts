import { createHash, timingSafeEqual } from "crypto";

/**
 * Static password gate for the MANUAL "Run sync now" button (env SALES_SYNC_PASSWORD).
 * It is an extra confirmation on top of the sysadmin check — not a replacement for auth.
 * If the env var is unset/blank the gate is DISABLED (manual sync stays sysadmin-only) so a deployment
 * that hasn't set it yet can't lock admins out. The scheduled cron authenticates with CRON_SECRET and
 * never goes through this.
 */
export function syncPasswordRequired(): boolean {
  return (process.env.SALES_SYNC_PASSWORD || "").trim().length > 0;
}

/** True when no password is configured, or the supplied one matches (constant-time). */
export function syncPasswordOk(supplied: unknown): boolean {
  const required = (process.env.SALES_SYNC_PASSWORD || "").trim();
  if (!required) return true;
  const a = createHash("sha256").update(typeof supplied === "string" ? supplied.trim() : "").digest();
  const b = createHash("sha256").update(required).digest();
  return timingSafeEqual(a, b);
}
