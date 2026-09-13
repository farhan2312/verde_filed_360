"use client";

import { useEffect, useMemo, useState } from "react";
import { getEmployeeActivity, type EmployeeActivity as Data, type EmployeeRow } from "@/app/actions/employee-activity";

const DAY = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
type Bucket = "today" | "week" | "month" | "all" | "custom";

function windowFor(b: Bucket, from?: string, to?: string): { from?: string; to?: string } {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const today = isoDate(now);
  if (b === "today") return { from: today, to: today };
  if (b === "week") return { from: isoDate(new Date(now.getTime() - 6 * DAY)), to: today };
  if (b === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (b === "custom") return { from, to };
  return {};
}

const relTime = (iso: string | null): string => {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};
const fmtDate = (iso: string | null): string => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.03] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-none" style={{ color: color ?? "#1A1C1A" }}>{value.toLocaleString("en-IN")}</div>
    </div>
  );
}

const PILLS: [Bucket, string][] = [["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["all", "All time"]];
const INPUT = "rounded-[8px] border border-[#E0E0E0] bg-white px-2.5 py-1 text-[12px] outline-none focus:border-[#678722]";

export function EmployeeActivity() {
  const [bucket, setBucket] = useState<Bucket>("month");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  useEffect(() => {
    const w = windowFor(bucket, from, to);
    setLoading(true);
    getEmployeeActivity(w.from, w.to).then((d) => { setData(d); setLoading(false); });
  }, [bucket, from, to]);

  const rows = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return data.employees
      .filter((e) => status === "all" || (status === "active" ? e.active : !e.active))
      .filter((e) => !t || `${e.name} ${e.code ?? ""} ${e.mobile ?? ""} ${e.role} ${e.territory}`.toLowerCase().includes(t))
      .sort((a, b) => b.periodVisits - a.periodVisits || a.name.localeCompare(b.name));
  }, [data, q, status]);

  return (
    <div>
      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total employees" value={data?.kpis.total ?? 0} />
        <Kpi label="Active accounts" value={data?.kpis.activeAccounts ?? 0} color="#678722" />
        <Kpi label="Inactive accounts" value={data?.kpis.inactiveAccounts ?? 0} color="#C62828" />
        <Kpi label="Active in period" value={data?.kpis.activeInPeriod ?? 0} color="#1565C0" />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-black/[0.04] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">Activity window:</span>
        {PILLS.map(([b, label]) => {
          const on = bucket === b;
          return (
            <button key={b} type="button" onClick={() => setBucket(b)}
              className="rounded-full border px-3 py-1 text-[11.5px] font-semibold"
              style={{ borderColor: on ? "#678722" : "#E0E0E0", color: on ? "#678722" : "#616161", background: on ? "#F3F8E6" : "#fff" }}>{label}</button>
          );
        })}
        <div className="flex items-center gap-1.5">
          <input type="date" className={INPUT} value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setBucket("custom"); }} />
          <span className="text-[#9E9E9E]">→</span>
          <input type="date" className={INPUT} value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setBucket("custom"); }} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code / mobile…"
            className="w-[200px] rounded-[8px] border border-[#E0E0E0] px-2.5 py-1 text-[12px] outline-none focus:border-[#678722]" />
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={INPUT}>
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[900px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[#EEE] text-left text-[10.5px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">
              <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Mobile</th><th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Territory</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Visits (period)</th><th className="px-4 py-3 text-right">Total visits</th>
              <th className="px-4 py-3">Last active</th><th className="px-4 py-3">Member since</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[13px] text-[#9E9E9E]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[13px] text-[#9E9E9E]">No employees match.</td></tr>
            ) : rows.map((e) => <Row key={e.id} e={e} />)}
          </tbody>
        </table>
      </div>
      {data && <div className="mt-2 text-[11px] text-[#9E9E9E]">{rows.length} of {data.kpis.total} employees · window: {data.windowLabel} · visits attributed by officer name</div>}
    </div>
  );
}

function Row({ e }: { e: EmployeeRow }) {
  return (
    <tr className="border-b border-[#F5F5F5] last:border-0 hover:bg-[#FAFBFA]">
      <td className="px-4 py-3">
        <div className="font-semibold text-[#1A1C1A]">{e.name}</div>
        <div className="text-[10.5px] text-[#9E9E9E]">{e.code ?? "—"}</div>
      </td>
      <td className="px-4 py-3 font-mono text-[#616161]">{e.mobile ?? "—"}</td>
      <td className="px-4 py-3 text-[#616161]">{e.role}</td>
      <td className="px-4 py-3 text-[#616161]">{e.territory}</td>
      <td className="px-4 py-3">
        {e.active
          ? <span className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[10.5px] font-bold text-[#678722]">Active{e.activeInPeriod ? " · in period" : ""}</span>
          : <span className="rounded-full bg-[#FDECEA] px-2 py-0.5 text-[10.5px] font-bold text-[#C62828]">Inactive</span>}
      </td>
      <td className="px-4 py-3 text-right font-bold text-[#1A1C1A]">{e.periodVisits.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3 text-right text-[#616161]">{e.totalVisits.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3 text-[#616161]" title={`Last visit: ${fmtDate(e.lastVisitAt)} · Last login: ${fmtDate(e.lastLoginAt)}`}>{relTime(e.lastActiveAt)}</td>
      <td className="px-4 py-3 text-[#9E9E9E]">{fmtDate(e.memberSince)}</td>
    </tr>
  );
}
