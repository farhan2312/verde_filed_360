"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActor } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { checkEmail } from "@/lib/email-validate";
import { emailConfig, emailLayout, esc, sendEmail, appUrl } from "@/lib/email";
import { getReviewSettings, REVIEW_SETTING_KEYS, type ReviewSettings } from "@/lib/review-settings";
import { rmReportEmail, rmDigestEmail, centralWeekEmail, centralSlaEmail } from "@/lib/review-emails";
import { reviewBacklog, centralWeekRows } from "@/lib/review-jobs";
import { istYmd, weekFromStart } from "@/lib/weekly-report";
import type { ReportStats as Stats, ReportSummary as Summary } from "@/lib/report-types";
import { SAMPLE_KINDS, type SampleKind } from "@/lib/review-sample-kinds";

/** Settings → "Reviews & Reports". System Admin only (the real admin, even while viewing as a role). */
async function requireAdmin(): Promise<boolean> {
  return !!(await getSession())?.isAdmin;
}

export interface EmailLogRow { id: number; at: string; to: string; subject: string; type: string; ok: boolean; error: string }
export interface RecipientCoverage { role: string; total: number; reachable: number }
export interface ReviewSettingsState {
  settings: ReviewSettings;
  email: { ready: boolean; missing: string[]; from: string; replyTo: string; appUrl: string };
  coverage: RecipientCoverage[];
  logs: EmailLogRow[];
  myEmail: string;
}

const ROLE_ROWS: [string, "REGIONAL" | "CENTRAL" | "SYSADMIN"][] = [["Regional Managers", "REGIONAL"], ["Central team", "CENTRAL"], ["System Admins", "SYSADMIN"]];

export async function getReviewSettingsState(): Promise<ReviewSettingsState | null> {
  if (!(await requireAdmin())) return null;
  const cfg = emailConfig();
  const [settings, users, logs, me] = await Promise.all([
    getReviewSettings(),
    prisma.user.findMany({
      where: { active: true, approvalStatus: "APPROVED", role: { in: ["REGIONAL", "CENTRAL", "SYSADMIN"] } },
      select: { role: true, workEmail: true },
    }).catch(() => []),
    prisma.emailLog.findMany({ orderBy: { id: "desc" }, take: 25 }).catch(() => []),
    getActor().then((a) => (a.userId ? prisma.user.findUnique({ where: { id: a.userId }, select: { workEmail: true } }) : null)).catch(() => null),
  ]);
  const coverage = ROLE_ROWS.map(([label, role]) => {
    const list = users.filter((u) => u.role === role);
    return { role: label, total: list.length, reachable: list.filter((u) => { const c = checkEmail(u.workEmail); return c.ok && !!c.normalized; }).length };
  });
  return {
    settings,
    email: { ready: cfg.ready, missing: cfg.missing, from: cfg.from, replyTo: cfg.replyTo, appUrl: appUrl("") },
    coverage,
    logs: logs.map((l) => ({
      id: l.id,
      at: l.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }),
      to: l.to, subject: l.subject, type: l.type, ok: l.ok, error: l.error ?? "",
    })),
    myEmail: me?.workEmail ?? "",
  };
}

export async function saveReviewSettings(input: ReviewSettings): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: "Not authorised." };
  const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (!int(input.slaHours, 1, 24 * 30)) return { ok: false, error: "SLA must be 1–720 hours." };
  if (![input.weekStartDay, input.reportDay].every((d) => int(d, 0, 6))) return { ok: false, error: "Pick a valid day." };
  if (![input.reportHour, input.digestHour].every((h) => int(h, 0, 23))) return { ok: false, error: "Pick a valid hour." };
  if (input.emailEnabled && !emailConfig().ready) return { ok: false, error: `Email can't be switched on yet — missing ${emailConfig().missing.join(", ")} in the server environment.` };

  const before = await getReviewSettings();
  const pairs: [string, string][] = [
    [REVIEW_SETTING_KEYS.slaHours, String(input.slaHours)],
    [REVIEW_SETTING_KEYS.weekStartDay, String(input.weekStartDay)],
    [REVIEW_SETTING_KEYS.reportDay, String(input.reportDay)],
    [REVIEW_SETTING_KEYS.reportHour, String(input.reportHour)],
    [REVIEW_SETTING_KEYS.digestHour, String(input.digestHour)],
    [REVIEW_SETTING_KEYS.emailEnabled, input.emailEnabled ? "true" : "false"],
  ];
  try {
    await prisma.$transaction(pairs.map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
  const changed = (Object.keys(input) as (keyof ReviewSettings)[]).filter((k) => input[k] !== before[k]).map((k) => `${k}: ${before[k]} → ${input[k]}`);
  if (changed.length) await logAudit("Setting", "CONFIG", `Reviews & Reports: ${changed.join(", ")}`);
  revalidatePath("/settings");
  revalidatePath("/visit-reviews");
  return { ok: true };
}

/**
 * Preview the real automatic emails: renders each chosen template from LIVE data (the latest week's
 * reports, today's backlog) and sends it to the given addresses with a "[Sample]" subject. Ignores the
 * on/off switch and never touches the dedupe keys, so it can't stop or duplicate a real send.
 */
export async function sendSampleEmails(addresses: string[], kinds: SampleKind[]): Promise<{ ok: boolean; sent?: number; results?: { to: string; label: string; ok: boolean; error?: string }[]; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: "Not authorised." };
  const to: string[] = [];
  for (const a of addresses.map((x) => x.trim()).filter(Boolean)) {
    const c = checkEmail(a);
    if (!c.ok || !c.normalized) return { ok: false, error: `${a}: ${c.error ?? "invalid address"}` };
    if (!to.includes(c.normalized)) to.push(c.normalized);
  }
  if (!to.length) return { ok: false, error: "Enter at least one address." };
  if (to.length > 5) return { ok: false, error: "Up to 5 addresses at a time." };
  const want = SAMPLE_KINDS.filter((k) => kinds.includes(k.kind));
  if (!want.length) return { ok: false, error: "Pick at least one email type." };

  const s = await getReviewSettings();

  // Latest week that has built reports; the sample RM = that week's busiest region.
  const latest = await prisma.weeklyReport.findFirst({ where: { status: "DONE" }, orderBy: { weekStart: "desc" }, select: { weekStart: true } });
  const weekRows = latest ? await prisma.weeklyReport.findMany({ where: { weekStart: latest.weekStart, status: "DONE" }, orderBy: { rmName: "asc" } }) : [];
  const busiest = [...weekRows].sort((a, b) => (b.stats as unknown as Stats).totals.visits - (a.stats as unknown as Stats).totals.visits)[0];
  const backlog = want.some((k) => k.kind === "RM_DIGEST" || k.kind === "CENTRAL_SLA") ? await reviewBacklog(s) : [];

  const built: { label: string; subject: string; html: string }[] = [];
  for (const k of want) {
    if (k.kind === "RM_REPORT") {
      if (!busiest) return { ok: false, error: "No weekly report has been built yet — generate one on Weekly Reports first." };
      const m = rmReportEmail(busiest.stats as unknown as Stats, busiest.summary as unknown as Summary, busiest.id);
      built.push({ label: k.label, ...m });
    } else if (k.kind === "CENTRAL_WEEK") {
      if (!weekRows.length) return { ok: false, error: "No weekly report has been built yet — generate one on Weekly Reports first." };
      const ymd = istYmd(weekRows[0].weekStart);
      const m = centralWeekEmail(weekFromStart(ymd).label, ymd, await centralWeekRows(weekRows));
      built.push({ label: k.label, ...m });
    } else if (k.kind === "RM_DIGEST") {
      const r = backlog.find((x) => busiest && x.userId === busiest.rmUserId && x.pending) ?? [...backlog].sort((a, b) => b.pending - a.pending)[0];
      if (!r) return { ok: false, error: "No RM has stores mapped yet." };
      const m = rmDigestEmail(r.rm, Math.max(r.pending, 1), r.overdue, s.slaHours, r.oldest);
      built.push({ label: k.label, ...m });
    } else {
      const breached = backlog.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue);
      const rows = breached.length ? breached : backlog.filter((r) => r.pending > 0).slice(0, 5).map((r) => ({ ...r, overdue: Math.max(r.overdue, 1) }));
      if (!rows.length) return { ok: false, error: "No review backlog to show." };
      const m = centralSlaEmail(rows, s.slaHours);
      built.push({ label: k.label, ...m });
    }
  }

  const actor = await getActor();
  const results: { to: string; label: string; ok: boolean; error?: string }[] = [];
  for (const addr of to)
    for (const b of built) {
      const res = await sendEmail({ to: addr, subject: `[Sample] ${b.subject}`, html: b.html, type: "TEST", sentByName: actor.name, force: true });
      results.push({ to: addr, label: b.label, ok: res.ok, ...(res.ok ? {} : { error: res.error ?? "Send failed." }) });
    }
  await logAudit("Setting", "CONFIG", `Sent ${results.filter((r) => r.ok).length} sample review emails to ${to.join(", ")}`);
  revalidatePath("/settings");
  const sent = results.filter((r) => r.ok).length;
  return { ok: sent > 0, sent, results, ...(sent ? {} : { error: results[0]?.error ?? "Send failed." }) };
}

/** Send one test email (ignores the on/off switch, so you can verify the setup before enabling). */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: "Not authorised." };
  const chk = checkEmail(to);
  if (!chk.ok || !chk.normalized) return { ok: false, error: chk.error ?? "Enter an email address." };
  const actor = await getActor();
  const html = emailLayout({
    title: "Verde Field Intel email is working ✓",
    preheader: "Test email from Verde Field Intel settings",
    bodyHtml: `<p style="margin:0 0 10px">This is a test sent by <b>${esc(actor.name)}</b> from Settings → Reviews &amp; Reports.</p>
<p style="margin:0">If it reached your inbox (not spam), the sending domain is set up correctly. In Gmail, open <b>⋮ → Show original</b> and check SPF, DKIM and DMARC all say <b>PASS</b>.</p>`,
    cta: { label: "Open Verde Field Intel", href: appUrl("/visit-reviews") },
  });
  const res = await sendEmail({ to: chk.normalized, subject: "Verde Field Intel test email", html, type: "TEST", sentByName: actor.name, force: true });
  revalidatePath("/settings");
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? "Send failed." };
}
