"use client";

/**
 * Hand-rolled SVG charts for custom analytics (no chart library in this app). Follows the dataviz
 * reference: fixed-order categorical hues (validated), thin marks with 4px rounded data ends anchored
 * to the baseline, 2px surface gaps, recessive grid, one y-axis, hover tooltips, legends for ≥2 series.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtValue } from "@/lib/custom-analytics/format";
import type { FieldFormat } from "@/lib/custom-analytics/model";

/** Categorical palette (reference instance, light) — assigned in this order, never cycled past 8. */
export const CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const OTHER_COLOR = "#b5b3ab";
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const INK = "#0b0b0b", INK2 = "#52514e", MUTED = "#898781", GRID = "#e1e0d9", AXIS = "#c3c2b7", SURFACE = "#ffffff";
/** Label ink on top of a fill: dark on yellow, white elsewhere. */
const onFill = (c: string) => (c === "#eda100" || c === OTHER_COLOR ? INK : "#ffffff");

export interface Series { key: string; label: string; color: string; values: (number | null)[] }
export interface ChartProps {
  cats: string[]; // display labels, one per category
  series: Series[];
  format: FieldFormat;
  stacked?: boolean;
  height: number;
  onPick?: (catIndex: number) => void;
}

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Rounded only at the data end (top for columns, right for bars); square at the baseline. */
function endRounded(x: number, y: number, w: number, h: number, r: number, horizontal: boolean): string {
  if (w <= 0 || h <= 0) return "";
  const rr = Math.min(r, horizontal ? w / 2 : w / 2, horizontal ? h / 2 : h);
  if (horizontal) return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 px-1">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: INK2 }}>
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 12), Math.max(8, w - 210));
  return (
    <div className="pointer-events-none absolute z-20 min-w-[140px] max-w-[220px] rounded-[8px] border bg-white px-2.5 py-2 text-[11.5px] shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
      style={{ left, top: Math.max(0, y - 10), borderColor: "rgba(11,11,11,0.10)", color: INK }}>
      {children}
    </div>
  );
}

function TipRows({ title, series, i, format }: { title: string; series: Series[]; i: number; format: FieldFormat }) {
  return (
    <>
      <div className="mb-1 font-semibold">{title}</div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1.5" style={{ color: INK2 }}><span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} /><span className="truncate">{s.label}</span></span>
          <span className="tabular-nums font-semibold">{fmtValue(s.values[i], format)}</span>
        </div>
      ))}
    </>
  );
}

/* ─────────────────────────── Column (vertical) & Bar (horizontal) ─────────────────────────── */

export function BarChart({ cats, series, format, stacked, height, onPick, horizontal }: ChartProps & { horizontal?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const n = cats.length;
  const legendH = series.length > 1 ? 22 : 0;
  const H = Math.max(80, height - legendH);
  const stackTotals = cats.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const rawMax = stacked && series.length > 1 ? Math.max(0, ...stackTotals) : Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const max = niceMax(rawMax);
  const showValues = series.length === 1 && n <= (horizontal ? 20 : 12);

  if (!width) return <div ref={ref} style={{ height }} />;

  if (horizontal) {
    const labelW = Math.min(150, Math.max(70, width * 0.3));
    const padR = showValues ? 52 : 12, top = 4, bottom = 18;
    const plotW = Math.max(20, width - labelW - padR);
    const band = (H - top - bottom) / Math.max(1, n);
    const groupH = Math.min(30, band * 0.78);
    const barH = stacked || series.length === 1 ? groupH : Math.max(2, (groupH - 2 * (series.length - 1)) / series.length);
    const xs = (v: number) => (v / max) * plotW;
    return (
      <div ref={ref} className="relative" style={{ height }}>
        <Legend series={series} />
        <svg width={width} height={H} role="img">
          {ticks(max).map((t, k) => (
            <g key={k}>
              <line x1={labelW + xs(t)} x2={labelW + xs(t)} y1={top} y2={H - bottom} stroke={k === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={labelW + xs(t)} y={H - 4} textAnchor="middle" fontSize={10} fill={MUTED}>{fmtValue(t, format, true)}</text>
            </g>
          ))}
          {cats.map((c, i) => {
            const y0 = top + band * i + (band - groupH) / 2;
            let acc = 0;
            return (
              <g key={i}>
                <text x={labelW - 6} y={y0 + groupH / 2} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={INK2}>{trunc(c, Math.max(6, Math.floor((labelW - 10) / 7.4)))}</text>
                {series.map((s, si) => {
                  const v = Math.max(0, s.values[i] ?? 0);
                  const w = xs(v);
                  if (stacked && series.length > 1) {
                    const x = labelW + xs(acc); acc += v;
                    const last = series.slice(si + 1).every((t) => !(t.values[i] ?? 0));
                    return <path key={s.key} d={last ? endRounded(x, y0, w, groupH, 4, true) : `M${x},${y0}h${Math.max(0, w - 2)}v${groupH}h${-Math.max(0, w - 2)}Z`} fill={s.color} />;
                  }
                  const y = y0 + si * (barH + 2);
                  return <path key={s.key} d={endRounded(labelW, y, w, barH, 4, true)} fill={s.color} />;
                })}
                {showValues && <text x={labelW + xs(Math.max(0, series[0].values[i] ?? 0)) + 4} y={y0 + groupH / 2} dominantBaseline="middle" fontSize={10.5} fill={INK2}>{fmtValue(series[0].values[i], format, true)}</text>}
                <rect x={0} y={top + band * i} width={width} height={band} fill="transparent" style={{ cursor: onPick ? "pointer" : "default" }}
                  onMouseMove={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(i)} />
              </g>
            );
          })}
        </svg>
        {hover && <Tooltip x={hover.x} y={hover.y + legendH} w={width}><TipRows title={cats[hover.i]} series={series} i={hover.i} format={format} /></Tooltip>}
      </div>
    );
  }

  const padL = 48, padR = 8, top = showValues ? 16 : 8;
  const plotW = Math.max(20, width - padL - padR);
  const band = plotW / Math.max(1, n);
  const rotate = n > plotW / 64;
  const bottom = rotate ? 54 : 22;
  const plotH = Math.max(20, H - top - bottom);
  const ys = (v: number) => (v / max) * plotH;
  const groupW = Math.min(56, band * 0.72);
  const barW = stacked || series.length === 1 ? groupW : Math.max(2, (groupW - 2 * (series.length - 1)) / series.length);
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / (rotate ? 16 : 64)))));
  return (
    <div ref={ref} className="relative" style={{ height }}>
      <Legend series={series} />
      <svg width={width} height={H} role="img">
        {ticks(max).map((t, k) => (
          <g key={k}>
            <line x1={padL} x2={width - padR} y1={top + plotH - ys(t)} y2={top + plotH - ys(t)} stroke={k === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={top + plotH - ys(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={MUTED}>{fmtValue(t, format, true)}</text>
          </g>
        ))}
        {cats.map((c, i) => {
          const x0 = padL + band * i + (band - groupW) / 2;
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = Math.max(0, s.values[i] ?? 0);
                const h = ys(v);
                if (stacked && series.length > 1) {
                  const y = top + plotH - ys(acc) - h; acc += v;
                  const last = series.slice(si + 1).every((t) => !(t.values[i] ?? 0));
                  return <path key={s.key} d={last ? endRounded(x0, y, groupW, h, 4, false) : `M${x0},${y + 2}h${groupW}v${Math.max(0, h - 2)}h${-groupW}Z`} fill={s.color} />;
                }
                return <path key={s.key} d={endRounded(x0 + si * (barW + 2), top + plotH - h, barW, h, 4, false)} fill={s.color} />;
              })}
              {showValues && <text x={x0 + groupW / 2} y={top + plotH - ys(Math.max(0, series[0].values[i] ?? 0)) - 4} textAnchor="middle" fontSize={10} fill={INK2}>{fmtValue(series[0].values[i], format, true)}</text>}
              {i % every === 0 && (rotate
                ? <text transform={`translate(${padL + band * i + band / 2},${top + plotH + 8}) rotate(-40)`} textAnchor="end" fontSize={10} fill={MUTED}>{trunc(c, 14)}</text>
                : <text x={padL + band * i + band / 2} y={top + plotH + 14} textAnchor="middle" fontSize={10} fill={MUTED}>{trunc(c, Math.max(4, Math.floor(band * every / 6.5)))}</text>)}
              <rect x={padL + band * i} y={top} width={band} height={plotH} fill="transparent" style={{ cursor: onPick ? "pointer" : "default" }}
                onMouseMove={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(i)} />
            </g>
          );
        })}
        {hover && <rect x={padL + band * hover.i} y={top} width={band} height={plotH} fill={INK} opacity={0.04} pointerEvents="none" />}
      </svg>
      {hover && <Tooltip x={hover.x} y={hover.y + legendH} w={width}><TipRows title={cats[hover.i]} series={series} i={hover.i} format={format} /></Tooltip>}
    </div>
  );
}

/* ─────────────────────────── Line & Area ─────────────────────────── */

export function LineChart({ cats, series, format, stacked, height, onPick, area }: ChartProps & { area?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const n = cats.length;
  const legendH = series.length > 1 ? 22 : 0;
  const H = Math.max(80, height - legendH);
  const stack = area && stacked && series.length > 1;
  const cum = useMemo(() => {
    if (!stack) return series.map((s) => s.values.map((v) => v ?? 0));
    const acc = cats.map(() => 0);
    return series.map((s) => s.values.map((v, i) => (acc[i] += Math.max(0, v ?? 0))));
  }, [series, cats, stack]);
  const max = niceMax(Math.max(0, ...cum.flat()));
  if (!width) return <div ref={ref} style={{ height }} />;
  const padL = 48, padR = 12, top = 8, bottom = 22;
  const plotW = Math.max(20, width - padL - padR), plotH = Math.max(20, H - top - bottom);
  const xs = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const ys = (v: number) => top + plotH - (v / max) * plotH;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 72))));
  const markers = n <= 24;
  const pick = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    return Math.max(0, Math.min(n - 1, Math.round(n <= 1 ? 0 : ((x - padL) / plotW) * (n - 1))));
  };
  return (
    <div ref={ref} className="relative" style={{ height }}>
      <Legend series={series} />
      <svg width={width} height={H} role="img"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHi(pick(e.clientX, r)); setPos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
        onMouseLeave={() => setHi(null)} onClick={(e) => { if (onPick && n) onPick(pick(e.clientX, e.currentTarget.getBoundingClientRect())); }}
        style={{ cursor: onPick ? "pointer" : "default" }}>
        {ticks(max).map((t, k) => (
          <g key={k}>
            <line x1={padL} x2={width - padR} y1={ys(t)} y2={ys(t)} stroke={k === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={ys(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={MUTED}>{fmtValue(t, format, true)}</text>
          </g>
        ))}
        {cats.map((c, i) => i % every === 0 && <text key={i} x={xs(i)} y={top + plotH + 14} textAnchor="middle" fontSize={10} fill={MUTED}>{trunc(c, 12)}</text>)}
        {[...series].map((s, si) => si).reverse().map((si) => {
          const s = series[si];
          const pts = cum[si].map((v, i) => `${xs(i)},${ys(v)}`);
          if (!pts.length) return null;
          const lower = stack && si > 0 ? cum[si - 1].map((v, i) => `${xs(i)},${ys(v)}`).reverse() : [`${xs(n - 1)},${ys(0)}`, `${xs(0)},${ys(0)}`];
          return (
            <g key={s.key}>
              {area && <polygon points={[...pts, ...lower].join(" ")} fill={s.color} opacity={stack ? 0.85 : 0.16} />}
              <polyline points={pts.join(" ")} fill="none" stroke={stack ? SURFACE : s.color} strokeWidth={2} strokeLinejoin="round" />
              {markers && !stack && cum[si].map((v, i) => <circle key={i} cx={xs(i)} cy={ys(v)} r={hi === i ? 5 : 3.5} fill={s.color} stroke={SURFACE} strokeWidth={2} />)}
            </g>
          );
        })}
        {hi != null && <line x1={xs(hi)} x2={xs(hi)} y1={top} y2={top + plotH} stroke={INK} strokeOpacity={0.25} strokeDasharray="3 3" pointerEvents="none" />}
      </svg>
      {hi != null && <Tooltip x={pos.x} y={pos.y + legendH} w={width}><TipRows title={cats[hi]} series={series} i={hi} format={format} /></Tooltip>}
    </div>
  );
}

/* ─────────────────────────── Donut ─────────────────────────── */

export function Donut({ cats, values, colors, format, height, onPick }: { cats: string[]; values: number[]; colors: string[]; format: FieldFormat; height: number; onPick?: (i: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (!width) return <div ref={ref} style={{ height }} />;
  const side = width >= 360;
  const size = Math.max(80, Math.min(side ? width * 0.5 : width, side ? height : height * 0.6) - 8);
  const R = size / 2, r = R * 0.62;
  let a0 = -Math.PI / 2;
  const arcs = values.map((v, i) => {
    const frac = total ? Math.max(0, v) / total : 0;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${R + rad * Math.cos(a)},${R + rad * Math.sin(a)}`;
    const d = frac >= 0.9999
      ? `M${p(0, R)}A${R},${R} 0 1 1 ${p(Math.PI, R)}A${R},${R} 0 1 1 ${p(0, R)}M${p(0, r)}A${r},${r} 0 1 0 ${p(Math.PI, r)}A${r},${r} 0 1 0 ${p(0, r)}Z`
      : `M${p(a0, R)}A${R},${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${large} 0 ${p(a0, r)}Z`;
    a0 = a1;
    return { d, i, frac };
  });
  const shown = hover ?? null;
  return (
    <div ref={ref} className={`flex ${side ? "flex-row items-center" : "flex-col items-center"} gap-3`} style={{ height }}>
      <svg width={size} height={size} role="img" className="shrink-0">
        {arcs.map((a) => a.frac > 0 && (
          <path key={a.i} d={a.d} fill={colors[a.i]} stroke={SURFACE} strokeWidth={2} fillRule="evenodd" opacity={shown == null || shown === a.i ? 1 : 0.45}
            style={{ cursor: onPick ? "pointer" : "default" }} onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(a.i)} />
        ))}
        <text x={R} y={R - 6} textAnchor="middle" fontSize={Math.max(12, R * 0.22)} fontWeight={700} fill={INK}>{fmtValue(shown == null ? total : values[shown], format, true)}</text>
        <text x={R} y={R + 12} textAnchor="middle" fontSize={10.5} fill={MUTED}>{shown == null ? "Total" : `${total ? ((Math.max(0, values[shown]) / total) * 100).toFixed(1) : 0}%`}</text>
      </svg>
      <div className="min-w-0 flex-1 overflow-y-auto" style={{ maxHeight: side ? height : height - size - 12 }}>
        {cats.map((c, i) => (
          <button key={i} type="button" onClick={() => onPick?.(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[11.5px] hover:bg-[#F5F5F3]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colors[i] }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: INK2 }} title={c}>{c}</span>
            <span className="tabular-nums font-semibold" style={{ color: INK }}>{fmtValue(values[i], format, true)}</span>
            <span className="w-[38px] text-right tabular-nums" style={{ color: MUTED }}>{total ? `${((Math.max(0, values[i]) / total) * 100).toFixed(0)}%` : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Treemap (squarified) ─────────────────────────── */

interface Rect { x: number; y: number; w: number; h: number; i: number }
function squarify(vals: { v: number; i: number }[], x: number, y: number, w: number, h: number): Rect[] {
  const out: Rect[] = [];
  let items = vals.filter((d) => d.v > 0);
  const total = items.reduce((a, d) => a + d.v, 0);
  if (!total) return out;
  const scale = (w * h) / total;
  items = items.map((d) => ({ v: d.v * scale, i: d.i }));
  let rx = x, ry = y, rw = w, rh = h;
  const worst = (row: number[], side: number) => { const s = row.reduce((a, b) => a + b, 0); const mx = Math.max(...row), mn = Math.min(...row); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  while (items.length) {
    const side = Math.min(rw, rh);
    const row: typeof items = [];
    while (items.length) {
      const next = [...row, items[0]].map((d) => d.v);
      if (row.length && worst(next, side) > worst(row.map((d) => d.v), side)) break;
      row.push(items.shift()!);
    }
    const s = row.reduce((a, d) => a + d.v, 0);
    if (rw >= rh) {
      const cw = s / rh; let cy = ry;
      for (const d of row) { const ch = d.v / cw; out.push({ x: rx, y: cy, w: cw, h: ch, i: d.i }); cy += ch; }
      rx += cw; rw -= cw;
    } else {
      const ch = s / rw; let cx = rx;
      for (const d of row) { const cw = d.v / ch; out.push({ x: cx, y: ry, w: cw, h: ch, i: d.i }); cx += cw; }
      ry += ch; rh -= ch;
    }
  }
  return out;
}

export function Treemap({ cats, values, colors, format, height, onPick }: { cats: string[]; values: number[]; colors: string[]; format: FieldFormat; height: number; onPick?: (i: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const rects = useMemo(() => (width ? squarify(values.map((v, i) => ({ v, i })), 0, 0, width, height) : []), [values, width, height]);
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img">
          {rects.map((r) => (
            <g key={r.i} style={{ cursor: onPick ? "pointer" : "default" }} onClick={() => onPick?.(r.i)}
              onMouseMove={(e) => setHover({ i: r.i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })} onMouseLeave={() => setHover(null)}>
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={4} fill={colors[r.i]} />
              {r.w > 56 && r.h > 30 && (
                <>
                  <text x={r.x + 7} y={r.y + 16} fontSize={11} fontWeight={600} fill={onFill(colors[r.i])}>{trunc(cats[r.i], Math.floor(r.w / 6.5))}</text>
                  <text x={r.x + 7} y={r.y + 30} fontSize={10.5} fill={onFill(colors[r.i])} opacity={0.9}>{fmtValue(values[r.i], format, true)}</text>
                </>
              )}
            </g>
          ))}
        </svg>
      )}
      {hover && (
        <Tooltip x={hover.x} y={hover.y} w={width}>
          <div className="font-semibold">{cats[hover.i]}</div>
          <div className="tabular-nums">{fmtValue(values[hover.i], format)}{total ? ` · ${((Math.max(0, values[hover.i]) / total) * 100).toFixed(1)}%` : ""}</div>
        </Tooltip>
      )}
    </div>
  );
}

/** Sequential (one-hue) cell shade for the matrix: light → dark by value. */
export function rampColor(v: number, max: number): { bg: string; fg: string } {
  if (!max || v <= 0) return { bg: "transparent", fg: INK };
  const k = Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1)));
  return { bg: RAMP[k], fg: k >= 7 ? "#ffffff" : INK };
}
