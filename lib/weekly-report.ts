import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shortStoreName } from "@/lib/store-utils";
import { getReviewSettings, type ReviewSettings } from "@/lib/review-settings";
import { allRmStores } from "@/lib/rm-stores";
import { generateSummary } from "@/lib/report-summary";
import type { OfficerStat, ReportStats, StoreStat, Tally, VisitRef } from "@/lib/report-types";

/**
 * Weekly visit-review report engine (R3). One report per Regional Manager — keyed by their USER ID,
 * never their name — covering the visits in the stores they manage for one IST week.
 *
 * A Verde store can have several managers, so the RM → stores map comes from `lib/rm-stores.ts`
 * (`Store.rmUserIds`, with the legacy manager-name match as a fallback), the same axis as their review
 * queue. A store with two RMs is legitimately covered by both of their reports.
 * Plain module; called by the cron job and by admin actions.
 */

/* ───────────── IST calendar helpers ───────────── */

export const istYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dowOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
export const addDaysYmd = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const istStart = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
export const istHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(d));
const fmtDay = (ymd: string, withYear: boolean) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

export interface ReportWeek { startYmd: string; start: Date; end: Date; label: string }

export function weekFromStart(startYmd: string): ReportWeek {
  const endYmd = addDaysYmd(startYmd, 7);
  const lastYmd = addDaysYmd(startYmd, 6);
  return { startYmd, start: istStart(startYmd), end: istStart(endYmd), label: `${fmtDay(startYmd, false)} – ${fmtDay(lastYmd, true)}` };
}

/** The most recent fully-completed reporting week as of `at`. */
export function lastCompletedWeek(at: Date, weekStartDay: number): ReportWeek {
  const today = istYmd(at);
  const curStart = addDaysYmd(today, -((dowOf(today) - weekStartDay + 7) % 7));
  return weekFromStart(addDaysYmd(curStart, -7));
}

/** The latest scheduled report moment (reportDay @ reportHour IST) at or before `now`. */
export function lastReportMoment(now: Date, s: Pick<ReviewSettings, "reportDay" | "reportHour">): Date {
  const today = istYmd(now);
  let d = addDaysYmd(today, -((dowOf(today) - s.reportDay + 7) % 7));
  let m = new Date(istStart(d).getTime() + s.reportHour * 3_600_000);
  if (m > now) { d = addDaysYmd(d, -7); m = new Date(istStart(d).getTime() + s.reportHour * 3_600_000); }
  return m;
}

/* ───────────── RM ↔ stores ───────────── */

export interface ReportRm { userId: number; name: string; code: string | null; workEmail: string | null; storeIds: number[] }

/**
 * Active, approved RM ACCOUNTS with at least one managed store. Resolved through `Store.rmUserIds`
 * (multi-RM), so one store can appear in several RMs' lists — that is correct here, each manager owns
 * the review of those visits.
 */
export async function listReportRms(): Promise<ReportRm[]> {
  return (await allRmStores())
    .filter((r) => r.storeIds.length > 0)
    .map((r) => ({ userId: r.userId, name: r.name, code: r.code, workEmail: r.workEmail, storeIds: r.storeIds }));
}

/** Visits belonging to a set of stores (a store-less visit falls back to its farmer's store) — same rule as the queue. */
export const visitsInStores = (ids: number[]): Prisma.VisitWhereInput => ({
  OR: [{ storeId: { in: ids } }, { storeId: null, farmer: { storeId: { in: ids } } }],
});
/** Visits dated inside [start, end) — the visit date, falling back to when it was logged. */
const datedIn = (start: Date, end: Date): Prisma.VisitWhereInput => ({
  OR: [{ visitedAt: { gte: start, lt: end } }, { visitedAt: null, createdAt: { gte: start, lt: end } }],
});

/* ───────────── Stats ───────────── */

const NOISE = /^(none|no|nil|na|n\/a|-|nothing|no problem|no issue|other)$/i;

function tally<T extends { id: number }>(rows: T[], pick: (r: T) => (string | null | undefined)[], max = 8): Tally[] {
  const m = new Map<string, Tally>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const raw of pick(r)) {
      const label = (raw ?? "").trim();
      if (!label || NOISE.test(label)) continue;
      const k = label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const t = m.get(k) ?? m.set(k, { label, count: 0, visitIds: [] }).get(k)!;
      t.count++;
      t.visitIds.push(r.id);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, max);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function buildReportStats(rm: ReportRm, week: ReportWeek, s: ReviewSettings): Promise<ReportStats> {
  const scope = visitsInStores(rm.storeIds);
  const slaMs = s.slaHours * 3_600_000;
  const prevWeek = weekFromStart(addDaysYmd(week.startYmd, -7));

  const [visits, prevRows, backlogPending, backlogOverdue, oldest, officerUsers, stores] = await Promise.all([
    prisma.visit.findMany({
      where: { AND: [scope, datedIn(week.start, week.end)] },
      orderBy: { id: "asc" },
      select: {
        id: true, createdAt: true, visitedAt: true, date: true, officerName: true, recordedByCode: true, farmerId: true,
        mainCrop: true, crops: true, currentProblem: true, pests: true, productRequired: true, cropRisk: true,
        reviewedAt: true, firstReviewedAt: true, reviewRating: true, reviewNote: true, reviewFlagged: true,
        farmer: { select: { name: true } }, store: { select: { name: true } },
      },
    }),
    prisma.visit.findMany({ where: { AND: [scope, datedIn(prevWeek.start, prevWeek.end)] }, select: { createdAt: true, reviewedAt: true, firstReviewedAt: true } }),
    prisma.visit.count({ where: { AND: [scope, { reviewedAt: null }] } }),
    prisma.visit.count({ where: { AND: [scope, { reviewedAt: null, createdAt: { lt: new Date(Date.now() - slaMs) } }] } }),
    prisma.visit.findFirst({
      where: { AND: [scope, { reviewedAt: null }] }, orderBy: { createdAt: "asc" },
      select: { id: true, date: true, visitedAt: true, createdAt: true, officerName: true, farmer: { select: { name: true } }, store: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { role: { in: ["ASR", "STORE_MANAGER"] }, active: true, approvalStatus: "APPROVED", storeId: { in: rm.storeIds } }, select: { name: true, employeeCode: true } }),
    prisma.store.findMany({ where: { id: { in: rm.storeIds } }, select: { id: true, name: true } }),
  ]);

  const vDate = (v: { date: string | null; visitedAt: Date | null; createdAt: Date }) =>
    v.date?.trim() || (v.visitedAt ?? v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const ref = (v: (typeof visits)[number], note = ""): VisitRef => ({
    id: v.id, farmer: v.farmer?.name ?? "Store visit", officer: v.officerName?.trim() || "—", store: shortStoreName(v.store?.name) || "—",
    date: vDate(v), note: note.slice(0, 220), rating: v.reviewRating,
  });
  const turnMs = (v: { createdAt: Date; reviewedAt: Date | null; firstReviewedAt: Date | null }) =>
    v.reviewedAt ? (v.firstReviewedAt ?? v.reviewedAt).getTime() - v.createdAt.getTime() : null;

  // Totals
  const reviewed = visits.filter((v) => v.reviewedAt);
  const turns = reviewed.map(turnMs).filter((x): x is number => x != null && x >= 0);
  const withinSla = reviewed.filter((v) => { const t = turnMs(v); return t != null && t <= slaMs; }).length;
  const rated = visits.filter((v) => v.reviewRating != null);
  const n = visits.length;
  const prevReviewed = prevRows.filter((v) => v.reviewedAt);
  const prevWithin = prevReviewed.filter((v) => { const t = turnMs(v); return t != null && t <= slaMs; }).length;

  // Officers (keyed by name as logged; display the first spelling seen)
  const om = new Map<string, OfficerStat & { farmerSet: Set<number>; ratingSum: number; ratingN: number }>();
  for (const v of visits) {
    const name = v.officerName?.trim() || "Unknown officer";
    const k = name.toLowerCase();
    const o = om.get(k) ?? om.set(k, { name, visits: 0, reviewed: 0, pending: 0, flagged: 0, farmers: 0, avgRating: null, farmerSet: new Set(), ratingSum: 0, ratingN: 0 }).get(k)!;
    o.visits++;
    if (v.reviewedAt) o.reviewed++; else o.pending++;
    if (v.reviewFlagged) o.flagged++;
    if (v.farmerId) o.farmerSet.add(v.farmerId);
    if (v.reviewRating != null) { o.ratingSum += v.reviewRating; o.ratingN++; }
  }
  const officers: OfficerStat[] = [...om.values()]
    .map(({ farmerSet, ratingSum, ratingN, ...o }) => ({ ...o, farmers: farmerSet.size, avgRating: ratingN ? round1(ratingSum / ratingN) : null }))
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  const activeCodes = new Set(visits.map((v) => v.recordedByCode).filter(Boolean));
  const activeNames = new Set(visits.map((v) => v.officerName?.trim().toLowerCase()).filter(Boolean));
  const inactiveOfficers = officerUsers
    .filter((u) => !(u.employeeCode && activeCodes.has(u.employeeCode)) && !activeNames.has(u.name.trim().toLowerCase()))
    .map((u) => u.name)
    .sort((a, b) => a.localeCompare(b));

  // Stores
  const sm = new Map<string, StoreStat>();
  for (const st of stores) { const nm = shortStoreName(st.name) || st.name; if (!sm.has(nm)) sm.set(nm, { name: nm, visits: 0, reviewed: 0, pending: 0, flagged: 0 }); }
  for (const v of visits) {
    const nm = shortStoreName(v.store?.name) || "No store";
    const x = sm.get(nm) ?? sm.set(nm, { name: nm, visits: 0, reviewed: 0, pending: 0, flagged: 0 }).get(nm)!;
    x.visits++;
    if (v.reviewedAt) x.reviewed++; else x.pending++;
    if (v.reviewFlagged) x.flagged++;
  }

  // Themes
  const problems = tally(visits, (v) => v.currentProblem);
  const problemCrop: Record<string, string> = {};
  const byId = new Map(visits.map((v) => [v.id, v]));
  for (const p of problems.slice(0, 3)) {
    const c = tally(p.visitIds.map((id) => byId.get(id)!).filter(Boolean), (v) => [v.mainCrop], 1)[0];
    if (c && c.count >= Math.max(2, Math.ceil(p.count / 3))) problemCrop[p.label] = c.label;
  }

  return {
    version: 1,
    weekLabel: week.label,
    weekStartYmd: week.startYmd,
    rmName: rm.name,
    storeCount: rm.storeIds.length,
    slaHours: s.slaHours,
    totals: {
      visits: n,
      reviewed: reviewed.length,
      pending: n - reviewed.length,
      flagged: visits.filter((v) => v.reviewFlagged).length,
      withinSla,
      reviewedPct: n ? round1((reviewed.length / n) * 100) : 0,
      slaPct: n ? round1((withinSla / n) * 100) : 0,
      avgTurnaroundHrs: turns.length ? round1(turns.reduce((a, b) => a + b, 0) / turns.length / 3_600_000) : null,
      avgRating: rated.length ? round1(rated.reduce((a, v) => a + (v.reviewRating ?? 0), 0) / rated.length) : null,
      rated: rated.length,
      withComment: visits.filter((v) => v.reviewNote?.trim()).length,
      farmers: new Set(visits.map((v) => v.farmerId).filter(Boolean)).size,
      officersActive: officers.filter((o) => o.name !== "Unknown officer").length,
      backlogPending,
      backlogOverdue,
    },
    prev: prevRows.length
      ? { visits: prevRows.length, reviewed: prevReviewed.length, reviewedPct: round1((prevReviewed.length / prevRows.length) * 100), slaPct: round1((prevWithin / prevRows.length) * 100) }
      : null,
    officers,
    stores: [...sm.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)),
    inactiveOfficers,
    problems,
    crops: tally(visits, (v) => [v.mainCrop, ...(v.crops ?? [])]),
    pests: tally(visits, (v) => v.pests),
    productsRequired: tally(visits, (v) => v.productRequired),
    cropRisks: tally(visits, (v) => v.cropRisk),
    problemCrop,
    flaggedVisits: visits.filter((v) => v.reviewFlagged).slice(0, 10).map((v) => ref(v, v.reviewNote ?? "")),
    lowRated: visits.filter((v) => v.reviewRating != null && v.reviewRating <= 2).slice(0, 10).map((v) => ref(v, v.reviewNote ?? "")),
    recentComments: visits.filter((v) => v.reviewNote?.trim()).slice(-5).reverse().map((v) => ref(v, v.reviewNote ?? "")),
    oldestPending: oldest
      ? { id: oldest.id, farmer: oldest.farmer?.name ?? "Store visit", officer: oldest.officerName?.trim() || "—", store: shortStoreName(oldest.store?.name) || "—", date: vDate(oldest), note: "", rating: null }
      : null,
  };
}

/* ───────────── Rows ───────────── */

/** Create PENDING rows for every RM for `week` (idempotent — unique per RM/week). Returns how many were new. */
export async function ensureReportRows(week: ReportWeek): Promise<number> {
  const rms = await listReportRms();
  if (!rms.length) return 0;
  const res = await prisma.weeklyReport.createMany({
    data: rms.map((r) => ({ rmUserId: r.userId, rmName: r.name, weekStart: week.start, weekEnd: week.end, storeIds: r.storeIds })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Build (or rebuild) one report: stats + summary → DONE, or FAILED with the error (retried up to 3×). */
export async function buildReport(reportId: number): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
  if (!row) return { ok: false, error: "Report not found." };
  try {
    const settings = await getReviewSettings();
    const week = weekFromStart(istYmd(row.weekStart));
    // Use the RM's CURRENT store mapping (fall back to the snapshot if they no longer manage any).
    const rm = (await listReportRms()).find((r) => r.userId === row.rmUserId)
      ?? { userId: row.rmUserId, name: row.rmName, code: null, workEmail: null, storeIds: row.storeIds };
    const stats = await buildReportStats(rm, week, settings);
    const summary = await generateSummary(stats);
    await prisma.weeklyReport.update({
      where: { id: reportId },
      data: {
        status: "DONE", stats: stats as unknown as Prisma.InputJsonValue, summary: summary as unknown as Prisma.InputJsonValue,
        summarySource: summary.source, storeIds: rm.storeIds, rmName: rm.name, error: null, generatedAt: new Date(), attempts: { increment: 1 },
      },
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Report generation failed";
    await prisma.weeklyReport.update({ where: { id: reportId }, data: { status: "FAILED", error: error.slice(0, 500), attempts: { increment: 1 } } }).catch(() => {});
    return { ok: false, error };
  }
}

/** Build PENDING (and retryable FAILED) reports, oldest first, until the time budget runs out. */
export async function processPendingReports(budgetMs: number): Promise<{ built: number; failed: number; remaining: number }> {
  const deadline = Date.now() + budgetMs;
  let built = 0, failed = 0;
  for (;;) {
    if (Date.now() > deadline) break;
    const next = await prisma.weeklyReport.findFirst({
      where: { OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: 3 } }] },
      orderBy: [{ weekStart: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (!next) break;
    const r = await buildReport(next.id);
    if (r.ok) built++; else failed++;
  }
  const remaining = await prisma.weeklyReport.count({ where: { OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: 3 } }] } });
  return { built, failed, remaining };
}
