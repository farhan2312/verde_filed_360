import { AnalyticsCard } from "./AnalyticsCard";
import { EmptyState } from "@/components/ui";

export interface HeatmapData {
  problems: string[];
  crops: string[];
  data: number[][];
}

/**
 * Computes the heatmap cell colours from intensity t = v / max (lines 2920–2930).
 *  - t > 0.6 → hot red ramp + white text
 *  - else    → green-tint ramp + #424242 text
 */
function cellStyle(v: number, max: number): { bg: string; tc: string } {
  const t = max > 0 ? v / max : 0;
  if (t > 0.6) {
    return {
      bg: `rgb(${200 - t * 120}, ${80 + t * 20}, ${60 + t * 10})`,
      tc: "white",
    };
  }
  return {
    bg: `rgb(${232 - t * 170}, ${245 - t * 130}, ${233 - t * 175})`,
    tc: "#424242",
  };
}

/** Problem Heatmap card (lines 467–486): crop × issue intensity grid. */
export function ProblemHeatmap({ heatmap }: { heatmap: HeatmapData }) {
  const { problems, crops, data } = heatmap;
  const max = Math.max(1, ...data.flat());

  return (
    <AnalyticsCard>
      <div className="text-[15px] font-bold text-[#1A1C1A] mb-1">Problem Heatmap</div>
      <div className="text-[11px] text-[#9E9E9E] mb-4">
        Crop × Issue intensity — darker = more reports
      </div>

      {crops.length === 0 ? (
        <EmptyState title="No problem reports" hint="No crop × issue data for this period." />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[380px] lg:min-w-0">
          {/* Header row */}
          <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-[3px] mb-[3px]">
            <div />
            {problems.map((hp) => (
              <div
                key={hp}
                className="text-[9.5px] font-semibold text-[#9E9E9E] text-center px-0.5 py-1 uppercase tracking-[0.3px]"
              >
                {hp}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {crops.map((crop, ci) => (
            <div
              key={crop}
              className="grid grid-cols-[80px_repeat(5,1fr)] gap-[3px] mb-[3px]"
            >
              <div className="text-[11px] font-semibold text-[#424242] flex items-center pr-2">
                {crop}
              </div>
              {(data[ci] ?? []).map((val, pi) => {
                const { bg, tc } = cellStyle(val, max);
                return (
                  <div
                    key={pi}
                    className="h-[42px] rounded-md flex items-center justify-center text-xs font-bold"
                    style={{ background: bg, color: tc }}
                  >
                    {val}
                  </div>
                );
              })}
            </div>
          ))}
          </div>
        </div>
      )}
    </AnalyticsCard>
  );
}
