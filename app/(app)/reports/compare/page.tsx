import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { istYmd, weekFromStart } from "@/lib/weekly-report";
import type { ReportStats, ReportSummary, SummaryBullet } from "@/lib/report-types";
import { ReportsTabs } from "@/components/reports/ReportsTabs";

export const dynamic = "force-dynamic";

const MAX = 4;
const pct = (n: number) => `${Math.round(n)}%`;
const vid = (id: number) => `VIS-${String(id).padStart(4, "0")}`;
const isYmd = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function Points({ title, tone, items }: { title: string; tone: string; items: SummaryBullet[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color: tone }}>{title}</div>
      {!items.length ? <p className="text-[12px] italic text-[#9E9E9E]">Nothing to report.</p> : (
        <ul className="flex flex-col gap-1.5">
          {items.map((b, i) => (
            <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-[#33373A]">
              <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: tone }} />
              <span>{b.text}{b.visitIds.slice(0, 3).map((id) => (
                <Link key={id} href={`/visit-reviews?open=${id}`} prefetch={false} className="ml-1 rounded bg-[#EEF3EE] px-1 py-0.5 text-[10px] font-semibold text-[#7DA02E]">{vid(id)}</Link>
              ))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Side-by-side summaries for up to 4 regions in one week (P1). Central / admin only. */
export default async function CompareReportsPage({ searchParams }: { searchParams?: { week?: string; rm?: string } }) {
  const role = await getRole();
  if (!canAccess("weeklyReports", role) || role === "regional") notFound();

  const weekGroups = await prisma.weeklyReport.groupBy({ by: ["weekStart"], where: { status: "DONE" }, orderBy: { weekStart: "desc" }, take: 26 }).catch(() => []);
  const weeks = weekGroups.map((w) => istYmd(w.weekStart));
  const week = isYmd(searchParams?.week) && weeks.includes(searchParams!.week!) ? searchParams!.week! : weeks[0];
  const reports = week
    ? await prisma.weeklyReport.findMany({ where: { weekStart: weekFromStart(week).start, status: "DONE" }, orderBy: { rmName: "asc" } }).catch(() => [])
    : [];
  const byVisits = [...reports].sort((a, b) => ((b.stats as unknown as ReportStats)?.totals.visits ?? 0) - ((a.stats as unknown as ReportStats)?.totals.visits ?? 0));
  const requested = (searchParams?.rm ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const selected = requested.length
    ? reports.filter((r) => requested.includes(r.rmUserId)).slice(0, MAX)
    : byVisits.slice(0, 3); // default: the three busiest regions
  const selIds = selected.map((r) => r.rmUserId);
  const href = (ids: number[]) => `/reports/compare?week=${week}${ids.length ? `&rm=${ids.join(",")}` : ""}`;

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <ReportsTabs active="compare" showCompare />
      {!week ? (
        <div className="rounded-[14px] bg-white px-4 py-12 text-center text-[13px] text-[#9E9E9E]">No completed reports yet.</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {weeks.map((w) => (
              <Link key={w} href={`/reports/compare?week=${w}${selIds.length ? `&rm=${selIds.join(",")}` : ""}`} prefetch={false}
                className={`rounded-full border-[1.5px] px-3 py-1.5 text-[12px] font-semibold ${w === week ? "border-[#7DA02E] bg-[#F5F9EA] text-[#7DA02E]" : "border-[#E0E0E0] bg-white text-[#616161]"}`}>
                {weekFromStart(w).label}
              </Link>
            ))}
          </div>
          <div className="mb-4 rounded-[14px] border border-black/[0.04] bg-white p-3">
            <div className="mb-2 text-[11.5px] text-[#757575]">Pick up to {MAX} regions to compare ({selected.length} selected)</div>
            <div className="flex flex-wrap gap-1.5">
              {reports.map((r) => {
                const on = selIds.includes(r.rmUserId);
                const next = on ? selIds.filter((x) => x !== r.rmUserId) : selIds.length < MAX ? [...selIds, r.rmUserId] : selIds;
                return (
                  <Link key={r.id} href={href(next)} prefetch={false} aria-disabled={!on && selIds.length >= MAX}
                    className={`rounded-full border-[1.5px] px-2.5 py-1 text-[11.5px] font-semibold ${on ? "border-[#1565C0] bg-[#E3F2FD] text-[#1565C0]" : !on && selIds.length >= MAX ? "cursor-not-allowed border-[#EEEEEE] text-[#BDBDBD]" : "border-[#E0E0E0] bg-white text-[#616161] hover:border-[#1565C0]"}`}>
                    {on ? "✓ " : ""}{r.rmName}
                  </Link>
                );
              })}
            </div>
          </div>

          {!selected.length ? (
            <div className="rounded-[14px] bg-white px-4 py-12 text-center text-[13px] text-[#9E9E9E]">Pick regions above to compare.</div>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="grid gap-[14px]" style={{ gridTemplateColumns: `repeat(${selected.length}, minmax(290px, 1fr))` }}>
                {selected.map((r) => {
                  const s = r.stats as unknown as ReportStats;
                  const sum = r.summary as unknown as ReportSummary | null;
                  const t = s.totals;
                  return (
                    <div key={r.id} className="flex flex-col gap-3 rounded-[14px] border border-black/[0.04] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div>
                        <Link href={`/reports/${r.id}`} prefetch={false} className="text-[15px] font-bold text-[#1A1C1A] hover:text-[#7DA02E]">{r.rmName}</Link>
                        <div className="text-[11.5px] text-[#9E9E9E]">{s.storeCount} stores · {t.officersActive} active officers</div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        {[["Visits", t.visits.toLocaleString("en-IN")], ["Reviewed", pct(t.reviewedPct)], [`In ${s.slaHours}h SLA`, t.visits ? pct(t.slaPct) : "—"], ["Follow-ups", String(t.flagged)], ["Avg ★", t.avgRating?.toFixed(1) ?? "—"], ["Overdue now", t.backlogOverdue.toLocaleString("en-IN")]].map(([l, v]) => (
                          <div key={l} className="rounded-[8px] bg-[#F7F9F7] px-1 py-1.5">
                            <div className="text-[10px] text-[#757575]">{l}</div>
                            <div className="text-[14px] font-bold text-[#1A1C1A]">{v}</div>
                          </div>
                        ))}
                      </div>
                      {sum ? (
                        <>
                          <p className="text-[12.5px] leading-relaxed text-[#33373A]">{sum.narrative}</p>
                          <Points title="Key findings" tone="#7DA02E" items={sum.findings} />
                          <Points title="Concerns / flags" tone="#C62828" items={sum.concerns} />
                          <Points title="Next steps" tone="#1565C0" items={sum.strategy} />
                        </>
                      ) : <p className="text-[12px] text-[#C62828]">Summary unavailable.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
