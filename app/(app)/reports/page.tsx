import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { getSession } from "@/lib/auth";
import { canAccess } from "@/lib/roles";
import { istYmd, weekFromStart } from "@/lib/weekly-report";
import { getReviewSettings } from "@/lib/review-settings";
import type { ReportStats } from "@/lib/report-types";
import { GenerateNowButton } from "@/components/reports/ReportAdminButtons";
import { ReportsTabs } from "@/components/reports/ReportsTabs";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // "Generate now" builds reports inline

const CARD = "overflow-hidden rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const pct = (n: number) => `${Math.round(n)}%`;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const isYmd = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

type Row = { id: number; rmName: string; status: string; weekStart: Date; stats: ReportStats | null; error: string | null };

function StatusChip({ status }: { status: string }) {
  const m: Record<string, [string, string, string]> = { DONE: ["#F5F9EA", "#7DA02E", "Ready"], PENDING: ["#FFF8E1", "#8D6E00", "Generating…"], FAILED: ["#FDECEA", "#C62828", "Failed"] };
  const [bg, c, l] = m[status] ?? ["#F5F5F5", "#616161", status];
  return <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: bg, color: c }}>{l}</span>;
}

function ReportTable({ rows, showRm }: { rows: Row[]; showRm: boolean }) {
  return (
    <div className={CARD}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]">
              <th className="px-4 py-2.5">{showRm ? "Regional Manager" : "Week"}</th><th>Status</th><th className="text-right">Visits</th><th className="text-right">Reviewed</th>
              <th className="text-right">Within SLA</th><th className="text-right">Follow-ups</th><th className="text-right">Avg ★</th><th className="pr-4 text-right">Overdue now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = r.stats?.totals;
              return (
                <tr key={r.id} className="border-b border-[#F5F5F5] hover:bg-[#F7FAF7]">
                  <td className="px-4 py-2.5">
                    <Link href={`/reports/${r.id}`} prefetch={false} className="font-semibold text-[#1A1C1A] hover:text-[#7DA02E]">
                      {showRm ? r.rmName : weekFromStart(istYmd(r.weekStart)).label}
                    </Link>
                  </td>
                  <td><StatusChip status={r.status} /></td>
                  <td className="text-right">{t ? t.visits : "—"}</td>
                  <td className="text-right">{t ? pct(t.reviewedPct) : "—"}</td>
                  <td className={`text-right font-semibold ${t && t.visits && t.slaPct < 90 ? "text-[#C62828]" : "text-[#7DA02E]"}`}>{t && t.visits ? pct(t.slaPct) : "—"}</td>
                  <td className="text-right">{t ? t.flagged : "—"}</td>
                  <td className="text-right">{t?.avgRating != null ? t.avgRating.toFixed(1) : "—"}</td>
                  <td className={`pr-4 text-right ${t?.backlogOverdue ? "text-[#C62828]" : ""}`}>{t ? t.backlogOverdue : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams?: { week?: string } }) {
  const role = await getRole();
  if (!canAccess("weeklyReports", role)) notFound();
  const session = await getSession();
  const settings = await getReviewSettings();
  const schedule = `Generated every ${DAYS[settings.reportDay]} at ${String(settings.reportHour).padStart(2, "0")}:00 IST for the previous ${DAYS[settings.weekStartDay]}–${DAYS[(settings.weekStartDay + 6) % 7]} week.`;

  // RM: their own reports, newest first.
  if (role === "regional") {
    const rows = session ? (await prisma.weeklyReport.findMany({ where: { rmUserId: session.userId }, orderBy: { weekStart: "desc" }, take: 52 }).catch(() => [])) as unknown as Row[] : [];
    return (
      <div className="animate-[fadeUp_0.4s_ease-out]">
        <ReportsTabs active="reports" showCompare={false} />
        <p className="mb-3 text-[12.5px] text-[#757575]">{schedule}</p>
        {rows.length ? <ReportTable rows={rows} showRm={false} /> : (
          <div className={`${CARD} px-4 py-12 text-center text-[13px] text-[#9E9E9E]`}>
            {session?.isAdmin ? "You're viewing as a Regional Manager — reports belong to real RM accounts. Switch back to see all regions." : "No reports yet — your first one arrives after the next scheduled run."}
          </div>
        )}
      </div>
    );
  }

  // Central / sysadmin: one week at a time, every RM.
  const weekGroups = await prisma.weeklyReport.groupBy({ by: ["weekStart"], _count: { _all: true }, orderBy: { weekStart: "desc" }, take: 26 }).catch(() => []);
  const weeks = weekGroups.map((w) => istYmd(w.weekStart));
  const selected = isYmd(searchParams?.week) && weeks.includes(searchParams!.week!) ? searchParams!.week! : weeks[0];
  const rows = selected
    ? ((await prisma.weeklyReport.findMany({ where: { weekStart: weekFromStart(selected).start }, orderBy: { rmName: "asc" } }).catch(() => [])) as unknown as Row[])
    : [];
  const done = rows.filter((r) => r.status === "DONE" && r.stats);
  const totVisits = done.reduce((a, r) => a + (r.stats!.totals.visits), 0);
  const totWithin = done.reduce((a, r) => a + (r.stats!.totals.withinSla), 0);
  const totReviewed = done.reduce((a, r) => a + (r.stats!.totals.reviewed), 0);

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <ReportsTabs active="reports" showCompare />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {weeks.map((w) => (
          <Link key={w} href={`/reports?week=${w}`} prefetch={false}
            className={`rounded-full border-[1.5px] px-3 py-1.5 text-[12px] font-semibold ${w === selected ? "border-[#7DA02E] bg-[#F5F9EA] text-[#7DA02E]" : "border-[#E0E0E0] bg-white text-[#616161]"}`}>
            {weekFromStart(w).label}
          </Link>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {selected && rows.length > 0 && (
            <a href={`/api/reports/week/${selected}/export`} className="rounded-[10px] bg-[#66852A] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#7DA02E]">⬇ Excel (all regions)</a>
          )}
          {session?.isAdmin && <GenerateNowButton />}
        </span>
      </div>
      <p className="mb-3 text-[12.5px] text-[#757575]">{schedule}</p>

      {selected && done.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div className="rounded-[12px] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"><div className="text-[11px] text-[#757575]">Visits, all regions</div><div className="text-[20px] font-bold">{totVisits.toLocaleString("en-IN")}</div></div>
          <div className="rounded-[12px] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"><div className="text-[11px] text-[#757575]">Reviewed</div><div className="text-[20px] font-bold">{totVisits ? pct((totReviewed / totVisits) * 100) : "—"}</div></div>
          <div className="rounded-[12px] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"><div className="text-[11px] text-[#757575]">Within SLA</div><div className={`text-[20px] font-bold ${totVisits && totWithin / totVisits < 0.9 ? "text-[#C62828]" : "text-[#7DA02E]"}`}>{totVisits ? pct((totWithin / totVisits) * 100) : "—"}</div></div>
        </div>
      )}

      {rows.length ? <ReportTable rows={rows} showRm /> : (
        <div className={`${CARD} px-4 py-12 text-center text-[13px] text-[#9E9E9E]`}>
          No reports yet. They’re created automatically at the scheduled time{session?.isAdmin ? " — or use “Generate last week now”." : "."}
        </div>
      )}
    </div>
  );
}
