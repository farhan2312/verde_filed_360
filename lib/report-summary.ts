import type { ReportStats, ReportSummary, SummaryBullet, Tally } from "@/lib/report-types";

/**
 * Weekly-report summary (R5): Key Findings · Concerns / Flags · Recommended Strategy, plus a narrative.
 *
 * Providers plug in behind `SummaryProvider`. Today only the TEMPLATE provider exists: paragraphs with the
 * week's computed facts plugged in, plus rule-based next steps. Every bullet carries the visit ids it was
 * drawn from, so nothing is asserted that isn't in the data (the PRD's no-fabrication guardrail).
 *
 * Adding an LLM later: implement `SummaryProvider` (e.g. lib/report-summary-llm.ts) that sends the stats
 * plus the week's visit notes / RM comments and returns the same ReportSummary shape with visitIds, then
 * return it from `pickProvider()` when its env key is set. `generateSummary` already falls back to the
 * template (with a notice) if the provider throws or times out.
 */
export interface SummaryProvider {
  name: "template" | "llm";
  generate(stats: ReportStats): Promise<ReportSummary>;
}

const pct = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const hrs = (h: number | null) => (h == null ? "—" : h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)} days`);
const list = (xs: string[], max = 3) => {
  const a = xs.slice(0, max);
  const more = xs.length - a.length;
  const body = a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
  return more > 0 ? `${body} (+${more} more)` : body;
};
const ids = (t: Tally | undefined, max = 12) => (t ? t.visitIds.slice(0, max) : []);
const delta = (cur: number, prev: number | undefined) => {
  if (prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
};

export const templateProvider: SummaryProvider = {
  name: "template",
  async generate(s: ReportStats): Promise<ReportSummary> {
    const t = s.totals;
    const findings: SummaryBullet[] = [];
    const concerns: SummaryBullet[] = [];
    const strategy: SummaryBullet[] = [];

    if (t.visits === 0) {
      const narrative = `No visits were logged in ${s.rmName}'s ${plural(s.storeCount, "store")} during the week of ${s.weekLabel}.`;
      if (s.inactiveOfficers.length)
        concerns.push({ text: `No field activity recorded from ${list(s.inactiveOfficers, 5)}.`, visitIds: [] });
      if (t.backlogPending)
        concerns.push({ text: `${plural(t.backlogPending, "older visit")} still await review (${t.backlogOverdue} past the ${s.slaHours}h SLA).`, visitIds: s.oldestPending ? [s.oldestPending.id] : [] });
      strategy.push({ text: "Confirm officers are logging visits in the app — check in with each store this week.", visitIds: [] });
      if (t.backlogPending) strategy.push({ text: "Use the quiet week to clear the review backlog, oldest first.", visitIds: s.oldestPending ? [s.oldestPending.id] : [] });
      return { narrative, findings, concerns, strategy, source: "template" };
    }

    // ── Narrative ──
    const dv = delta(t.visits, s.prev?.visits);
    const parts = [
      `In the week of ${s.weekLabel}, ${plural(t.officersActive, "officer")} across ${s.rmName}'s ${plural(s.storeCount, "store")} logged ${plural(t.visits, "visit")} to ${plural(t.farmers, "farmer")}${dv != null ? ` (${dv >= 0 ? "+" : ""}${dv}% vs the previous week)` : ""}.`,
      t.reviewed === 0
        ? "None of them have been reviewed yet."
        : `${plural(t.reviewed, "visit")} ${t.reviewed === 1 ? "has" : "have"} been reviewed (${pct(t.reviewedPct)}); ${pct(t.slaPct)} of the week's visits were reviewed within the ${s.slaHours}h SLA${t.avgTurnaroundHrs != null ? `, with an average turnaround of ${hrs(t.avgTurnaroundHrs)}` : ""}.`,
    ];
    if (t.flagged) parts.push(`${plural(t.flagged, "visit")} ${t.flagged === 1 ? "is" : "are"} flagged for follow-up.`);
    if (t.avgRating != null) parts.push(`Average visit quality was ${t.avgRating.toFixed(1)}/5 across ${plural(t.rated, "rated visit")}.`);
    const narrative = parts.join(" ");

    // ── Key findings ──
    // A theme needs at least 2 visits behind it — a single mention isn't a pattern.
    const [p1, p2] = s.problems.filter((x) => x.count >= 2);
    const pests = s.pests.filter((x) => x.count >= 2);
    const risks = s.cropRisks.filter((x) => x.count >= 2);
    if (p1) {
      const crop = s.problemCrop[p1.label];
      findings.push({ text: `${p1.label} was the most reported problem — ${plural(p1.count, "visit")}${crop ? `, mostly on ${crop}` : ""}.`, visitIds: ids(p1) });
    }
    if (p2) findings.push({ text: `${p2.label} came next (${plural(p2.count, "visit")}${s.problemCrop[p2.label] ? `, mostly ${s.problemCrop[p2.label]}` : ""}).`, visitIds: ids(p2) });
    if (pests[0]) findings.push({ text: `Pest / disease pressure: ${list(pests.slice(0, 3).map((x) => `${x.label} (${x.count})`))}.`, visitIds: pests.slice(0, 3).flatMap((x) => ids(x, 5)) });
    if (s.crops[0]) findings.push({ text: `Crops covered most (visits): ${list(s.crops.slice(0, 4).map((x) => `${x.label} ${x.count}`), 4)}.`, visitIds: [] });
    if (s.productsRequired[0]) findings.push({ text: `Farmers asked for ${list(s.productsRequired.slice(0, 3).map((x) => `${x.label} (${x.count})`))} — a demand signal for these stores.`, visitIds: s.productsRequired.slice(0, 3).flatMap((x) => ids(x, 5)) });
    const top = s.officers[0];
    if (top && s.officers.length > 1) findings.push({ text: `${top.name} was the most active officer with ${plural(top.visits, "visit")}.`, visitIds: [] });

    // ── Concerns / flags ──
    if (t.pending) concerns.push({ text: `${plural(t.pending, "visit")} from this week ${t.pending === 1 ? "is" : "are"} still unreviewed.`, visitIds: [] });
    if (t.backlogOverdue) concerns.push({ text: `${plural(t.backlogOverdue, "visit")} in your stores ${t.backlogOverdue === 1 ? "is" : "are"} past the ${s.slaHours}h review SLA${s.oldestPending ? ` — the oldest is from ${s.oldestPending.date}` : ""}.`, visitIds: s.oldestPending ? [s.oldestPending.id] : [] });
    if (s.flaggedVisits.length) concerns.push({ text: `Open follow-ups: ${list(s.flaggedVisits.map((v) => `${v.farmer} (${v.officer})`), 3)}.`, visitIds: s.flaggedVisits.map((v) => v.id) });
    if (s.lowRated.length) concerns.push({ text: `${plural(s.lowRated.length, "visit")} rated 2★ or below — ${list([...new Set(s.lowRated.map((v) => v.officer))], 3)}.`, visitIds: s.lowRated.map((v) => v.id) });
    if (s.inactiveOfficers.length) concerns.push({ text: `No visits logged by ${list(s.inactiveOfficers, 4)}.`, visitIds: [] });
    if (risks[0]) concerns.push({ text: `Crop risk noted: ${list(risks.slice(0, 3).map((x) => `${x.label} (${x.count})`))}.`, visitIds: risks.slice(0, 3).flatMap((x) => ids(x, 5)) });
    if (dv != null && dv <= -20) concerns.push({ text: `Visit volume fell ${Math.abs(dv)}% from the previous week (${s.prev!.visits} → ${t.visits}).`, visitIds: [] });

    // ── Recommended strategy / next steps (rules over the facts above) ──
    if (t.backlogPending) strategy.push({ text: `Clear the ${plural(t.backlogPending, "pending review")} in Visit Reviews, starting with the oldest${t.backlogOverdue ? ` (${t.backlogOverdue.toLocaleString("en-IN")} already overdue)` : ""}.`, visitIds: s.oldestPending ? [s.oldestPending.id] : [] });
    if (t.slaPct < 90) strategy.push({ text: `Block a short daily review slot — only ${pct(t.slaPct)} of visits met the ${s.slaHours}h SLA against the 90% target.`, visitIds: [] });
    if (p1) {
      const crop = s.problemCrop[p1.label];
      strategy.push({ text: `Plan an advisory or demo on ${p1.label.toLowerCase()}${crop ? ` for ${crop} growers` : ""} — it came up on ${plural(p1.count, "visit")}.`, visitIds: ids(p1) });
    }
    if (s.productsRequired[0] && s.productsRequired[0].count >= 2) strategy.push({ text: `Check stock of ${s.productsRequired[0].label} at these stores — farmers asked for it on ${plural(s.productsRequired[0].count, "visit")}.`, visitIds: ids(s.productsRequired[0]) });
    if (s.flaggedVisits.length) strategy.push({ text: `Close the ${plural(s.flaggedVisits.length, "open follow-up")} in the Action Registry.`, visitIds: s.flaggedVisits.map((v) => v.id) });
    if (s.lowRated.length) strategy.push({ text: `Coach on visit quality with ${list([...new Set(s.lowRated.map((v) => v.officer))], 3)} using the low-rated visits as examples.`, visitIds: s.lowRated.map((v) => v.id) });
    if (s.inactiveOfficers.length) strategy.push({ text: `Check in with ${list(s.inactiveOfficers, 4)} — no visits this week.`, visitIds: [] });
    if (dv != null && dv <= -20) strategy.push({ text: "Review officers' routes and weekly visit targets to recover volume.", visitIds: [] });
    if (!strategy.length) strategy.push({ text: "Keep the current cadence — reviews and follow-ups are on track this week.", visitIds: [] });

    return { narrative, findings, concerns, strategy, source: "template" };
  },
};

/** Which provider to use. Only the template exists today; return an LLM provider here once one is added. */
function pickProvider(): SummaryProvider {
  return templateProvider;
}

/** Generate the summary; if a (future) LLM provider fails, fall back to the template with a notice (R5). */
export async function generateSummary(stats: ReportStats): Promise<ReportSummary> {
  const provider = pickProvider();
  try {
    return await provider.generate(stats);
  } catch {
    if (provider.name === "template") throw new Error("Summary generation failed");
    const fallback = await templateProvider.generate(stats);
    return { ...fallback, notice: "AI summary unavailable for this report — showing the standard summary." };
  }
}
