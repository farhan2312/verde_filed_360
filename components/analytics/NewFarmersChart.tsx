import type { NewFarmerAcq } from "@/app/actions/analytics-segments";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => x.toLocaleString("en-IN");

// Category colours for the top villages, built from Verde's green scale plus the info-blue and
// accent-gold families (tints/shades), interleaved so neighbouring stack segments stay distinct.
// "Other" / "Unknown" use neutral greys.
const PALETTE = [
  "#7DA02E", "#1565C0", "#EDA942", "#3F5A17", "#6FA8E0", "#BDD67F", "#8A5A0B", "#A4C954", "#0D3F7A", "#F4CE8E",
  "#66852A", "#9CC0EA", "#CCE09A", "#C7821F", "#2F6EB5", "#DBE9B4", "#556B20", "#CFE0F3", "#F9E4BF", "#E9F2CF",
];
const OTHER_COLOR = "#9AA392", UNKNOWN_COLOR = "#D9DDD3";

function colorOf(village: string, idx: number): string {
  if (village === "Other") return OTHER_COLOR;
  if (village === "Unknown") return UNKNOWN_COLOR;
  return PALETTE[idx % PALETTE.length];
}

/**
 * New customers created from a sale (no prior registration — code FARM-C-*), by first-purchase month,
 * stacked by village. Pure SVG so it renders server-side; native <title> tooltips on each segment.
 * Blank / placeholder villages arrive pre-bucketed as "Unknown" and are always labelled explicitly.
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
  const villageColor = new Map(data.villages.map((v, i) => [v, colorOf(v, i)]));
  const max = Math.max(1, ...data.months.map((m) => m.total));
  const unknownN = data.months.reduce((a, m) => a + (m.counts["Unknown"] ?? 0), 0);
  // Horizontal stacked bars: one row per month. L = month-label gutter, R = total-label gutter
  // (wide enough that the largest bar's total label is never clipped).
  const W = 760, L = 62, R = 58, ROW = 20, GAP = 9;
  const barMaxW = W - L - R;
  const chartH = data.months.length * (ROW + GAP);

  return (
    <div className={CARD}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-bold text-[#1A1C1A]">New customers from sales</div>
        <div className="text-[11px] text-[#9E9E9E]">
          <b className="text-[#66852A]">{n(data.total)}</b> farmers · {n(data.distinctVillages)} villages
          {unknownN > 0 && <> · {n(unknownN)} with no village on file</>} · by first-purchase month, stacked by village (top 20)
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={W} height={chartH} className="block">
          {data.months.map((mo, i) => {
            const y = i * (ROW + GAP);
            const barW = (mo.total / max) * barMaxW;
            let xCursor = L;
            return (
              <g key={mo.ym}>
                <text x={L - 6} y={y + ROW / 2} textAnchor="end" dominantBaseline="middle" fontSize={9.5} className="fill-[#616161]" fontWeight={600}>{mo.label}</text>
                {data.villages.map((v) => {
                  const c = mo.counts[v] ?? 0;
                  if (c <= 0) return null;
                  const w = (c / max) * barMaxW;
                  const seg = <rect key={v} x={xCursor} y={y} width={w} height={ROW} fill={villageColor.get(v)} stroke="#fff" strokeWidth={0.5}><title>{`${mo.label} · ${v === "Unknown" ? "Unknown village" : v}: ${n(c)}`}</title></rect>;
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
        {data.villages.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 text-[10px] text-[#616161]">
            <span className="h-[9px] w-[9px] rounded-[2px] border border-black/10" style={{ background: villageColor.get(v) }} />
            <span className="max-w-[180px] truncate" title={v}>{v === "Unknown" ? "Unknown (no village)" : v === "Other" ? "Other villages" : v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
