"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TrendCell, TrendData } from "@/lib/review-trend";

/**
 * Review-completion trend: all-regions line (with 90% target), weekly visit columns, and an RM × week
 * heatmap. One metric toggle (Within SLA % / Reviewed %) scopes the line and the heatmap.
 * Palette = the validated dataviz reference instance (light mode — the app is light-only):
 * series-1 blue for the line, the blue sequential ramp for the heatmap, ink tokens for all text.
 */

const VARS: CSSProperties = {
  ["--surface" as string]: "#fcfcfb",
  ["--ink" as string]: "#0b0b0b",
  ["--ink-2" as string]: "#52514e",
  ["--muted" as string]: "#898781",
  ["--grid" as string]: "#e1e0d9",
  ["--axis" as string]: "#c3c2b7",
  ["--series-1" as string]: "#2a78d6",
};
// Blue sequential ramp 100 → 700 (light → dark = low → high).
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const TARGET = 90;
type Metric = "sla" | "reviewed";

const pctOf = (c: TrendCell, m: Metric) => (c.visits ? ((m === "sla" ? c.withinSla : c.reviewed) / c.visits) * 100 : null);
const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Tip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 min-w-[150px] -translate-x-1/2 -translate-y-full rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[12px] shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
      style={{ left: x, top: y - 10, color: "var(--ink)" }}>{children}</div>
  );
}

/* ── Line: all-regions % per week ── */
function LineChart({ data, metric }: { data: TrendData; metric: Metric }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220, L = 40, R = 52, T = 14, B = 28;
  const n = data.weeks.length;
  const x = (i: number) => L + (n === 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const vals = data.overall.map((c) => pctOf(c, metric));
  const pts = vals.map((v, i) => (v == null ? null : [x(i), y(v)] as const));
  const path = pts.reduce((d, p, i) => (p ? `${d}${d && pts[i - 1] ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}` : d), "");
  const lastI = [...vals.keys()].reverse().find((i) => vals[i] != null);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  const h = hover != null ? data.overall[hover] : null;

  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} role="img" aria-label={`${metric === "sla" ? "Reviewed within SLA" : "Reviewed"} percentage per week, all regions`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: "block", touchAction: "pan-y" }}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke={g === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{g}%</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(TARGET)} y2={y(TARGET)} stroke="var(--ink-2)" strokeWidth={1} />
        <text x={W - R + 6} y={y(TARGET) + 4} fontSize={11} fill="var(--ink-2)">target</text>
        {data.weeks.map((w, i) => (i % Math.ceil(n / 6) === 0 || i === n - 1) && (
          <text key={w.ymd} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{w.short}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--axis)" strokeWidth={1} />}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => p && (i === lastI || i === hover) && (
          <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        {lastI != null && pts[lastI] && (
          <text x={pts[lastI]![0] + 8} y={pts[lastI]![1] - 8} fontSize={12} fontWeight={600} fill="var(--ink)">{fmtPct(vals[lastI])}</text>
        )}
      </svg>
      {h && hover != null && (
        <Tip x={x(hover)} y={vals[hover] != null ? y(vals[hover]!) : y(0)}>
          <div className="text-[15px] font-semibold">{fmtPct(vals[hover])}</div>
          <div style={{ color: "var(--ink-2)" }}>{metric === "sla" ? "reviewed within SLA" : "reviewed"} · {data.weeks[hover].label}</div>
          <div className="mt-1" style={{ color: "var(--ink-2)" }}>{h.visits.toLocaleString("en-IN")} visits · {h.reviewed.toLocaleString("en-IN")} reviewed · {h.withinSla.toLocaleString("en-IN")} in SLA</div>
        </Tip>
      )}
    </div>
  );
}

/* ── Columns: visits per week ── */
function Columns({ data }: { data: TrendData }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220, L = 40, R = 12, T = 18, B = 28;
  const n = data.weeks.length;
  const max = Math.max(1, ...data.overall.map((c) => c.visits));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const band = (W - L - R) / n;
  const bw = Math.min(24, band - 2);
  const y = (v: number) => T + ((top - v) * (H - T - B)) / top;
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} role="img" aria-label="Visits logged per week" style={{ display: "block" }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke={f === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
            <text x={L - 8} y={y(top * f) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{compact(top * f)}</text>
          </g>
        ))}
        {data.overall.map((c, i) => {
          const cx = L + band * i + band / 2;
          const h = Math.max(0, y(0) - y(c.visits));
          const r = Math.min(4, h / 2, bw / 2);
          const x0 = cx - bw / 2, y0 = y(c.visits);
          const d = h > 0 ? `M${x0},${y(0)}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y(0)}Z` : "";
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${data.weeks[i].label}: ${c.visits} visits`}>
              <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" />
              {d && <path d={d} fill="var(--series-1)" opacity={hover == null || hover === i ? 1 : 0.55} />}
              {(i === n - 1) && c.visits > 0 && <text x={cx} y={y0 - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)">{compact(c.visits)}</text>}
            </g>
          );
        })}
        {data.weeks.map((w, i) => (i % Math.ceil(n / 6) === 0 || i === n - 1) && (
          <text key={w.ymd} x={L + band * i + band / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{w.short}</text>
        ))}
      </svg>
      {hover != null && (
        <Tip x={L + band * hover + band / 2} y={y(data.overall[hover].visits)}>
          <div className="text-[15px] font-semibold">{data.overall[hover].visits.toLocaleString("en-IN")}</div>
          <div style={{ color: "var(--ink-2)" }}>visits · {data.weeks[hover].label}</div>
        </Tip>
      )}
    </div>
  );
}

/* ── Heatmap: RM × week ── */
function Heatmap({ data, metric }: { data: TrendData; metric: Metric }) {
  const [tip, setTip] = useState<{ x: number; y: number; row: string; week: string; c: TrendCell } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const color = (v: number | null) => (v == null ? null : RAMP[Math.min(RAMP.length - 1, Math.round((v / 100) * (RAMP.length - 1)))]);
  const ink = (hex: string | null) => (hex && RAMP.indexOf(hex) >= 6 ? "#ffffff" : "var(--ink)");
  const show = (e: React.SyntheticEvent<HTMLElement>, row: string, week: string, c: TrendCell) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = wrap.current!.getBoundingClientRect();
    setTip({ x: r.left - w.left + r.width / 2 + wrap.current!.scrollLeft, y: r.top - w.top, row, week, c });
  };
  const Cell = ({ c, row, week }: { c: TrendCell; row: string; week: string }) => {
    const v = pctOf(c, metric);
    const bg = color(v);
    return (
      <td className="p-0">
        <div tabIndex={0} onPointerEnter={(e) => show(e, row, week, c)} onPointerLeave={() => setTip(null)} onFocus={(e) => show(e, row, week, c)} onBlur={() => setTip(null)}
          className="flex h-[30px] min-w-[46px] items-center justify-center rounded-[4px] text-[11px] font-semibold outline-none focus:ring-2 focus:ring-[#0b0b0b]/40"
          style={{ background: bg ?? "#f0efec", color: bg ? ink(bg) : "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
          {v == null ? "—" : `${Math.round(v)}`}
        </div>
      </td>
    );
  };
  return (
    <div ref={wrap} className="relative overflow-x-auto">
      <table className="border-separate text-[12px]" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] bg-white pr-3 text-left text-[11px] font-semibold" style={{ color: "var(--muted)" }}>Regional Manager</th>
            {data.weeks.map((w) => <th key={w.ymd} className="px-0.5 text-center text-[10.5px] font-semibold" style={{ color: "var(--muted)" }}>{w.short}</th>)}
            <th className="pl-2 text-center text-[10.5px] font-semibold" style={{ color: "var(--muted)" }}>{data.weeks.length} wks</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.userId}>
              <td className="sticky left-0 z-[1] max-w-[180px] truncate bg-white pr-3 font-semibold" style={{ color: "var(--ink)" }} title={r.name}>{r.name}</td>
              {r.cells.map((c, i) => <Cell key={i} c={c} row={r.name} week={data.weeks[i].label} />)}
              <td className="pl-2"><div className="text-center font-bold" style={{ color: "var(--ink)" }}>{fmtPct(pctOf(r.total, metric))}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {tip && (
        <Tip x={tip.x} y={tip.y}>
          <div className="text-[15px] font-semibold">{fmtPct(pctOf(tip.c, metric))}</div>
          <div style={{ color: "var(--ink-2)" }}>{tip.row} · {tip.week}</div>
          <div className="mt-1" style={{ color: "var(--ink-2)" }}>{tip.c.visits} visits · {tip.c.reviewed} reviewed · {tip.c.withinSla} in SLA</div>
        </Tip>
      )}
      <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
        <span>0%</span>
        <span className="flex">{RAMP.map((h) => <span key={h} className="h-2.5 w-4" style={{ background: h }} />)}</span>
        <span>100%</span>
        <span className="ml-3 inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm" style={{ background: "#f0efec" }} /> no visits</span>
      </div>
    </div>
  );
}

export function TrendCharts({ data, showHeatmap }: { data: TrendData; showHeatmap: boolean }) {
  const [metric, setMetric] = useState<Metric>("sla");
  const card = "rounded-[14px] border border-black/[0.04] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
  const label = metric === "sla" ? `Reviewed within ${data.slaHours}h SLA` : "Reviewed (as of now)";
  return (
    <div style={VARS} className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        {(["sla", "reviewed"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMetric(m)}
            className={`rounded-full border-[1.5px] px-3 py-1.5 text-[12px] font-semibold ${metric === m ? "border-[#7DA02E] bg-[#F5F9EA] text-[#7DA02E]" : "border-[#E0E0E0] bg-white text-[#616161]"}`}>
            {m === "sla" ? `Within ${data.slaHours}h SLA %` : "Reviewed %"}
          </button>
        ))}
        <span className="text-[11.5px] text-[#9E9E9E]">Share of each week’s visits · last {data.weeks.length} completed weeks</span>
      </div>
      <div className="grid gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        <div className={card}>
          <div className="text-[14px] font-bold text-[#1A1C1A]">{label}{showHeatmap ? " — all regions" : ""}</div>
          <div className="mb-2 text-[11.5px] text-[#9E9E9E]">Line = weekly share · grey line = {TARGET}% target</div>
          <LineChart data={data} metric={metric} />
        </div>
        <div className={card}>
          <div className="text-[14px] font-bold text-[#1A1C1A]">Visits logged per week</div>
          <div className="mb-2 text-[11.5px] text-[#9E9E9E]">{showHeatmap ? "All regions" : "Your stores"}</div>
          <Columns data={data} />
        </div>
      </div>
      {showHeatmap && (
        <div className={card}>
          <div className="text-[14px] font-bold text-[#1A1C1A]">{label} by Regional Manager</div>
          <div className="mb-3 text-[11.5px] text-[#9E9E9E]">Each cell = % of that RM’s visits that week · darker = better · hover or tab for details</div>
          <Heatmap data={data} metric={metric} />
        </div>
      )}
    </div>
  );
}
