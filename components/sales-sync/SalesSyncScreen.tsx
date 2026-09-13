"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import { StatTile } from "@/components/ui";
import { deleteSalesRun, previewSalesRunDeletion, type ActiveRun } from "@/app/actions/sales-sync";
import { SalesSyncRunCard, type LastRunVM, type SyncSettingsVM } from "./SalesSyncRunCard";

export interface RunRow {
  id: number; label: string; kind: string; trigger: string | null; status: string; by: string;
  fromDate: string | null; toDate: string | null; rangeStart: string | null; rangeEnd: string | null;
  apiRecords: number | null; bills: number | null; salesInserted: number | null; linesInserted: number | null; newCustomers: number | null; skipped: number | null;
  durationMs: number | null; error: string | null; when: string; dayKey: string; // dayKey = YYYY-MM-DD (IST) for the chart
}
export interface DayBar { day: string; label: string; bills: number; records: number; runs: number; failed: number }
export interface CoverageDay { day: string; label: string; lines: number }
export interface SyncStats {
  runs30: number; success30: number; failed30: number; records30: number; bills30: number; newCustomers30: number; avgDurationMs: number | null;
  totalBills: number; totalLines: number; totalFarmers: number; lastBillDate: string | null;
}

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-IN"));
const secs = (ms: number | null) => (ms == null ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

const TRIGGER_STYLE: Record<string, string> = {
  SCHEDULED: "bg-info-50 text-info-900", MANUAL: "bg-purple-50 text-purple-900", BACKFILL: "bg-gold-50 text-gold-dark", FILE: "bg-surface-200 text-ink-600",
};
const STATUS_STYLE: Record<string, string> = { SUCCESS: "bg-brand-50 text-brand-700", FAILED: "bg-danger-50 text-danger", RUNNING: "bg-gold-50 text-gold-dark" };

/** Bars: bills synced per calendar day (last 30 days), red tick when a run failed that day. */
function ActivityChart({ days }: { days: DayBar[] }) {
  const W = 720, H = 150, padL = 34, padB = 22, padT = 8;
  const max = Math.max(1, ...days.map((d) => d.bills));
  const bw = (W - padL) / days.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" role="img" aria-label="Bills synced per day">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#EEEEEE" strokeWidth="1" />
          <text x={padL - 6} y={y(max * f) + 3.5} textAnchor="end" fontSize="9.5" fill="#9E9E9E">{Math.round(max * f).toLocaleString("en-IN")}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = padL + i * bw;
        const h = Math.max(d.bills > 0 ? 2 : 0, y(0) - y(d.bills));
        return (
          <g key={d.day}>
            <rect x={x + bw * 0.18} y={y(0) - h} width={bw * 0.64} height={h} rx="2" fill={d.failed ? "#D4881F" : "#678722"} opacity={d.runs ? 1 : 0.25}>
              <title>{`${d.label}: ${d.bills.toLocaleString("en-IN")} bills · ${d.records.toLocaleString("en-IN")} line-items · ${d.runs} run(s)${d.failed ? ` · ${d.failed} failed` : ""}`}</title>
            </rect>
            {d.failed > 0 && <circle cx={x + bw / 2} cy={H - padB + 8} r="2.5" fill="#C62828" />}
            {(i % 7 === 0 || (i === days.length - 1 && i % 7 >= 4)) && (
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="9.5" fill="#757575">{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** One cell per bill date: how many sale lines we hold for that day — gaps show up as empty cells. */
function CoverageStrip({ days }: { days: CoverageDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.lines));
  return (
    <div className="flex flex-wrap gap-[3px]">
      {days.map((d) => {
        const t = d.lines / max;
        const bg = d.lines === 0 ? "#F0F0F0" : t < 0.25 ? "#D3E4AB" : t < 0.5 ? "#B3D170" : t < 0.75 ? "#8CB337" : "#678722";
        return <div key={d.day} title={`${d.label}: ${d.lines.toLocaleString("en-IN")} line-items`} className="h-[14px] w-[14px] rounded-[3px]" style={{ background: bg }} />;
      })}
    </div>
  );
}

export function SalesSyncScreen({ runs, days, coverage, stats, apiReady, settings, initialActive, lastRun, isSysadmin }: {
  runs: RunRow[]; days: DayBar[]; coverage: CoverageDay[]; stats: SyncStats; apiReady: boolean; settings: SyncSettingsVM; initialActive: ActiveRun | null; lastRun: LastRunVM | null; isSysadmin: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startDel] = useTransition();

  async function onRollback(r: RunRow) {
    setDeletingId(r.id); setError(null);
    try {
      const preview = await previewSalesRunDeletion(r.id);
      if (!preview.ok) { setError(preview.error ?? "Cannot roll back."); setDeletingId(null); return; }
      const counts = `${n(preview.sales)} bill(s)${preview.farmers ? ` and ${n(preview.farmers)} new-customer farmer(s)` : ""}`;
      const ok = await confirm({
        title: "Roll back this run?",
        message: (<span>Permanently delete <b>{r.label}</b> and the <b>{counts}</b> it added. Re-running the same window will fetch them again.<br />This cannot be undone.</span>),
        confirmLabel: "Roll back",
      });
      if (!ok) { setDeletingId(null); return; }
      startDel(async () => {
        const res = await deleteSalesRun(r.id);
        setDeletingId(null);
        if (!res.ok) { setError(res.error ?? "Rollback failed."); return; }
        router.refresh();
      });
    } catch { setDeletingId(null); setError("Rollback failed."); }
  }

  const successRate = stats.runs30 ? Math.round((stats.success30 / stats.runs30) * 100) : null;

  return (
    <div className="animate-[fadeUp_0.4s_ease-out] space-y-[18px]">
      {dialog}
      {isSysadmin && <SalesSyncRunCard apiReady={apiReady} settings={settings} initialActive={initialActive} lastRun={lastRun} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-[14px] md:grid-cols-3 xl:grid-cols-6">
        <StatTile title="Runs · 30 days" value={n(stats.runs30)} sub={successRate == null ? "no runs yet" : `${successRate}% succeeded · ${stats.failed30} failed`} accent={stats.failed30 ? "#D4881F" : "#678722"} />
        <StatTile title="Line-items · 30 days" value={n(stats.records30)} sub="fetched from ERP" />
        <StatTile title="Bills · 30 days" value={n(stats.bills30)} sub="written to Farmer 360" />
        <StatTile title="New customers · 30 days" value={n(stats.newCustomers30)} sub="farmers created by mobile" accent="#1565C0" bg="#E3F2FD" />
        <StatTile title="Avg run time" value={secs(stats.avgDurationMs)} sub="per run, 30 days" accent="#7B1FA2" bg="#F3E5F5" />
        <StatTile title="All-time" value={n(stats.totalBills)} sub={`bills · ${n(stats.totalLines)} lines · ${n(stats.totalFarmers)} farmers${stats.lastBillDate ? ` · to ${stats.lastBillDate}` : ""}`} accent="#262250" bg="#E4EFC9" />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <div className={`${CARD} p-[22px]`}>
          <div className="flex items-baseline justify-between">
            <div className="text-[14px] font-bold text-ink">Sync activity · last 30 days</div>
            <div className="flex items-center gap-3 text-[11px] text-ink-muted">
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-[2px] bg-brand-600" />bills synced</span>
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-danger" />failed run</span>
            </div>
          </div>
          <div className="mt-3"><ActivityChart days={days} /></div>
        </div>
        <div className={`${CARD} p-[22px]`}>
          <div className="text-[14px] font-bold text-ink">Bill-date coverage · last 60 days</div>
          <div className="mb-3 mt-0.5 text-[12px] text-ink-500">Line-items held per bill date. An empty cell is a day with no sales on record — a gap to re-fetch, or a genuinely quiet day.</div>
          <CoverageStrip days={coverage} />
        </div>
      </div>

      {/* Runs */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between px-[22px] pt-[18px]">
          <div className="text-[14px] font-bold text-ink">Run log</div>
          <div className="text-[11.5px] text-ink-muted">{runs.length} most recent</div>
        </div>
        {error && <div className="mx-[22px] mt-3 rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</div>}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="border-y border-line bg-surface-50 text-left text-[10.5px] font-semibold uppercase tracking-[0.5px] text-ink-muted">
                {["Started", "Trigger", "Window", "Status", "Line-items", "Bills", "New customers", "Skipped", "Duration", "By", ""].map((h) => <th key={h} className="px-[14px] py-2.5 first:pl-[22px] last:pr-[22px]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && <tr><td colSpan={11} className="px-[22px] py-8 text-center text-ink-muted">No runs yet — use “Run sync now” above, or wait for tonight’s schedule.</td></tr>}
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line/70 align-top last:border-0">
                  <td className="whitespace-nowrap px-[14px] py-3 pl-[22px] text-ink">{r.when}</td>
                  <td className="px-[14px] py-3"><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TRIGGER_STYLE[r.kind === "FILE" ? "FILE" : r.trigger ?? "MANUAL"] ?? TRIGGER_STYLE.MANUAL}`}>{r.kind === "FILE" ? "Excel upload" : (r.trigger ?? "MANUAL").toLowerCase()}</span></td>
                  <td className="px-[14px] py-3 text-ink">
                    <div>{r.fromDate && r.toDate ? (r.fromDate === r.toDate ? r.fromDate : `${r.fromDate} → ${r.toDate}`) : r.label}</div>
                    {r.rangeStart && <div className="text-[11px] text-ink-muted">bills {r.rangeStart}{r.rangeEnd && r.rangeEnd !== r.rangeStart ? ` – ${r.rangeEnd}` : ""}</div>}
                  </td>
                  <td className="px-[14px] py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[r.status] ?? STATUS_STYLE.RUNNING}`}>{r.status.toLowerCase()}</span>
                    {r.error && <div className="mt-1 max-w-[260px] text-[11px] text-danger" title={r.error}>{r.error.length > 90 ? r.error.slice(0, 90) + "…" : r.error}</div>}
                  </td>
                  <td className="px-[14px] py-3 tabular-nums text-ink">{n(r.apiRecords)}</td>
                  <td className="px-[14px] py-3 tabular-nums text-ink">{n(r.salesInserted)}</td>
                  <td className="px-[14px] py-3 tabular-nums text-ink">{n(r.newCustomers)}</td>
                  <td className="px-[14px] py-3 tabular-nums text-ink-500">{n(r.skipped)}</td>
                  <td className="px-[14px] py-3 tabular-nums text-ink-500">{secs(r.durationMs)}</td>
                  <td className="px-[14px] py-3 text-ink-500">{r.by || "—"}</td>
                  <td className="px-[14px] py-3 pr-[22px] text-right">
                    {isSysadmin && r.status !== "RUNNING" && (r.salesInserted ?? 0) > 0 && (
                      <button type="button" onClick={() => onRollback(r)} disabled={deletingId === r.id}
                        className="rounded-[8px] border border-danger/30 px-2.5 py-1 text-[11.5px] font-semibold text-danger hover:bg-danger-50 disabled:opacity-50">
                        {deletingId === r.id ? "…" : "Roll back"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
