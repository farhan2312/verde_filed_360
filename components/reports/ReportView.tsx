import Link from "next/link";
import type { ReactNode } from "react";
import type { ReportStats, ReportSummary, SummaryBullet, Tally, VisitRef } from "@/lib/report-types";

/** Full weekly report (server-rendered). Every cited visit links into the review queue drawer. */

const CARD = "print-avoid rounded-[14px] border border-black/[0.04] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const H = "mb-3 text-[14.5px] font-bold text-[#1A1C1A]";
const pct = (n: number) => `${Math.round(n)}%`;
const vid = (id: number) => `VIS-${String(id).padStart(4, "0")}`;

function VisitChips({ ids, max = 8 }: { ids: number[]; max?: number }) {
  if (!ids.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.slice(0, max).map((id) => (
        <Link key={id} href={`/visit-reviews?open=${id}`} prefetch={false}
          className="rounded-md bg-[#EEF3EE] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#7DA02E] hover:bg-[#DDEBDD]">{vid(id)}</Link>
      ))}
      {ids.length > max && <span className="text-[10.5px] text-[#9E9E9E]">+{ids.length - max}</span>}
    </span>
  );
}

function Delta({ cur, prev, unit = "", good = "up" }: { cur: number; prev: number | undefined; unit?: string; good?: "up" | "down" }) {
  if (prev == null) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return <span className="text-[11px] text-[#9E9E9E]">same as last week</span>;
  const better = good === "up" ? d > 0 : d < 0;
  return <span className={`text-[11px] font-semibold ${better ? "text-[#7DA02E]" : "text-[#C62828]"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}{unit} vs last week</span>;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-black/[0.04] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="text-[11px] font-semibold text-[#757575]">{label}</div>
      <div className="text-[22px] font-bold text-[#1A1C1A]">{value}</div>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  );
}

function Bullets({ items, tone }: { items: SummaryBullet[]; tone: string }) {
  if (!items.length) return <p className="text-[12.5px] italic text-[#9E9E9E]">Nothing to report.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((b, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[#33373A]">
          <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: tone }} />
          <span>{b.text}<VisitChips ids={b.visitIds} /></span>
        </li>
      ))}
    </ul>
  );
}

function TallyList({ title, items }: { title: string; items: Tally[] }) {
  if (!items.length) return null;
  const max = items[0].count;
  return (
    <div>
      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">{title}</div>
      <div className="flex flex-col gap-1.5">
        {items.slice(0, 6).map((t) => (
          <div key={t.label} className="text-[12.5px]">
            <div className="flex justify-between gap-2"><span className="truncate text-[#1A1C1A]">{t.label}</span><span className="font-semibold text-[#616161]">{t.count}</span></div>
            <div className="mt-0.5 h-1.5 rounded-full bg-[#F0F0F0]"><div className="h-1.5 rounded-full bg-[#81C784]" style={{ width: `${(t.count / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisitList({ title, rows, empty }: { title: string; rows: VisitRef[]; empty: string }) {
  return (
    <div className={CARD}>
      <div className={H}>{title}</div>
      {!rows.length ? <p className="text-[12.5px] italic text-[#9E9E9E]">{empty}</p> : (
        <div className="flex flex-col gap-2">
          {rows.map((v) => (
            <Link key={v.id} href={`/visit-reviews?open=${v.id}`} prefetch={false} className="rounded-[10px] border border-[#F0F0F0] px-3 py-2 hover:bg-[#F7FAF7]">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-semibold text-[#1A1C1A]">{v.farmer}</span>
                <span className="text-[#757575]">{v.officer} · {v.store} · {v.date}</span>
                {v.rating != null && <span className="text-[11px] font-semibold text-[#EDA942]">★{v.rating}</span>}
                <span className="ml-auto text-[10.5px] font-semibold text-[#7DA02E]">{vid(v.id)}</span>
              </div>
              {v.note && <div className="mt-0.5 line-clamp-2 text-[12px] text-[#616161]">{v.note}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportView({ stats: s, summary, generatedAt }: { stats: ReportStats; summary: ReportSummary | null; generatedAt: string }) {
  const t = s.totals;
  const zero = t.visits === 0;
  return (
    <div className="flex flex-col gap-[18px]">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Visits logged" value={t.visits.toLocaleString("en-IN")} sub={<Delta cur={t.visits} prev={s.prev?.visits} />} />
        <Kpi label="Reviewed" value={pct(t.reviewedPct)} sub={<span className="text-[11px] text-[#757575]">{t.reviewed} reviewed · {t.pending} pending</span>} />
        <Kpi label={`Within ${s.slaHours}h SLA`} value={pct(t.slaPct)} sub={<Delta cur={t.slaPct} prev={s.prev?.slaPct} unit=" pts" />} />
        <Kpi label="Avg turnaround" value={t.avgTurnaroundHrs == null ? "—" : `${Math.round(t.avgTurnaroundHrs)}h`} sub={<span className="text-[11px] text-[#757575]">logged → first review</span>} />
        <Kpi label="Needs follow-up" value={String(t.flagged)} />
        <Kpi label="Avg quality" value={t.avgRating == null ? "—" : `${t.avgRating.toFixed(1)}★`} sub={<span className="text-[11px] text-[#757575]">{t.rated} rated</span>} />
        <Kpi label="Farmers visited" value={t.farmers.toLocaleString("en-IN")} sub={<span className="text-[11px] text-[#757575]">{t.officersActive} active officers</span>} />
        <Kpi label="Backlog now" value={t.backlogPending.toLocaleString("en-IN")} sub={<span className={`text-[11px] ${t.backlogOverdue ? "font-semibold text-[#C62828]" : "text-[#757575]"}`}>{t.backlogOverdue} past SLA</span>} />
      </div>

      {/* Summary */}
      <div className={`${CARD} border-[#E9F2CF] bg-[#FBFDFB]`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-[#1A1C1A]">Summary</span>
          <span className="rounded-full bg-[#ECEFF1] px-2 py-0.5 text-[10.5px] font-semibold text-[#546E7A]">{summary?.source === "llm" ? "AI-generated" : "Auto-generated from this week's data"}</span>
        </div>
        {!summary ? (
          <p className="text-[12.5px] font-semibold text-[#C62828]">The summary is unavailable for this report — the data below is complete.</p>
        ) : (
          <>
            {summary.notice && <p className="mb-2 rounded-lg bg-[#FFF8E1] px-3 py-2 text-[12px] text-[#8D6E00]">{summary.notice}</p>}
            <p className="mb-4 text-[13.5px] leading-relaxed text-[#33373A]">{summary.narrative}</p>
            <div className="grid gap-5 md:grid-cols-3">
              <div><div className="mb-2 text-[12px] font-bold uppercase tracking-[0.4px] text-[#7DA02E]">Key findings</div><Bullets items={summary.findings} tone="#7DA02E" /></div>
              <div><div className="mb-2 text-[12px] font-bold uppercase tracking-[0.4px] text-[#C62828]">Concerns / flags</div><Bullets items={summary.concerns} tone="#C62828" /></div>
              <div><div className="mb-2 text-[12px] font-bold uppercase tracking-[0.4px] text-[#1565C0]">Recommended next steps</div><Bullets items={summary.strategy} tone="#1565C0" /></div>
            </div>
            <p className="mt-4 text-[11px] text-[#9E9E9E]">Each point links to the visits it was drawn from. Generated {generatedAt}.</p>
          </>
        )}
      </div>

      {zero ? (
        <div className={`${CARD} text-center text-[13px] text-[#757575]`}>No visits were logged in this region during the week.{s.inactiveOfficers.length ? ` Officers mapped here: ${s.inactiveOfficers.join(", ")}.` : ""}</div>
      ) : (
        <>
          {/* Officers */}
          <div className={CARD}>
            <div className={H}>Officers</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[12.5px]">
                <thead><tr className="border-b border-[#EEE] text-[10.5px] font-bold uppercase text-[#9E9E9E]"><th className="py-2">Officer</th><th className="text-right">Visits</th><th className="text-right">Farmers</th><th className="text-right">Reviewed</th><th className="text-right">Pending</th><th className="text-right">Follow-ups</th><th className="text-right">Avg ★</th></tr></thead>
                <tbody>
                  {s.officers.map((o) => (
                    <tr key={o.name} className="border-b border-[#F5F5F5]">
                      <td className="py-2 font-semibold text-[#1A1C1A]">{o.name}</td>
                      <td className="text-right">{o.visits}</td><td className="text-right">{o.farmers}</td>
                      <td className="text-right text-[#7DA02E]">{o.reviewed}</td><td className={`text-right ${o.pending ? "text-[#E65100]" : ""}`}>{o.pending}</td>
                      <td className="text-right">{o.flagged || "—"}</td><td className="text-right">{o.avgRating ?? "—"}</td>
                    </tr>
                  ))}
                  {s.inactiveOfficers.map((n) => (
                    <tr key={`in-${n}`} className="border-b border-[#F5F5F5] text-[#BDBDBD]"><td className="py-2">{n}</td><td className="text-right" colSpan={6}>no visits this week</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stores + themes */}
          <div className="grid gap-[18px] md:grid-cols-2">
            <div className={CARD}>
              <div className={H}>Stores</div>
              <div className="flex flex-col gap-1.5">
                {s.stores.map((st) => (
                  <div key={st.name} className="flex items-center justify-between gap-2 border-b border-[#F5F5F5] py-1.5 text-[12.5px]">
                    <span className="truncate text-[#1A1C1A]">{st.name}</span>
                    <span className="whitespace-nowrap text-[#616161]">{st.visits} visits · <span className="text-[#7DA02E]">{st.reviewed} reviewed</span>{st.pending ? <> · <span className="text-[#E65100]">{st.pending} pending</span></> : null}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${CARD} grid gap-5 sm:grid-cols-2`}>
              <TallyList title="Problems reported" items={s.problems} />
              <TallyList title="Pests / diseases" items={s.pests} />
              <TallyList title="Crops" items={s.crops} />
              <TallyList title="Products asked for" items={s.productsRequired} />
            </div>
          </div>

          <div className="grid gap-[18px] md:grid-cols-2">
            <VisitList title="Open follow-ups" rows={s.flaggedVisits} empty="No visits flagged for follow-up this week." />
            <VisitList title="Low-rated visits (≤2★)" rows={s.lowRated} empty="No visits rated 2★ or below." />
          </div>
          <VisitList title="Latest review comments" rows={s.recentComments} empty="No review comments this week." />
        </>
      )}
    </div>
  );
}
