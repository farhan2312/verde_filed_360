"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getPerformance, type PerfKind, type PerfData, type PerfEntity, type PerfRange } from "@/app/actions/analytics-performance";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const money = (x: number) => (x >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : x >= 1e5 ? `₹${(x / 1e5).toFixed(1)} L` : x >= 1e3 ? `₹${(x / 1e3).toFixed(1)}k` : `₹${n(x)}`);
const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
const ACCENT = "#1565C0";

/* ── time range presets → {from,to,prevFrom,prevTo,label} ── */
type Preset = "month" | "d30" | "d90" | "fy" | "lastfy" | "all" | "custom";
// Local Y-M-D (never toISOString — that shifts to UTC and drifts a day back in IST at midnight boundaries).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, k: number) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
const addMonths = (d: Date, k: number) => { const x = new Date(d); x.setMonth(x.getMonth() + k); return x; };
const addYears = (d: Date, k: number) => { const x = new Date(d); x.setFullYear(x.getFullYear() + k); return x; };
// FY start (Apr 1) for the FY that `d` falls in.
const fyStart = (d: Date) => new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);

function computeRange(preset: Preset, cf?: string, ct?: string): PerfRange {
  const now = new Date();
  const win = (from: Date, to: Date, prevFrom: Date, prevTo: Date, label: string): PerfRange =>
    ({ from: iso(from), to: iso(to), prevFrom: iso(prevFrom), prevTo: iso(prevTo), label });
  switch (preset) {
    case "month": { const from = new Date(now.getFullYear(), now.getMonth(), 1); return win(from, now, addMonths(from, -1), addMonths(now, -1), "This month · vs last month"); }
    case "d30": { const from = addDays(now, -30); return win(from, now, addDays(from, -30), from, "Last 30 days · vs prior 30"); }
    case "d90": { const from = addDays(now, -90); return win(from, now, addDays(from, -90), from, "Last 90 days · vs prior 90"); }
    case "fy": { const from = fyStart(now); return win(from, now, addYears(from, -1), addYears(now, -1), "This FY · vs last FY (YoY)"); }
    case "lastfy": { const from = addYears(fyStart(now), -1); const to = fyStart(now); return win(from, to, addYears(from, -1), addYears(to, -1), "Last FY · vs FY before"); }
    case "custom": {
      if (cf && ct) { const from = new Date(cf), to = new Date(ct); const len = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)); return win(from, to, addDays(from, -len), from, `${cf} → ${ct} · vs prior ${len}d`); }
      return { label: "Custom" };
    }
    default: return { label: "All time" };
  }
}

const PRESETS: [Preset, string][] = [["month", "This month"], ["d30", "30 days"], ["d90", "90 days"], ["fy", "This FY"], ["lastfy", "Last FY"], ["all", "All time"]];

const KIND_NOUN: Record<PerfKind, string> = { stores: "Store", rms: "Regional Manager", officers: "Agri Officer" };

export function PerformanceBoard({ kind, storeTags }: { kind: PerfKind; storeTags: { id: number; name: string }[] }) {
  const [preset, setPreset] = useState<Preset>("fy");
  const [cf, setCf] = useState(""); const [ct, setCt] = useState("");
  const [tags, setTags] = useState<number[]>([]);
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set()); // compare selection

  const range = useMemo(() => ({ ...computeRange(preset, cf, ct), storeTags: tags.length ? tags : undefined }), [preset, cf, ct, tags]);

  useEffect(() => {
    start(async () => setData(await getPerformance(kind, range)));
    setSel(new Set()); // reset compare when axis/range changes
  }, [kind, range]);

  const rows = data?.rows ?? [];
  const t = data?.totals;
  const showSales = kind !== "officers"; // officers carry no per-person sales / leads
  const compareRows = rows.filter((r) => sel.has(r.id));
  const toggleSel = (id: string) => setSel((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : (x.size < 4 && x.add(id)); return x; });

  return (
    <div className="animate-[fadeUp_0.35s_ease-out] flex flex-col gap-[14px]">
      {/* Controls: time range + tag filter */}
      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">Period:</span>
        {PRESETS.map(([p, label]) => (
          <button key={p} type="button" onClick={() => setPreset(p)}
            className="rounded-[20px] px-3.5 py-[6px] text-[12px] font-semibold transition-colors"
            style={{ background: preset === p ? "#5C7D22" : "white", color: preset === p ? "white" : "#616161", border: `1.5px solid ${preset === p ? "#5C7D22" : "#E0E0E0"}` }}>
            {label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 rounded-[10px] border border-[#E0E0E0] px-2 py-1">
          <input type="date" value={cf} onChange={(e) => { setCf(e.target.value); setPreset("custom"); }} className="text-[12px] text-[#424242] outline-none" aria-label="From date" />
          <span className="text-[#BDBDBD]">→</span>
          <input type="date" value={ct} onChange={(e) => { setCt(e.target.value); setPreset("custom"); }} className="text-[12px] text-[#424242] outline-none" aria-label="To date" />
        </div>
        {storeTags.length > 0 && kind !== "officers" && (
          <TagFilter tags={storeTags} selected={tags} onToggle={(id) => setTags((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])} onClear={() => setTags([])} />
        )}
        <div className="ml-auto text-[12px] font-medium text-[#9E9E9E]">
          {loading ? "Updating…" : `${rows.length} ${KIND_NOUN[kind].toLowerCase()}${rows.length === 1 ? "" : "s"}`}
        </div>
      </div>
      <div className="-mt-1 text-[11.5px] text-[#9E9E9E]">{data?.rangeLabel}</div>

      {/* Totals */}
      {t && (
        <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-3 lg:grid-cols-6">
          {showSales && <Stat label="Sales" value={money(t.sales)} accent={ACCENT} delta={data.hasComparison ? t.salesGrowthPct : null} deltaGood="up" />}
          <Stat label="Visits" value={n(t.visits)} sub={`${t.visits ? Math.round((t.visitsReviewed / t.visits) * 100) : 0}% ${kind === "officers" ? "RM-signed" : "reviewed"}`} />
          <Stat label="Open actions" value={n(t.actionsOpen)} sub={`${n(t.actionsOverdue)} overdue`} subColor={t.actionsOverdue ? "#C62828" : undefined} />
          {showSales && <Stat label="Leads converted" value={n(t.leadsConverted)} sub={`${n(t.currentLeads)} still open`} accent="#546E7A" />}
          {showSales && <Stat label="Farmers" value={n(t.farmers)} />}
          <Stat label={KIND_NOUN[kind] + "s"} value={n(t.entities)} />
        </div>
      )}

      {/* Compare panel */}
      {compareRows.length >= 2 && <ComparePanel kind={kind} rows={compareRows} showSales={showSales} onClear={() => setSel(new Set())} />}

      {/* Leaderboard */}
      <Leaderboard kind={kind} rows={rows} metric={showSales ? "sales" : "visits"} />

      {/* Ranked table */}
      <RankTable kind={kind} rows={rows} showSales={showSales} hasComparison={!!data?.hasComparison} sel={sel} onToggle={toggleSel} />
      {kind === "officers" && rows.length > 0 && (
        <div className="-mt-1 flex items-start gap-1.5 text-[11.5px] text-[#78909C]">
          <span>ℹ️</span>
          <span><b>“RM signed %”</b> is how much of each officer’s fieldwork their Regional Manager has signed off — it’s the RM’s review task, not pending work for the officer.</span>
        </div>
      )}

      {rows.length === 0 && !loading && (
        <div className="rounded-[14px] border border-[#F5CE8E] bg-[#FEF6E9] px-4 py-10 text-center text-[13px] text-[#8D6E00]">
          No {KIND_NOUN[kind].toLowerCase()} activity in this period.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, subColor, accent, delta, deltaGood }: { label: string; value: string; sub?: string; subColor?: string; accent?: string; delta?: number | null; deltaGood?: "up" | "down" }) {
  const good = delta == null ? null : deltaGood === "down" ? delta <= 0 : delta >= 0;
  return (
    <div className={`${CARD} p-3.5`} style={accent ? { borderLeft: `4px solid ${accent}` } : undefined}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.3px] text-[#9E9E9E]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[19px] font-bold text-[#1A1C1A]">{value}</span>
        {delta != null && (
          <span className="text-[11.5px] font-bold" style={{ color: good ? "#7DA02E" : "#C62828" }}>{pct(delta)}</span>
        )}
      </div>
      {sub && <div className="mt-0.5 text-[11px]" style={{ color: subColor ?? "#9E9E9E" }}>{sub}</div>}
    </div>
  );
}

/* ── horizontal leaderboard, top 12 by the primary metric ── */
function Leaderboard({ kind, rows, metric }: { kind: PerfKind; rows: PerfEntity[]; metric: "sales" | "visits" }) {
  const top = [...rows].sort((a, b) => b[metric] - a[metric]).slice(0, 12).filter((r) => r[metric] > 0);
  if (top.length === 0) return null;
  const max = Math.max(...top.map((r) => r[metric]));
  const fmt = metric === "sales" ? money : n;
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">Top {KIND_NOUN[kind].toLowerCase()}s by {metric === "sales" ? "sales" : "visits"}</div>
      <div className="flex flex-col gap-2">
        {top.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2.5">
            <div className="w-5 text-right text-[11px] font-bold text-[#BDBDBD]">{i + 1}</div>
            <div className="w-[150px] shrink-0 truncate text-[12px] font-semibold text-[#424242]" title={r.name}>{r.name}</div>
            <div className="relative h-[22px] flex-1 overflow-hidden rounded-[6px] bg-[#F2F5F8]">
              <div className="absolute inset-y-0 left-0 rounded-[6px]" style={{ width: `${Math.max(2, (r[metric] / max) * 100)}%`, background: `linear-gradient(90deg, ${ACCENT}, #42A5F5)` }} />
            </div>
            <div className="w-[78px] shrink-0 text-right text-[12px] font-bold tabular-nums text-[#1A1C1A]">{fmt(r[metric])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── the ranked table (sortable) + compare checkboxes ── */
type SortKey = "sales" | "salesGrowthPct" | "visits" | "visitsReviewed" | "actionsOpen" | "actionsOverdue" | "actionsDone" | "actionsDonePct" | "leadsConverted" | "farmers";
// Completion rate = closed / (closed + still-open). null when there's nothing on the plate.
const donePct = (r: PerfEntity): number | null => { const d = r.actionsDone + r.actionsOpen; return d ? Math.round((r.actionsDone / d) * 100) : null; };
const sortVal = (r: PerfEntity, k: SortKey): number => (k === "actionsDonePct" ? (donePct(r) ?? -1) : Number(r[k] ?? 0));
function RankTable({ kind, rows, showSales, hasComparison, sel, onToggle }: {
  kind: PerfKind; rows: PerfEntity[]; showSales: boolean; hasComparison: boolean; sel: Set<string>; onToggle: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>(showSales ? "sales" : "visits");
  const sorted = useMemo(() => [...rows].sort((a, b) => (sortVal(b, sort) - sortVal(a, sort)) || a.name.localeCompare(b.name)), [rows, sort]);
  if (rows.length === 0) return null;

  // Column groups make it unambiguous which family each metric belongs to (Field visits vs Actions vs Pipeline).
  const officerAxis = kind === "officers"; // sign-off is the RM's job — label the review column so it doesn't read as the officer's pending work
  const salesCols: [SortKey, string][] = [["sales", "₹ Sales"], ["salesGrowthPct", "Growth"]];
  const visitCols: [SortKey, string][] = [["visits", "Visits"], ["visitsReviewed", officerAxis ? "RM signed %" : "Reviewed %"]];
  const actionCols: [SortKey, string][] = [["actionsOpen", "Open"], ["actionsOverdue", "Overdue"], ["actionsDone", "Done"], ["actionsDonePct", "Done %"]];
  const pipeCols: [SortKey, string][] = [["leadsConverted", "Leads conv."], ["farmers", "Farmers"]];
  const groups: [string, [SortKey, string][]][] = [
    ...(showSales ? [["Sales", salesCols]] as [string, [SortKey, string][]][] : []),
    ["Field visits", visitCols], ["Actions", actionCols],
    ...(showSales ? [["Pipeline", pipeCols]] as [string, [SortKey, string][]][] : []),
  ];
  const th = "px-2.5 py-2 text-right text-[10.5px] font-bold uppercase tracking-[0.3px] cursor-pointer select-none whitespace-nowrap";
  const td = "px-2.5 py-2 text-right text-[12px] tabular-nums";

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-[13px] font-bold text-[#1A1C1A]">{KIND_NOUN[kind]} leaderboard</div>
        <div className="text-[11px] text-[#9E9E9E]">Tick up to 4 to compare</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            {/* Group row — names the family each metric belongs to */}
            <tr className="border-t border-[#F0F0F0] bg-[#F4F7FA] text-[#78909C]">
              <th className="px-2.5 py-1.5" colSpan={2} />
              {groups.map(([label, gc], i) => (
                <th key={label} colSpan={gc.length}
                  className={`px-2.5 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.6px] ${i > 0 ? "border-l border-[#E4EAF0]" : ""}`}>
                  {label}
                </th>
              ))}
            </tr>
            <tr className="border-y border-[#F0F0F0] bg-[#FAFAFA] text-[#9E9E9E]">
              <th className="w-8 px-2.5 py-2" />
              <th className="px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.3px]">{KIND_NOUN[kind]}</th>
              {groups.map(([, gc], gi) => gc.map(([k, label], ci) => (
                <th key={k} className={`${th} ${gi > 0 && ci === 0 ? "border-l border-[#EEF1F4]" : ""}`}
                  style={sort === k ? { color: ACCENT } : undefined} onClick={() => setSort(k)}>
                  {label}{sort === k ? " ▾" : ""}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const reviewedPct = r.visits ? Math.round((r.visitsReviewed / r.visits) * 100) : 0;
              const checked = sel.has(r.id);
              return (
                <tr key={r.id} className="border-b border-[#F5F5F5] hover:bg-[#FAFCFF]">
                  <td className="px-2.5 py-2 text-center">
                    <input type="checkbox" checked={checked} onChange={() => onToggle(r.id)} style={{ accentColor: ACCENT }} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-[12.5px] font-semibold text-[#1A1C1A]">{r.name}</div>
                    <div className="text-[10.5px] text-[#9E9E9E]">{r.sub}</div>
                  </td>
                  {showSales && <td className={`${td} font-semibold text-[#1A1C1A]`}>{money(r.sales)}</td>}
                  {showSales && (
                    <td className={td}>
                      {r.salesGrowthPct == null ? <span className="text-[#DDD]">—</span>
                        : <span className="font-semibold" style={{ color: r.salesGrowthPct >= 0 ? "#7DA02E" : "#C62828" }}>{pct(r.salesGrowthPct)}</span>}
                    </td>
                  )}
                  <td className={`${td} ${showSales ? "border-l border-[#F4F4F4]" : ""}`}>{n(r.visits)}</td>
                  <td className={td}>
                    {r.visits === 0 ? <span className="text-[#DDD]">—</span> : (
                      <span title={`${n(r.visitsReviewed)} of ${n(r.visits)} ${officerAxis ? "signed off by their RM" : "reviewed"}`}>
                        <span className="font-semibold" style={{ color: reviewedPct >= 67 ? "#7DA02E" : reviewedPct >= 34 ? "#EF6C00" : "#C62828" }}>{reviewedPct}%</span>
                      </span>
                    )}
                  </td>
                  <td className={`${td} border-l border-[#F4F4F4]`}>{n(r.actionsOpen)}</td>
                  <td className={td}>{r.actionsOverdue ? <span className="font-semibold text-[#C62828]">{n(r.actionsOverdue)}</span> : <span className="text-[#DDD]">0</span>}</td>
                  <td className={td}>{n(r.actionsDone)}</td>
                  <td className={td}>{(() => { const p = donePct(r); return p == null ? <span className="text-[#DDD]">—</span>
                    : <span className="font-semibold" style={{ color: p >= 67 ? "#7DA02E" : p >= 34 ? "#EF6C00" : "#C62828" }} title={`${n(r.actionsDone)} done of ${n(r.actionsDone + r.actionsOpen)} on the plate`}>{p}%</span>; })()}</td>
                  {showSales && <td className={`${td} border-l border-[#F4F4F4]`}>{r.leadsConverted ? <span className="font-semibold text-[#37474F]">{n(r.leadsConverted)}</span> : <span className="text-[#DDD]">0</span>}</td>}
                  {showSales && <td className={td}>{n(r.farmers)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── head-to-head compare: 2–4 entities side by side ── */
function ComparePanel({ kind, rows, showSales, onClear }: { kind: PerfKind; rows: PerfEntity[]; showSales: boolean; onClear: () => void }) {
  const metrics: [string, (r: PerfEntity) => string, (r: PerfEntity) => number][] = [
    ...(showSales ? [["Sales", (r: PerfEntity) => money(r.sales), (r: PerfEntity) => r.sales]] as [string, (r: PerfEntity) => string, (r: PerfEntity) => number][] : []),
    ...(showSales ? [["Growth", (r: PerfEntity) => r.salesGrowthPct == null ? "—" : pct(r.salesGrowthPct), (r: PerfEntity) => r.salesGrowthPct ?? 0]] as [string, (r: PerfEntity) => string, (r: PerfEntity) => number][] : []),
    ["Visits", (r) => n(r.visits), (r) => r.visits],
    [kind === "officers" ? "RM signed %" : "Reviewed %", (r) => (r.visits ? `${Math.round((r.visitsReviewed / r.visits) * 100)}%` : "—"), (r) => (r.visits ? (r.visitsReviewed / r.visits) * 100 : 0)],
    ["Farmers visited", (r) => n(r.farmersVisited), (r) => r.farmersVisited],
    ["Actions open", (r) => n(r.actionsOpen), (r) => r.actionsOpen],
    ["Actions overdue", (r) => n(r.actionsOverdue), (r) => r.actionsOverdue],
    ["Actions done", (r) => n(r.actionsDone), (r) => r.actionsDone],
    ["Actions done %", (r) => { const p = donePct(r); return p == null ? "—" : `${p}%`; }, (r) => donePct(r) ?? 0],
    ...(showSales ? [["Leads converted", (r: PerfEntity) => n(r.leadsConverted), (r: PerfEntity) => r.leadsConverted]] as [string, (r: PerfEntity) => string, (r: PerfEntity) => number][] : []),
  ];
  const PALETTE = ["#1565C0", "#7DA02E", "#EF6C00", "#6A1B9A"];
  return (
    <div className={`${CARD} p-4`} style={{ borderLeft: `4px solid ${ACCENT}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#1A1C1A]">Head-to-head · {rows.length} {KIND_NOUN[kind].toLowerCase()}s</div>
        <button type="button" onClick={onClear} className="text-[12px] font-semibold text-[#C62828] hover:underline">Clear</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-3">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#424242]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i] }} />{r.name}
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <tbody>
            {metrics.map(([label, fmt, val]) => {
              const max = Math.max(...rows.map((r) => Math.abs(val(r))), 1);
              const best = Math.max(...rows.map((r) => val(r)));
              return (
                <tr key={label} className="border-b border-[#F5F5F5]">
                  <td className="py-2 pr-3 text-[11.5px] font-semibold text-[#616161] whitespace-nowrap">{label}</td>
                  {rows.map((r, i) => {
                    const v = val(r);
                    const isBest = v === best && rows.length > 1;
                    return (
                      <td key={r.id} className="px-2 py-2" style={{ width: `${100 / rows.length}%` }}>
                        <div className="mb-1 text-[12px] font-bold tabular-nums" style={{ color: isBest ? PALETTE[i] : "#1A1C1A" }}>{fmt(r)}</div>
                        <div className="h-[6px] overflow-hidden rounded-full bg-[#F2F5F8]">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, background: PALETTE[i] }} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── store-tag multi-select (mirrors the workbench MultiSel look) ── */
function TagFilter({ tags, selected, onToggle, onClear }: { tags: { id: number; name: string }[]; selected: number[]; onToggle: (id: number) => void; onClear: () => void }) {
  const text = selected.length === 0 ? "All store tags" : selected.length === 1 ? (tags.find((t) => t.id === selected[0])?.name ?? "1 tag") : `${selected.length} tags`;
  return (
    <details className="group relative">
      <summary className="flex w-[150px] cursor-pointer list-none items-center justify-between gap-1.5 rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-2 text-[12.5px] text-[#424242]">
        <span className={`truncate ${selected.length ? "font-semibold" : ""}`} style={selected.length ? { color: "#00838F" } : undefined}>{text}</span>
        <span className="shrink-0 text-[10px] text-[#9E9E9E] transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-[280px] w-[210px] overflow-y-auto rounded-lg border border-[#E0E0E0] bg-white p-1 shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
        <button type="button" onClick={onClear} className="w-full rounded px-2 py-1.5 text-left text-[12.5px] font-semibold hover:bg-[#F5F7F5]" style={selected.length === 0 ? { color: "#00838F" } : { color: "#616161" }}>All store tags</button>
        {tags.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12.5px] text-[#424242] hover:bg-[#F5F7F5]">
            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => onToggle(t.id)} style={{ accentColor: "#00838F" }} />
            <span className="truncate">{t.name}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
