import type { NewFarmerAcq } from "@/app/actions/analytics-segments";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => x.toLocaleString("en-IN");

// Only the most recent months are drawn so the chart stays compact and the Explore workbench below
// it is not pushed off-screen. The header still states the full range and full total.
const MAX_MONTHS = 12;

// One colour per store — every store is named, so the palette covers the full estate (~25 today),
// drawn from Verde's green scale plus the info-blue, accent-gold and teal/plum families. Ordered so
// that stores adjacent in a stack (and in the legend) alternate hue and lightness instead of sitting
// as near-identical pale tints; the largest stores get the strongest colours. "Unassigned" is grey.
const PALETTE = [
  "#7DA02E", "#1565C0", "#EDA942", "#3F5A17", "#6FA8E0", "#BDD67F", "#8A5A0B", "#A4C954", "#0D3F7A", "#F4CE8E",
  "#66852A", "#9CC0EA", "#CCE09A", "#C7821F", "#2F6EB5", "#DBE9B4", "#556B20", "#CFE0F3", "#B8741A", "#F9E4BF",
  "#00695C", "#7B1FA2", "#4DB6AC", "#CE93D8", "#AD1457", "#4527A0", "#F06292", "#9575CD",
];
const UNASSIGNED_COLOR = "#D9DDD3";

function colorOf(key: string, idx: number): string {
  if (key === "Unassigned") return UNASSIGNED_COLOR;
  return PALETTE[idx % PALETTE.length];
}

const labelOf = (key: string) => (key === "Unassigned" ? "Unassigned (no store)" : key);

/**
 * New customers created from a sale (no prior registration — code FARM-C-*), by first-purchase month,
 * stacked by store. Pure SVG so it renders server-side; native <title> tooltips on each segment.
 * Farmers with no store arrive pre-bucketed as "Unassigned" and are always labelled explicitly.
 */
export function NewFarmersChart({ data }: { data: NewFarmerAcq }) {
  if (!data.months.length) {
    return (
      <div className={CARD}>
        <div className="text-[14px] font-bold text-[#1A1C1A]">New customers from sales</div>
        <div className="mt-2 text-[12.5px] text-[#9E9E9E]">No sale-created customers in your scope yet.</div>
      </div>
    );
  }
  // Colours are keyed off the full-range legend order so a store keeps its colour whatever window is shown.
  const keyColor = new Map(data.keys.map((k, i) => [k, colorOf(k, i)]));
  const months = data.months.slice(-MAX_MONTHS);
  const truncated = months.length < data.months.length;
  const shownTotal = months.reduce((a, m) => a + m.total, 0);
  // Legend lists only stores that actually appear in the visible window.
  const keys = data.keys.filter((k) => months.some((m) => (m.counts[k] ?? 0) > 0));
  const max = Math.max(1, ...months.map((m) => m.total));
  const unassignedN = data.months.reduce((a, m) => a + (m.counts["Unassigned"] ?? 0), 0);
  const first = data.months[0].label, last = data.months[data.months.length - 1].label;
  // Horizontal stacked bars: one row per month. L = month-label gutter, R = total-label gutter
  // (wide enough that the largest bar's total label is never clipped).
  const W = 760, L = 62, R = 58, ROW = 20, GAP = 9;
  const barMaxW = W - L - R;
  const chartH = months.length * (ROW + GAP);

  return (
    <div className={CARD}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-bold text-[#1A1C1A]">New customers from sales</div>
        <div className="text-[11px] text-[#9E9E9E]">
          <b className="text-[#66852A]">{n(data.total)}</b> farmers · {n(data.distinct)} stores · {first} – {last}
          {unassignedN > 0 && <> · {n(unassignedN)} with no store on file</>}
          {truncated && <> · showing latest {months.length} months ({n(shownTotal)} farmers)</>}
          {" "}· by first-purchase month, stacked by store
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={W} height={chartH} className="block">
          {months.map((mo, i) => {
            const y = i * (ROW + GAP);
            const barW = (mo.total / max) * barMaxW;
            let xCursor = L;
            return (
              <g key={mo.ym}>
                <text x={L - 6} y={y + ROW / 2} textAnchor="end" dominantBaseline="middle" fontSize={9.5} className="fill-[#616161]" fontWeight={600}>{mo.label}</text>
                {data.keys.map((k) => {
                  const c = mo.counts[k] ?? 0;
                  if (c <= 0) return null;
                  const w = (c / max) * barMaxW;
                  const seg = <rect key={k} x={xCursor} y={y} width={w} height={ROW} fill={keyColor.get(k)} stroke="#fff" strokeWidth={0.5}><title>{`${mo.label} · ${k === "Unassigned" ? "No store on file" : k}: ${n(c)}`}</title></rect>;
                  xCursor += w;
                  return seg;
                })}
                <text x={L + barW + 5} y={y + ROW / 2} dominantBaseline="middle" fontSize={9.5} className="fill-[#1A1C1A]" fontWeight={700}>{n(mo.total)}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-[#F3F3F3] pt-2.5">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 text-[10px] text-[#616161]">
            <span className="h-[9px] w-[9px] rounded-[2px] border border-black/10" style={{ background: keyColor.get(k) }} />
            <span className="max-w-[180px] truncate" title={labelOf(k)}>{labelOf(k)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
