import { emailLayout, esc, appUrl } from "@/lib/email";
import { istYmd } from "@/lib/weekly-report";
import type { ReportStats, ReportSummary } from "@/lib/report-types";

/** Backlog numbers in emails/alerts count only visits logged in this many days (the queue still shows all). */
export const EMAIL_WINDOW_DAYS = 30;
const WINDOW = EMAIL_WINDOW_DAYS;
/** Queue link limited to the same window (the queue's date filter is by visit date). */
const queueHref = (status: "pending" | "overdue") =>
  appUrl(`/visit-reviews?status=${status}&sort=oldest&from=${istYmd(new Date(Date.now() - WINDOW * 86_400_000))}`);

/** HTML bodies for the Visit Review emails (all wrapped in the shared Verde Field Intel layout). */

const tile = (label: string, value: string, sub = "") =>
  `<td style="padding:10px 12px;background:#F5F8F5;border-radius:10px;text-align:center;width:25%"><div style="font-size:11px;color:#6B706B">${esc(label)}</div><div style="font-size:20px;font-weight:700;color:#66852A">${esc(value)}</div>${sub ? `<div style="font-size:10.5px;color:#8A8F8A">${esc(sub)}</div>` : ""}</td>`;
const tiles = (cells: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:6px 0 14px"><tr>${cells.join("")}</tr></table>`;
const bullets = (items: string[]) => (items.length ? `<ul style="margin:6px 0 12px;padding-left:20px">${items.map((t) => `<li style="margin:0 0 6px">${esc(t)}</li>`).join("")}</ul>` : "");
const pct = (n: number) => `${Math.round(n)}%`;

/** RM: "your weekly report is ready" — headline numbers, narrative, top next steps, link. */
export function rmReportEmail(stats: ReportStats, summary: ReportSummary, reportId: number) {
  const t = stats.totals;
  const body = [
    `<p style="margin:0 0 4px">Hi ${esc(stats.rmName.split(" ")[0] ?? stats.rmName)}, here's your visit review report for <b>${esc(stats.weekLabel)}</b>.</p>`,
    tiles([
      tile("Visits", t.visits.toLocaleString("en-IN"), stats.prev ? `last week ${stats.prev.visits}` : ""),
      tile("Reviewed", pct(t.reviewedPct), `${t.reviewed} of ${t.visits}`),
      tile("Within SLA", pct(t.slaPct), `${stats.slaHours}h target`),
      tile("Follow-ups", String(t.flagged), "flagged"),
    ]),
    `<p style="margin:0 0 10px">${esc(summary.narrative)}</p>`,
    summary.strategy.length ? `<div style="font-weight:700;margin:10px 0 2px">Recommended next steps</div>${bullets(summary.strategy.slice(0, 4).map((b) => b.text))}` : "",
    summary.concerns.length ? `<div style="font-weight:700;margin:10px 0 2px">Watch out for</div>${bullets(summary.concerns.slice(0, 3).map((b) => b.text))}` : "",
  ].join("");
  return {
    subject: `Your weekly visit report · ${stats.weekLabel}`,
    html: emailLayout({ title: "Your weekly visit report", preheader: summary.narrative.slice(0, 140), bodyHtml: body, cta: { label: "Open the full report", href: appUrl(`/reports/${reportId}`) } }),
  };
}

export interface CentralRow { rm: string; visits: number; reviewedPct: number; slaPct: number; flagged: number; backlogOverdue: number }

/** Central: all RMs' reports for the week are ready — one roll-up table. */
export function centralWeekEmail(weekLabel: string, weekYmd: string, rows: CentralRow[]) {
  const tr = rows.map((r) =>
    `<tr><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE">${esc(r.rm)}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE;text-align:right">${r.visits}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE;text-align:right">${pct(r.reviewedPct)}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE;text-align:right;color:${r.slaPct < 90 ? "#C62828" : "#7DA02E"}">${pct(r.slaPct)}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE;text-align:right">${r.flagged}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE;text-align:right">${r.backlogOverdue}</td></tr>`).join("");
  const totalVisits = rows.reduce((a, r) => a + r.visits, 0);
  const body = `<p style="margin:0 0 10px">Weekly visit review reports for <b>${esc(weekLabel)}</b> are ready for ${rows.length} region${rows.length === 1 ? "" : "s"} (${totalVisits.toLocaleString("en-IN")} visits).</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12.5px;border-collapse:collapse">
<tr style="background:#F5F8F5;color:#6B706B"><th align="left" style="padding:7px 8px">Regional Manager</th><th align="right" style="padding:7px 8px">Visits</th><th align="right" style="padding:7px 8px">Reviewed</th><th align="right" style="padding:7px 8px">Within SLA</th><th align="right" style="padding:7px 8px">Follow-ups</th><th align="right" style="padding:7px 8px">Overdue now (last ${WINDOW}d)</th></tr>${tr}</table>`;
  return {
    subject: `Weekly visit review reports · ${weekLabel}`,
    html: emailLayout({ title: "Weekly reports are ready", preheader: `${rows.length} regions · ${totalVisits} visits`, bodyHtml: body, cta: { label: "Open all reports", href: appUrl(`/reports?week=${weekYmd}`) } }),
  };
}

/** RM: daily pending digest. */
export function rmDigestEmail(rmName: string, pending: number, overdue: number, slaHours: number, oldest: string | null) {
  const body = `<p style="margin:0 0 8px">Hi ${esc(rmName.split(" ")[0] ?? rmName)}, you have <b>${pending.toLocaleString("en-IN")} visit${pending === 1 ? "" : "s"}</b> from the last ${WINDOW} days waiting for your review${overdue ? ` — <b style="color:#C62828">${overdue.toLocaleString("en-IN")} past the ${slaHours}h SLA</b>` : ""}.</p>
${oldest ? `<p style="margin:0 0 8px;color:#6B706B">The oldest of these was logged on ${esc(oldest)}.</p>` : ""}
<p style="margin:0">A few minutes a day keeps the queue clear and gives your officers timely feedback.</p>`;
  return {
    subject: overdue
      ? `${overdue.toLocaleString("en-IN")} visit${overdue === 1 ? "" : "s"} past review SLA · ${pending.toLocaleString("en-IN")} pending (last ${WINDOW} days)`
      : `${pending.toLocaleString("en-IN")} visit${pending === 1 ? "" : "s"} awaiting your review`,
    html: emailLayout({ title: "Visits awaiting your review", preheader: `${pending} pending, ${overdue} overdue`, bodyHtml: body, cta: { label: overdue ? "Review overdue visits" : "Open Visit Reviews", href: queueHref(overdue ? "overdue" : "pending") } }),
  };
}

export interface SlaRow { rm: string; overdue: number; pending: number; oldest: string | null }

/** Central: RMs with visits past the review SLA. */
export function centralSlaEmail(rows: SlaRow[], slaHours: number) {
  const total = rows.reduce((a, r) => a + r.overdue, 0);
  const tr = rows.map((r) =>
    `<tr><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE">${esc(r.rm)}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE;text-align:right;color:#C62828;font-weight:700">${r.overdue}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE;text-align:right">${r.pending}</td><td style="padding:7px 8px;border-bottom:1px solid #EEF1EE">${esc(r.oldest ?? "—")}</td></tr>`).join("");
  const body = `<p style="margin:0 0 10px"><b>${total.toLocaleString("en-IN")} visit${total === 1 ? "" : "s"}</b> logged in the last ${WINDOW} days across ${rows.length} region${rows.length === 1 ? "" : "s"} ${total === 1 ? "is" : "are"} past the ${slaHours}h review SLA.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12.5px;border-collapse:collapse">
<tr style="background:#F5F8F5;color:#6B706B"><th align="left" style="padding:7px 8px">Regional Manager</th><th align="right" style="padding:7px 8px">Overdue</th><th align="right" style="padding:7px 8px">Pending</th><th align="left" style="padding:7px 8px">Oldest</th></tr>${tr}</table>`;
  return {
    subject: `Review SLA: ${total.toLocaleString("en-IN")} overdue visit${total === 1 ? "" : "s"} across ${rows.length} region${rows.length === 1 ? "" : "s"} (last ${WINDOW} days)`,
    html: emailLayout({ title: "Visits past the review SLA", preheader: `${total} overdue`, bodyHtml: body, cta: { label: "Open the review queue", href: queueHref("overdue") } }),
  };
}
