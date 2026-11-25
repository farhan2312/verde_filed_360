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
    // WhatsApp: presence only, never a value. `wa.ready` is what the app itself gates sending on;
    // `verifyToken` false is the usual reason Meta's webhook "Verify and save" returns 403, since the
    // handshake compares against this var on the DEPLOYED build (env changes need a redeploy).
    // `tokenLooksQuoted` catches a value pasted into Vercel with its quotes still attached.
    wa: (() => {
      const t = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
      const bare = t.replace(/^['"]|['"]$/g, "");
      return {
        ready: !!bare && !!(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim(),
        accessToken: !!t,
        tokenLooksQuoted: !!t && t !== bare,
        phoneNumberId: !!(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim(),
        wabaId: !!(process.env.WHATSAPP_WABA_ID ?? "").trim(),
        appSecret: !!(process.env.WHATSAPP_APP_SECRET ?? "").trim(),
        verifyToken: !!(process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim(),
        appUrl: process.env.APP_URL ?? null,
      };
    })(),
    runtime: { node: process.version, vercelRegion: process.env.VERCEL_REGION ?? null, env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null },
  }, { status: db.ok ? 200 : 503 });
}
