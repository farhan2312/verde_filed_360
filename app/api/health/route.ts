import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { salesApiConfig } from "@/lib/sales-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sanitise a connection error so no credentials leak (Prisma messages can echo the URL). */
const clean = (m: string) => m.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgresql://<redacted>").replace(/\s+/g, " ").slice(0, 400);

/**
 * Deployment health check (no auth): confirms the server can reach Postgres and which env vars are
 * present — used to diagnose "Something went wrong" on a fresh host. Never returns secret values.
 */
export async function GET() {
  const t0 = Date.now();
  let db: { ok: boolean; ms: number; error?: string; users?: number } = { ok: false, ms: 0 };
  try {
    const users = await prisma.user.count();
    db = { ok: true, ms: Date.now() - t0, users };
  } catch (e) {
    db = { ok: false, ms: Date.now() - t0, error: clean(e instanceof Error ? e.message : String(e)) };
  }
  const url = process.env.DATABASE_URL ?? "";
  return NextResponse.json({
    ok: db.ok && !!process.env.AUTH_SECRET,
    db,
    env: {
      DATABASE_URL: !!url,
      DATABASE_URL_looksValid: /^postgres(ql)?:\/\/.+@.+:\d+\/.+/.test(url) && !url.startsWith('"'),
      DATABASE_URL_host: url.match(/@([^:/?]+)/)?.[1] ?? null,
      DIRECT_URL: !!process.env.DIRECT_URL,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      SALES_API_TOKEN: salesApiConfig().ready,
      CRON_SECRET: !!process.env.CRON_SECRET,
    },
    runtime: { node: process.version, vercelRegion: process.env.VERCEL_REGION ?? null, env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null },
  }, { status: db.ok ? 200 : 503 });
}
