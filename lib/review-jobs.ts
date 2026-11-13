import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getReviewSettings, type ReviewSettings } from "@/lib/review-settings";
import { sendEmail, type EmailType } from "@/lib/email";
import { checkEmail } from "@/lib/email-validate";
import { notifyUsers, bumpRolling } from "@/lib/notify";
import {
  ensureReportRows, processPendingReports, lastCompletedWeek, lastReportMoment, listReportRms, visitsInStores,
  istYmd, istHour, weekFromStart,
} from "@/lib/weekly-report";
import { rmReportEmail, centralWeekEmail, rmDigestEmail, centralSlaEmail, EMAIL_WINDOW_DAYS, type CentralRow, type SlaRow } from "@/lib/review-emails";
import type { ReportStats, ReportSummary } from "@/lib/report-types";

/**
 * Everything the hourly cron (/api/cron/reviews) does, in order. Each step is idempotent and uses a
 * Setting "last run" marker or a dedupe key, so a missed hour simply catches up on the next run and a
 * duplicate/overlapping run never notifies twice.
 *   1. Weekly report time passed → create PENDING rows for every RM for the last completed week.
 *   2. Build pending reports within the time budget (retries failures up to 3×).
 *   3. Announce newly built reports: RM bell + email; Central rolling bell; Central roll-up email when a week is complete.
 *   4. Daily (digest hour passed, once per IST day): RM pending digest email + Central SLA-breach alert.
 * Emails respect the Settings switch (sendEmail skips when it's off); in-app notifications always go.
 */

const K_LAST_WEEK = "job.report.lastWeek";
const K_LAST_DIGEST = "job.digest.lastDay";
/** Don't email about reports older than this (e.g. email was switched on days later) — bell only. */
const EMAIL_FRESH_MS = 48 * 3_600_000;
export const emailWindowStart = (now = new Date()) => new Date(now.getTime() - EMAIL_WINDOW_DAYS * 86_400_000);

async function getMarker(key: string): Promise<string | null> {
  return (await prisma.setting.findUnique({ where: { key } }).catch(() => null))?.value ?? null;
}
async function setMarker(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
/** Central-team recipients (weekly roll-up, SLA alert, bell): Central admins + System admins. */
const centralUsers = () =>
  prisma.user.findMany({ where: { role: { in: ["CENTRAL", "SYSADMIN"] }, active: true, approvalStatus: "APPROVED" }, select: { id: true, role: true, workEmail: true }, orderBy: { id: "asc" } });

/**
 * The Central-team emails are the same for everyone, so they go as ONE message: the first Central admin
 * with a work email in To, everyone else CC'd. (Resend needs a To; the no-reply sender has no inbox.)
 * With no API key sendEmail just logs a not-configured attempt and returns; it never throws.
 */
async function mailCentral(central: { role: string; workEmail: string | null }[], m: { subject: string; html: string }, type: EmailType, dedupeKey: string) {
  const ordered = [...central].sort((a, b) => (a.role === b.role ? 0 : a.role === "CENTRAL" ? -1 : 1));
  const emails = [...new Set(ordered.map((c) => { const k = checkEmail(c.workEmail); return k.ok ? k.normalized : null; }).filter((e): e is string => !!e))];
  if (!emails.length) return;
  await sendEmail({ to: emails[0], cc: emails.slice(1), subject: m.subject, html: m.html, type, dedupeKey });
}

export interface JobLog { scheduledWeek?: string; created?: number; built?: number; failed?: number; remaining?: number; announced?: number; centralMailed?: string[]; digests?: number; slaAlert?: number; skipped?: string[] }

export async function runReviewJobs(opts: { budgetMs: number; now?: Date }): Promise<JobLog> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const s = await getReviewSettings();
  const log: JobLog = {};

  // 1. Schedule this week's reports once the configured report moment has passed.
  const moment = lastReportMoment(now, s);
  const week = lastCompletedWeek(moment, s.weekStartDay);
  if ((await getMarker(K_LAST_WEEK)) !== week.startYmd) {
    log.created = await ensureReportRows(week);
    await setMarker(K_LAST_WEEK, week.startYmd);
    log.scheduledWeek = week.startYmd;
  }

  // 2. Build (leave ~40s for announcements + digests).
  const r = await processPendingReports(Math.max(10_000, opts.budgetMs - 40_000 - (Date.now() - started)));
  Object.assign(log, r);

  // 3. Announce.
  const ann = await announceReports(now);
  log.announced = ann.announced;
  log.centralMailed = ann.centralMailed;

  // 4. Daily digest + SLA alert.
  const today = istYmd(now);
  if (istHour(now) >= s.digestHour && (await getMarker(K_LAST_DIGEST)) !== today) {
    await setMarker(K_LAST_DIGEST, today); // claim first — an overlapping run won't double-send
    const d = await runDailyDigests(s, today);
    log.digests = d.digests;
    log.slaAlert = d.slaRms;
  }
  return log;
}

/** Bell + email for every DONE report not yet announced; Central roll-up once a week is complete. */
export async function announceReports(now = new Date()): Promise<{ announced: number; centralMailed: string[] }> {
  const rows = await prisma.weeklyReport.findMany({ where: { status: "DONE", notifiedAt: null }, orderBy: { id: "asc" } });
  if (!rows.length) return { announced: 0, centralMailed: [] };
  const [central, rmUsers] = await Promise.all([
    centralUsers(),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((x) => x.rmUserId))] } }, select: { id: true, workEmail: true } }),
  ]);
  const rmEmail = new Map(rmUsers.map((u) => [u.id, u.workEmail]));
  let announced = 0;
  const weeks = new Set<string>();

  for (const row of rows) {
    // Claim the row (an overlapping run skips it).
    const claim = await prisma.weeklyReport.updateMany({ where: { id: row.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claim.count !== 1) continue;
    announced++;
    const stats = row.stats as unknown as ReportStats;
    const summary = row.summary as unknown as ReportSummary;
    const ymd = istYmd(row.weekStart);
    weeks.add(ymd);
    await notifyUsers([row.rmUserId], { type: "REPORT_READY", title: "Your weekly visit report is ready", body: `${stats.weekLabel} · ${stats.totals.visits} visits · ${Math.round(stats.totals.reviewedPct)}% reviewed`, href: `/reports/${row.id}` });
    await Promise.all(central.map((c) => bumpRolling(c.id, `REPORTS_READY:${c.id}:${ymd}`, "REPORT_READY", "1 weekly report ready", "{n} weekly reports ready", `Week of ${stats.weekLabel}`, `/reports?week=${ymd}`)));
    const to = rmEmail.get(row.rmUserId);
    if (to && row.generatedAt && now.getTime() - row.generatedAt.getTime() < EMAIL_FRESH_MS) {
      const m = rmReportEmail(stats, summary, row.id);
      await sendEmail({ to, subject: m.subject, html: m.html, type: "REPORT_READY", userId: row.rmUserId, dedupeKey: `REPORT:${row.id}` });
    }
  }

  // Central roll-up email per week, once all of that week's reports are built and announced.
  const centralMailed: string[] = [];
  for (const ymd of weeks) {
    const wk = weekFromStart(ymd);
    const open = await prisma.weeklyReport.count({ where: { weekStart: wk.start, OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: 3 } }, { status: "DONE", notifiedAt: null }] } });
    if (open > 0) continue;
    const done = await prisma.weeklyReport.findMany({ where: { weekStart: wk.start, status: "DONE" }, orderBy: { rmName: "asc" } });
    const freshest = Math.max(...done.map((d) => d.generatedAt?.getTime() ?? 0));
    if (!done.length || now.getTime() - freshest > EMAIL_FRESH_MS) continue;
    const tableRows = await centralWeekRows(done);
    const m = centralWeekEmail(wk.label, ymd, tableRows);
    await mailCentral(central, m, "REPORT_READY", `REPORTS_WEEK:${ymd}`);
    centralMailed.push(ymd);
  }
  return { announced, centralMailed };
}

/** Central roll-up rows for a week's reports; "Overdue now" uses the same last-30-days backlog as the alerts. */
export async function centralWeekRows(done: { rmUserId: number; rmName: string; stats: unknown }[]): Promise<CentralRow[]> {
  const backlog = new Map((await reviewBacklog(await getReviewSettings())).map((b) => [b.userId, b.overdue]));
  return done.map((d) => {
    const t = (d.stats as ReportStats).totals;
    return { rm: d.rmName, visits: t.visits, reviewedPct: t.reviewedPct, slaPct: t.slaPct, flagged: t.flagged, backlogOverdue: backlog.get(d.rmUserId) ?? 0 };
  });
}

/**
 * Every report RM's review backlog right now — counting only visits LOGGED in the last EMAIL_WINDOW_DAYS
 * (the old pre-launch backlog would swamp the emails): pending, past-SLA, oldest pending date.
 */
export async function reviewBacklog(s: ReviewSettings): Promise<(SlaRow & { userId: number; email: string | null })[]> {
  const rms = await listReportRms();
  const cutoff = new Date(Date.now() - s.slaHours * 3_600_000);
  const since = emailWindowStart();
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const rows: (SlaRow & { userId: number; email: string | null })[] = [];
  for (const rm of rms) {
    const scope: Prisma.VisitWhereInput = { AND: [visitsInStores(rm.storeIds), { createdAt: { gte: since } }] };
    const [pending, overdue, oldest] = await Promise.all([
      prisma.visit.count({ where: { AND: [scope, { reviewedAt: null }] } }),
      prisma.visit.count({ where: { AND: [scope, { reviewedAt: null, createdAt: { lt: cutoff } }] } }),
      prisma.visit.findFirst({ where: { AND: [scope, { reviewedAt: null }] }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ]);
    rows.push({ rm: rm.name, userId: rm.userId, email: rm.workEmail, pending, overdue, oldest: oldest ? fmt(oldest.createdAt) : null });
  }
  return rows;
}

/** RM pending digest (email) + Central SLA-breach alert (bell + email). Once per IST day. */
export async function runDailyDigests(s: ReviewSettings, today: string): Promise<{ digests: number; slaRms: number }> {
  const rows = await reviewBacklog(s);
  let digests = 0;
  for (const r of rows) {
    if (!r.pending || !r.email) continue;
    const m = rmDigestEmail(r.rm, r.pending, r.overdue, s.slaHours, r.oldest);
    const res = await sendEmail({ to: r.email, subject: m.subject, html: m.html, type: "DIGEST", userId: r.userId, dedupeKey: `DIGEST:${r.userId}:${today}` });
    if (res.ok && !res.skipped) digests++;
  }

  const breached = rows.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  if (breached.length) {
    const central = await centralUsers();
    const total = breached.reduce((a, r) => a + r.overdue, 0);
    await notifyUsers(central.map((c) => c.id), {
      type: "SLA_BREACH",
      title: `${total.toLocaleString("en-IN")} visits past the ${s.slaHours}h review SLA (last ${EMAIL_WINDOW_DAYS} days)`,
      body: breached.slice(0, 4).map((r) => `${r.rm} ${r.overdue}`).join(" · ") + (breached.length > 4 ? ` · +${breached.length - 4} more` : ""),
      // Same last-30-days window as the alert email, so the queue opens on exactly these visits.
      href: `/visit-reviews?status=overdue&sort=oldest&from=${istYmd(emailWindowStart())}`,
    });
    const m = centralSlaEmail(breached, s.slaHours);
    await mailCentral(central, m, "SLA_BREACH", `SLA:${today}`);
  }
  return { digests, slaRms: breached.length };
}
