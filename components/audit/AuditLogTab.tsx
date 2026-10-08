"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AuditTable, type AuditRowData } from "./AuditTable";
import { VisitDateFilter } from "@/components/analytics/VisitDateFilter";
import { getAuditLog, type AuditPage } from "@/app/actions/audit";
import { AUDIT_ACTION_META } from "@/lib/status";

// Chip colours for Verde's import / ERP-sync actions (not in the shared AUDIT_ACTION_META).
const EXTRA_META: Record<string, { bg: string; c: string }> = {
  IMPORT: { bg: "#E3F2FD", c: "#1565C0" },
  SYNC: { bg: "#E9F2CF", c: "#66852A" },
  SYNC_FAILED: { bg: "#FFEBEE", c: "#C62828" },
};
const FALLBACK_META = { bg: "#F5F5F5", c: "#757575" };

export function AuditLogTab({ initial, actionTypes }: { initial: AuditPage; actionTypes: string[] }) {
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);
  const [actions, setActions] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AuditRowData[]>(initial.rows);
  const [cursor, setCursor] = useState<number | null>(initial.nextCursor);
  const [loading, startReload] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useRef(true);

  // Re-fetch page 1 whenever a filter changes (search debounced).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      startReload(async () => {
        const r = await getAuditLog({ from, to, actions, q, limit: 100 });
        setRows(r.rows); setCursor(r.nextCursor);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [from, to, actions, q]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await getAuditLog({ from, to, actions, q, limit: 100, cursor });
      setRows((rs) => [...rs, ...r.rows]); setCursor(r.nextCursor);
    } finally { setLoadingMore(false); }
  };

  const toggleAction = (a: string) => setActions((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  const anyFilter = from || to || actions.length || q.trim();
  const clearAll = () => { setFrom(undefined); setTo(undefined); setActions([]); setQ(""); };

  return (
    <div className="animate-fadeUp">
      {/* Date range selector (IST calendar days) */}
      <VisitDateFilter label="Log dates:" minDate={null} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

      {/* Action-type filter + search */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-black/[0.04] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">Type:</span>
        {actionTypes.map((a) => {
          const on = actions.includes(a); const meta = AUDIT_ACTION_META[a] ?? EXTRA_META[a] ?? FALLBACK_META;
          return (
            <button key={a} type="button" onClick={() => toggleAction(a)}
              className="rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors"
              style={on ? { background: meta.c, color: "#fff", borderColor: meta.c } : { background: meta.bg, color: meta.c, borderColor: "transparent" }}>
              {a}
            </button>
          );
        })}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user / details..."
          className="ml-auto w-full max-w-[280px] rounded-lg border border-[#E0E0E0] px-3 py-1.5 text-[12.5px] outline-none focus:border-[#7DA02E]" />
        {anyFilter ? <button type="button" onClick={clearAll} className="text-[11.5px] font-semibold text-[#C62828] hover:underline">Clear</button> : null}
      </div>

      <div className="mb-2 flex items-center justify-between px-1 text-[11.5px] text-[#9E9E9E]">
        <span>{loading ? "Loading..." : `Showing ${rows.length.toLocaleString("en-IN")} event${rows.length === 1 ? "" : "s"}${cursor ? "+" : ""}`}</span>
      </div>

      <AuditTable rows={rows} />

      {cursor && (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={loadMore} disabled={loadingMore}
            className="rounded-[10px] border border-[#E0E0E0] bg-white px-5 py-2 text-[12.5px] font-semibold text-[#7DA02E] hover:border-[#7DA02E] disabled:opacity-50">
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
