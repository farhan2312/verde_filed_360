import { NextResponse } from "next/server";
import { runReviewJobs } from "@/lib/review-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro

/**
 * Hourly Visit Review jobs — called by Vercel Cron (vercel.json, "35 * * * *" UTC = :05 past every IST
 * hour). Requires `Authorization: Bearer $CRON_SECRET` (Vercel attaches it). The job itself decides what
 * is due from the Settings schedule (weekly report, daily digest / SLA alert), so changing times in
 * Settings never needs a vercel.json change. Safe to call repeatedly — every step is idempotent.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const log = await runReviewJobs({ budgetMs: 250_000 });
    return NextResponse.json({ ok: true, ...log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Job failed" }, { status: 500 });
  }
}
