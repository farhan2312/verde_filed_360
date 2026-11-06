import { prisma } from "@/lib/prisma";
import { shortStoreName } from "@/lib/store-utils";
import { buildStyledWorkbookB64, type StyledCell, type StyledSheetSpec } from "@/lib/xlsx-styled";
import { istYmd, visitsInStores, weekFromStart } from "@/lib/weekly-report";
import type { ReportStats, ReportSummary } from "@/lib/report-types";

/**
 * Excel exports for weekly reports, in the house style (lib/xlsx-styled: Aptos 11, blue header, outer
 * border, frozen header). Column explanations live in the header text; findings live in a Remarks column.
 */

const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);
const vid = (id: number) => `VIS-${String(id).padStart(4, "0")}`;
const ist = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/** One RM's weekly report → Headline · Summary · Officers · Stores · Themes · Visits. */
export async function buildReportXlsx(reportId: number): Promise<{ filename: string; buffer: Buffer } | null> {
  const row = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
  if (!row || row.status !== "DONE" || !row.stats) return null;
  const s = row.stats as unknown as ReportStats;
  const sum = row.summary as unknown as ReportSummary | null;
  const t = s.totals, p = s.prev;
  const sla = s.slaHours;

  const headline: StyledCell[][] = [
    ["Measure", "This week", "Previous week", "Remarks"],
    ["Visits logged", t.visits, p?.visits ?? null, p ? (t.visits >= p.visits ? `Up ${t.visits - p.visits}` : `Down ${p.visits - t.visits}`) : "No previous week"],
    ["Visits reviewed", t.reviewed, p?.reviewed ?? null, t.pending ? `${t.pending} still pending` : "All reviewed"],
    ["Reviewed (% of the week's visits)", r1(t.reviewedPct), p ? r1(p.reviewedPct) : null, ""],
    [`Reviewed within the ${sla}h SLA (% of the week's visits)`, r1(t.slaPct), p ? r1(p.slaPct) : null, t.visits && t.slaPct < 90 ? "Below the 90% target" : t.visits ? "On target" : ""],
    ["Average turnaround (hours, logged → first review)", r1(t.avgTurnaroundHrs), null, ""],
    ["Visits flagged for follow-up", t.flagged, null, ""],
    ["Average visit quality (rating 1–5)", r1(t.avgRating), null, `${t.rated} visits rated`],
    ["Farmers visited (distinct)", t.farmers, null, ""],
    ["Active officers", t.officersActive, null, s.inactiveOfficers.length ? `${s.inactiveOfficers.length} mapped officers logged no visits` : ""],
    ["Unreviewed visits in these stores now (all weeks)", t.backlogPending, null, ""],
    [`… of which past the ${sla}h SLA`, t.backlogOverdue, null, s.oldestPending ? `Oldest from ${s.oldestPending.date}` : ""],
  ];

  const summary: StyledCell[][] = [["Section", "Point", "Visits it was drawn from (IDs)"]];
  if (sum) {
    summary.push(["Narrative", sum.narrative, ""]);
    for (const [label, items] of [["Key finding", sum.findings], ["Concern / flag", sum.concerns], ["Recommended next step", sum.strategy]] as const)
      for (const b of items) summary.push([label, b.text, b.visitIds.map(vid).join(", ")]);
  } else summary.push(["—", "Summary unavailable for this report.", ""]);

  const officers: StyledCell[][] = [["Officer", "Visits", "Farmers visited", "Reviewed", "Pending review", "Flagged for follow-up", "Average rating (1–5)", "Remarks"]];
  for (const o of s.officers)
    officers.push([o.name, o.visits, o.farmers, o.reviewed, o.pending, o.flagged, r1(o.avgRating), [o.pending ? `${o.pending} awaiting review` : "", o.avgRating != null && o.avgRating <= 2 ? "Low average rating" : ""].filter(Boolean).join("; ")]);
  for (const n of s.inactiveOfficers) officers.push([n, 0, 0, 0, 0, 0, null, "No visits logged this week"]);

  const stores: StyledCell[][] = [["Store", "Visits", "Reviewed", "Pending review", "Flagged for follow-up", "Remarks"]];
  for (const st of s.stores) stores.push([st.name, st.visits, st.reviewed, st.pending, st.flagged, st.visits === 0 ? "No visits this week" : ""]);

  const themes: StyledCell[][] = [["Theme", "Item", "Visits (count)", "Visit IDs"]];
  for (const [label, list] of [["Problem reported", s.problems], ["Pest / disease", s.pests], ["Crop", s.crops], ["Product asked for", s.productsRequired], ["Crop risk", s.cropRisks]] as const)
    for (const x of list) themes.push([label, x.label, x.count, x.visitIds.slice(0, 40).map(vid).join(", ") + (x.visitIds.length > 40 ? ` (+${x.visitIds.length - 40})` : "")]);

  // Every visit of the week (light columns — never the media).
  const week = weekFromStart(istYmd(row.weekStart));
  const visits = await prisma.visit.findMany({
    where: { AND: [visitsInStores(row.storeIds), { OR: [{ visitedAt: { gte: week.start, lt: week.end } }, { visitedAt: null, createdAt: { gte: week.start, lt: week.end } }] }] },
    orderBy: { id: "asc" },
    select: {
      id: true, date: true, visitedAt: true, createdAt: true, officerName: true, purpose: true, mainCrop: true, currentProblem: true, pests: true,
      reviewedAt: true, firstReviewedAt: true, reviewedByName: true, reviewRating: true, reviewFlagged: true, reviewNote: true,
      farmer: { select: { name: true, village: true } }, store: { select: { name: true } },
    },
  });
  const vrows: StyledCell[][] = [[
    "Visit ID", "Visit date", "Logged at (IST)", "Farmer", "Village", "Officer", "Store", "Visit type", "Main crop", "Problems", "Pests / diseases",
    "Review status", "Reviewed by", "Turnaround (hours, logged → first review)", `Within ${sla}h SLA`, "Rating (1–5)", "Needs follow-up", "Review comment",
  ]];
  for (const v of visits) {
    const turn = v.reviewedAt ? ((v.firstReviewedAt ?? v.reviewedAt).getTime() - v.createdAt.getTime()) / 3_600_000 : null;
    vrows.push([
      vid(v.id), v.date?.trim() || (v.visitedAt ? ist(v.visitedAt).split(",")[0] : ""), ist(v.createdAt), v.farmer?.name ?? "Store visit", v.farmer?.village ?? "",
      v.officerName ?? "", shortStoreName(v.store?.name) || "", v.purpose ?? "", v.mainCrop ?? "", (v.currentProblem ?? []).join(", "), (v.pests ?? []).join(", "),
      v.reviewedAt ? "Reviewed" : "Pending", v.reviewedByName ?? "", turn == null ? null : r1(turn), turn == null ? "" : turn <= sla ? "Yes" : "No",
      v.reviewRating, v.reviewFlagged ? "Yes" : "", v.reviewNote ?? "",
    ]);
  }

  const sheets: StyledSheetSpec[] = [
    { name: "Headline", rows: headline, numFmt: { 1: "#,##0.0", 2: "#,##0.0" }, wrapCols: [0, 3], wrapHeaders: true },
    { name: "Summary", rows: summary, wrapCols: [1, 2], wrapHeaders: true },
    { name: "Officers", rows: officers, numFmt: { 6: "0.0" }, wrapCols: [7], wrapHeaders: true },
    { name: "Stores", rows: stores, wrapHeaders: true },
    { name: "Themes", rows: themes, wrapCols: [3], wrapHeaders: true },
    { name: "Visits", rows: vrows, numFmt: { 13: "#,##0.0" }, wrapCols: [17], wrapHeaders: true },
  ];
  const b64 = await buildStyledWorkbookB64(sheets);
  const safe = `${row.rmName} - weekly report - ${week.startYmd}`.replace(/[\\/?*[\]:"<>|]/g, " ");
  return { filename: `${safe}.xlsx`, buffer: Buffer.from(b64, "base64") };
}

/** Every region for one week → a single comparison sheet. */
export async function buildWeekXlsx(weekYmd: string): Promise<{ filename: string; buffer: Buffer } | null> {
  const week = weekFromStart(weekYmd);
  const rows = await prisma.weeklyReport.findMany({ where: { weekStart: week.start }, orderBy: { rmName: "asc" } });
  if (!rows.length) return null;
  const sla = (rows.find((r) => r.stats)?.stats as unknown as ReportStats | undefined)?.slaHours ?? 48;
  const out: StyledCell[][] = [[
    "Regional Manager", "Stores", "Visits logged", "Reviewed", "Reviewed (%)", `Within ${sla}h SLA`, `Within SLA (% of visits)`,
    "Average turnaround (hours)", "Flagged for follow-up", "Average rating (1–5)", "Unreviewed now (all weeks)", `Past ${sla}h SLA now`, "Remarks",
  ]];
  for (const r of rows) {
    const s = r.stats as unknown as ReportStats | null;
    if (r.status !== "DONE" || !s) { out.push([r.rmName, r.storeIds.length, null, null, null, null, null, null, null, null, null, null, r.status === "PENDING" ? "Report still generating" : `Report failed${r.error ? `: ${r.error}` : ""}`]); continue; }
    const t = s.totals;
    const remarks = [t.visits === 0 ? "No visits this week" : "", t.visits && t.slaPct < 90 ? "Below the 90% SLA target" : "", s.inactiveOfficers.length ? `${s.inactiveOfficers.length} officers logged no visits` : ""].filter(Boolean).join("; ");
    out.push([r.rmName, s.storeCount, t.visits, t.reviewed, r1(t.reviewedPct), t.withinSla, r1(t.slaPct), r1(t.avgTurnaroundHrs), t.flagged, r1(t.avgRating), t.backlogPending, t.backlogOverdue, remarks]);
  }
  const b64 = await buildStyledWorkbookB64([{ name: "Regions", rows: out, numFmt: { 4: "0.0", 6: "0.0", 7: "#,##0.0", 9: "0.0" }, wrapCols: [12], wrapHeaders: true }]);
  return { filename: `Weekly visit review - all regions - ${weekYmd}.xlsx`, buffer: Buffer.from(b64, "base64") };
}
