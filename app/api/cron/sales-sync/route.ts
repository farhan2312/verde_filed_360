import { NextResponse } from "next/server";
import { getSyncSettings, runSalesSync, scheduledWindow } from "@/lib/sales-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily ERP sales sync — invoked by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Any external scheduler can call it the same way. Pulls the last `sync.lookbackDays` full days
 * (default: just yesterday, IST) so the nightly run never re-fetches history.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lookbackDays, enabled } = await getSyncSettings();
  if (!enabled) return NextResponse.json({ ok: true, skipped: true, reason: "Scheduled sync is paused in Settings." });

  const { from, to } = scheduledWindow(lookbackDays);
  try {
    const res = await runSalesSync({ from, to, trigger: "SCHEDULED", actor: "Scheduler" });
    return NextResponse.json({ ok: res.status === "SUCCESS", runId: res.runId, from, to, ...res.progress, error: res.error }, { status: res.status === "SUCCESS" ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, from, to, error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
