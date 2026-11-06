"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getReviewSettings } from "@/lib/review-settings";
import { buildReport, ensureReportRows, lastCompletedWeek, processPendingReports } from "@/lib/weekly-report";

/** Admin controls for weekly reports. System Admin only (the real admin session). */
async function isAdmin() { return !!(await getSession())?.isAdmin; }

/**
 * Build the last completed week's reports right now (instead of waiting for the scheduled run). RMs and
 * Central are notified by the next hourly run, exactly as for scheduled reports.
 */
export async function generateLastWeekNow(): Promise<{ ok: boolean; created?: number; built?: number; failed?: number; remaining?: number; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: "Not authorised." };
  try {
    const s = await getReviewSettings();
    const week = lastCompletedWeek(new Date(), s.weekStartDay);
    const created = await ensureReportRows(week);
    const r = await processPendingReports(45_000);
    await logAudit("WeeklyReport", "CREATE", `Generated weekly reports for ${week.label} (${created} new)`);
    revalidatePath("/reports");
    return { ok: true, created, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generation failed." };
  }
}

/** Rebuild one report from current data (doesn't re-notify). */
export async function regenerateReport(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: "Not authorised." };
  const r = await buildReport(id);
  if (r.ok) await logAudit("WeeklyReport", "UPDATE", `Regenerated weekly report #${id}`);
  revalidatePath("/reports");
  revalidatePath(`/reports/${id}`);
  return r;
}
