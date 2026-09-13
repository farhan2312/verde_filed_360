"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressBar } from "@/components/ui";
import { getActiveSalesSync, getSalesSyncRun, updateSalesSyncSettings, type ActiveRun } from "@/app/actions/sales-sync";
import type { SyncProgress } from "@/lib/sales-sync";

export interface SyncSettingsVM { lookbackDays: number; enabled: boolean }
export interface LastRunVM { when: string; status: string; label: string; trigger: string | null; bills: number | null; newCustomers: number | null; apiRecords: number | null; error: string | null }

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const INPUT = "rounded-[9px] border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-[#7DA02E]";
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-IN");

/** Today / yesterday as YYYY-MM-DD in IST (the ERP's calendar). */
function istDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function startOfMonthIst(): string { return istDate().slice(0, 8) + "01"; }
function fyStart(): string { const t = istDate(); const y = parseInt(t.slice(0, 4), 10); return `${t.slice(5, 7) >= "04" ? y : y - 1}-04-01`; }

type Phase = { kind: "idle" } | { kind: "running"; progress: SyncProgress | null; startedBy: string | null; window: string; runId: number | null } | { kind: "done"; ok: boolean; progress: SyncProgress | null; error: string | null; durationMs: number | null };

/**
 * "Run now" + schedule controls for the ERP sales sync. Polls the active run so progress shows even
 * for a sync started elsewhere (scheduler, CLI, another admin).
 */
export function SalesSyncRunCard({ apiReady, settings: initialSettings, initialActive, lastRun, compact = false }: {
  apiReady: boolean; settings: SyncSettingsVM; initialActive: ActiveRun | null; lastRun: LastRunVM | null; compact?: boolean;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(istDate(-1));
  const [to, setTo] = useState(istDate(-1));
  const [phase, setPhase] = useState<Phase>(initialActive
    ? { kind: "running", progress: initialActive.progress, startedBy: initialActive.startedBy, window: `${initialActive.fromDate} → ${initialActive.toDate}`, runId: initialActive.id }
    : { kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  // Poll the active run while one is in flight. When it disappears, fetch its final state.
  const startPolling = useCallback((runId: number | null) => {
    stopPolling();
    let known = runId;
    pollRef.current = setInterval(async () => {
      try {
        const a = await getActiveSalesSync();
        if (a) {
          known = a.id;
          setPhase({ kind: "running", progress: a.progress, startedBy: a.startedBy, window: `${a.fromDate} → ${a.toDate}`, runId: a.id });
          return;
        }
        stopPolling();
        if (known != null) {
          const r = await getSalesSyncRun(known);
          setPhase({ kind: "done", ok: r?.status === "SUCCESS", progress: r?.progress ?? null, error: r?.error ?? null, durationMs: r?.durationMs ?? null });
        } else setPhase({ kind: "idle" });
        router.refresh();
      } catch { /* transient — keep polling */ }
    }, 1500);
  }, [router]);

  useEffect(() => { if (initialActive) startPolling(initialActive.id); return stopPolling; }, [initialActive, startPolling]);

  async function run() {
    setError(null);
    setPhase({ kind: "running", progress: null, startedBy: "You", window: `${from} → ${to}`, runId: null });
    startPolling(null);
    try {
      const res = await fetch("/api/sales-sync/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
      const json = await res.json();
      stopPolling();
      if (!res.ok || json.error) throw new Error(json.error || "Sync failed.");
      setPhase({ kind: "done", ok: !!json.ok, progress: json.progress ?? null, error: json.error ?? null, durationMs: json.durationMs ?? null });
    } catch (e) {
      stopPolling();
      setPhase({ kind: "idle" });
      setError(e instanceof Error ? e.message : "Sync failed.");
    }
    router.refresh();
  }

  async function saveSettings(patch: Partial<SyncSettingsVM>) {
    setSavingSettings(true);
    const res = await updateSalesSyncSettings(patch);
    setSavingSettings(false);
    if (!res.ok) { setError(res.error ?? "Could not save."); return; }
    if (res.settings) setSettings(res.settings);
  }

  const running = phase.kind === "running";
  const pct = running && phase.progress && phase.progress.total ? Math.round((phase.progress.step / phase.progress.total) * 100) : running ? 8 : 100;
  const p = phase.kind === "running" || phase.kind === "done" ? phase.progress : null;

  return (
    <div className={`${CARD} p-[22px]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-ink">ERP sales sync</div>
          <div className="mt-0.5 text-[12.5px] text-ink-500">
            Pulls invoice line-items from the Verde ERP, creates new customers by mobile and refreshes segments. Re-running a window is safe — bills are replaced by invoice number.
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${apiReady ? "bg-brand-50 text-brand-700" : "bg-danger-50 text-danger"}`}>
          {apiReady ? "API connected" : "SALES_API_TOKEN missing"}
        </span>
      </div>

      {/* Schedule */}
      <div className="mt-4 grid gap-3 rounded-[12px] bg-surface-100 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div>
          <div className="text-[13px] font-semibold text-ink">Daily schedule · 02:00 IST</div>
          <div className="mt-0.5 text-[12px] text-ink-500">
            {settings.enabled ? `Fetches the previous ${settings.lookbackDays === 1 ? "day" : `${settings.lookbackDays} days`} automatically.` : "Paused — nothing runs until re-enabled."}
            {lastRun && <> Last run {lastRun.when} · <span className={lastRun.status === "SUCCESS" ? "text-brand-700" : lastRun.status === "FAILED" ? "text-danger" : "text-gold-dark"}>{lastRun.status.toLowerCase()}</span>{lastRun.status === "SUCCESS" && <> · {n(lastRun.bills)} bills, {n(lastRun.newCustomers)} new customers</>}</>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-600">
          Lookback
          <input type="number" min={1} max={31} value={settings.lookbackDays} disabled={savingSettings}
            onChange={(e) => setSettings({ ...settings, lookbackDays: Math.max(1, Math.min(31, parseInt(e.target.value || "1", 10))) })}
            onBlur={(e) => { const v = parseInt(e.target.value || "1", 10); if (v !== initialSettings.lookbackDays) void saveSettings({ lookbackDays: v }); }}
            className={`${INPUT} w-16 py-1.5`} />
          <span className="text-ink-muted">day(s)</span>
        </label>
        <button type="button" disabled={savingSettings} onClick={() => saveSettings({ enabled: !settings.enabled })}
          className={`rounded-[9px] px-3.5 py-2 text-[12.5px] font-semibold ${settings.enabled ? "border border-line text-ink-600 hover:bg-white" : "bg-brand-600 text-white hover:bg-brand-700"}`}>
          {settings.enabled ? "Pause schedule" : "Resume schedule"}
        </button>
      </div>

      {/* Manual run */}
      <div className="mt-4">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.5px] text-ink-muted">Run on demand</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-600">From
            <input type="date" value={from} max={istDate()} onChange={(e) => setFrom(e.target.value)} disabled={running} className={INPUT} /></label>
          <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-600">To
            <input type="date" value={to} max={istDate()} min={from} onChange={(e) => setTo(e.target.value)} disabled={running} className={INPUT} /></label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {([["Yesterday", istDate(-1), istDate(-1)], ["Last 7 days", istDate(-7), istDate(-1)], ["This month", startOfMonthIst(), istDate()], ["This FY", fyStart(), istDate()]] as const).map(([l, f, t]) => (
              <button key={l} type="button" disabled={running} onClick={() => { setFrom(f); setTo(t); }}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${from === f && to === t ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line text-ink-600 hover:bg-surface-100"}`}>{l}</button>
            ))}
          </div>
          <button type="button" onClick={run} disabled={running || !apiReady || !from || !to || from > to}
            className="ml-auto rounded-[10px] bg-brand-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
            {running ? "Syncing…" : "Run sync now"}
          </button>
        </div>
        {error && <div className="mt-3 rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-[12.5px] text-danger">{error}</div>}
      </div>

      {/* Progress / result */}
      {phase.kind !== "idle" && (
        <div className={`mt-4 rounded-[12px] border p-4 ${phase.kind === "done" ? (phase.ok ? "border-brand-200 bg-brand-50/60" : "border-danger/30 bg-danger-50") : "border-line bg-surface-50"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold text-ink">
              {phase.kind === "running" ? (<><span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-brand-100 border-t-brand-600 align-[-2px]" />Syncing {phase.window}{phase.startedBy && phase.startedBy !== "You" ? ` (started by ${phase.startedBy})` : ""}</>)
                : phase.ok ? "Sync complete" : "Sync failed"}
            </div>
            {phase.kind === "done" && phase.durationMs != null && <span className="text-[11.5px] text-ink-muted">{(phase.durationMs / 1000).toFixed(1)}s</span>}
            {phase.kind === "running" && p && p.total > 1 && <span className="text-[11.5px] text-ink-muted">window {Math.min(p.step + 1, p.total)} of {p.total}</span>}
          </div>
          {running && <ProgressBar pct={pct} className="mt-2.5" height={6} />}
          <div className="mt-2 text-[12.5px] text-ink-600">{phase.kind === "done" && phase.error ? phase.error : p?.message ?? "Contacting ERP…"}</div>
          {p && (p.apiRecords > 0 || phase.kind === "done") && (
            <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
              {([["Line-items", p.apiRecords], ["Bills", p.salesInserted], ["Sale lines", p.linesInserted], ["New customers", p.newCustomers], ["Skipped bills", p.skipped], ["Stores", p.stores]] as const).map(([l, v]) => (
                <div key={l} className="rounded-[10px] bg-white px-3 py-2">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.4px] text-ink-muted">{l}</div>
                  <div className="text-[17px] font-bold text-ink">{n(v)}</div>
                </div>
              ))}
            </div>
          )}
          {phase.kind === "done" && p && p.skipped > 0 && <div className="mt-2 text-[11.5px] text-ink-muted">Skipped bills have no valid customer mobile (e.g. 1234567890) — the ERP has no farmer to attach them to.</div>}
        </div>
      )}
    </div>
  );
}
