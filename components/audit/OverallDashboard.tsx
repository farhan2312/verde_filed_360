"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modal, ModalHeader } from "@/components/interactive";
import { OverallView } from "./OverallView";
import {
  getOverallAnalytics, getOverallDrilldown, getOverallPeopleOptions,
  type OverallData, type OverallFilters, type WindowKey, type DrillResult,
} from "@/app/actions/overall-analytics";
import type { RoleKey } from "@/lib/roles";

const WINDOWS: [WindowKey, string][] = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["all", "All time"]];
const ROLES: [RoleKey | "all", string][] = [["all", "All roles"], ["officer", "Agri Officer"], ["regional", "Regional Mgr"], ["central", "Central"], ["sysadmin", "Sysadmin"], ["campaigner", "Campaigner"]];
const INPUT = "rounded-[8px] border border-line bg-white px-2.5 py-1 text-[12px] text-ink outline-none focus:border-brand-600";

/** Client shell for the Overall tab: URL-param filters + one shared drill-down modal. */
export function OverallDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const filters: OverallFilters = useMemo(() => ({
    window: (WINDOWS.some(([w]) => w === sp.get("window")) ? sp.get("window") : "30d") as WindowKey,
    role: (ROLES.some(([r]) => r === sp.get("role")) ? sp.get("role") : "all") as RoleKey | "all",
    person: sp.get("person") ? Number(sp.get("person")) : "all",
  }), [sp]);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || (k === "window" && v === "30d") || ((k === "role" || k === "person") && v === "all")) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }, [sp, pathname, router]);

  const [data, setData] = useState<OverallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<{ id: number; name: string; code: string | null; role: RoleKey }[]>([]);

  useEffect(() => { getOverallPeopleOptions().then(setPeople); }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    getOverallAnalytics(filters).then((d) => { if (live) { setData(d); setLoading(false); } });
    return () => { live = false; };
  }, [filters]);

  // Drill-down
  const [drill, setDrill] = useState<{ key: string; loading: boolean; result: DrillResult | null } | null>(null);
  const openTile = useCallback((key: string) => {
    setDrill({ key, loading: true, result: null });
    getOverallDrilldown(key, filters).then((r) => setDrill((d) => (d && d.key === key ? { key, loading: false, result: r } : d)));
  }, [filters]);

  const personChoices = people.filter((p) => filters.role === "all" || p.role === filters.role);

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-white p-3 shadow-card">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink-muted">Window</span>
        {WINDOWS.map(([w, label]) => {
          const on = filters.window === w;
          return (
            <button key={w} type="button" onClick={() => setParams({ window: w })}
              className="rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors"
              style={{ borderColor: on ? "#7DA02E" : "#E0E0E0", color: on ? "#7DA02E" : "#616161", background: on ? "#F5F9EA" : "#fff" }}>{label}</button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <select value={filters.role} onChange={(e) => setParams({ role: e.target.value, person: null })} className={INPUT}>
            {ROLES.map(([r, label]) => <option key={r} value={r}>{label}</option>)}
          </select>
          <select value={filters.person === "all" ? "all" : String(filters.person)} onChange={(e) => setParams({ person: e.target.value })} className={`${INPUT} max-w-[200px]`}>
            <option value="all">All people</option>
            {personChoices.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</option>)}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="rounded-[14px] border border-line bg-white py-20 text-center text-[13px] text-ink-muted shadow-card">Loading overall analytics…</div>
      ) : !data ? (
        <div className="rounded-[14px] border border-line bg-white py-20 text-center text-[13px] text-ink-muted shadow-card">No data.</div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <OverallView data={data} onTile={openTile} />
        </div>
      )}

      {/* Single drill-down modal for every tile */}
      <Modal open={!!drill} onClose={() => setDrill(null)} className="max-w-[820px]">
        <ModalHeader eyebrow="Drill-down" eyebrowColor="#7DA02E" title={drill?.result?.title ?? "Loading…"} onClose={() => setDrill(null)} />
        <div className="max-h-[74vh] overflow-y-auto px-5 py-4">
          {!drill || drill.loading ? (
            <div className="py-12 text-center text-[13px] text-ink-muted">Loading list…</div>
          ) : !drill.result ? (
            <div className="py-12 text-center text-[13px] text-ink-muted">Nothing to show.</div>
          ) : (
            <>
              {drill.result.note && <p className="mb-2 text-[11.5px] leading-[1.5] text-ink-muted">{drill.result.note}</p>}
              <div className="mb-2 text-[12px] font-semibold text-ink">
                {drill.result.count.toLocaleString("en-IN")} total
                {drill.result.capped && <span className="ml-2 font-normal text-orange">showing first {drill.result.rows.length.toLocaleString("en-IN")} (list capped)</span>}
              </div>
              {drill.result.rows.length === 0 ? (
                <div className="py-10 text-center text-[13px] text-ink-muted">No rows.</div>
              ) : (
                <div className="overflow-x-auto rounded-[10px] border border-line">
                  <table className="w-full min-w-[560px] text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-surface-50 text-left text-[10px] font-bold uppercase tracking-[0.4px] text-ink-muted">
                        {drill.result.columns.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {drill.result.rows.map((row, i) => (
                        <tr key={i} className="border-b border-surface-200 last:border-0 hover:bg-surface-50">
                          {row.map((cell, j) => <td key={j} className="px-3 py-2 text-ink-700">{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
