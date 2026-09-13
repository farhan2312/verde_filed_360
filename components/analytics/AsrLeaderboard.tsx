import { AnalyticsCard, CardTitle } from "./AnalyticsCard";
import { EmptyState } from "@/components/ui";

export interface Asr {
  name: string;
  store: string;
  visits: number;
  score: number;
}

/** Threshold-based colours (lines 2933–2940). */
function rankColor(rank: number) {
  return rank <= 3 ? "#EDA942" : "#BDBDBD";
}
function scoreColor(score: number) {
  return score >= 80 ? "#7DA02E" : score >= 70 ? "#D4881F" : "#E65100";
}
function barColor(score: number) {
  return score >= 80 ? "#7DA02E" : score >= 70 ? "#EDA942" : "#FF8F00";
}

/** ASR Performance card (lines 488–505). */
export function AsrLeaderboard({ asrs }: { asrs: Asr[] }) {
  return (
    <AnalyticsCard>
      <CardTitle>ASR Performance</CardTitle>
      {asrs.length === 0 ? (
        <EmptyState title="No ASR activity" hint="No field officer visits in this period." />
      ) : (
        asrs.map((a, i) => {
          const rank = i + 1;
          return (
            <div key={a.name} className="flex items-center gap-2.5 mb-3.5">
              <div
                className="w-[22px] text-xs font-bold text-center"
                style={{ color: rankColor(rank) }}
              >
                {rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <span className="text-[12.5px] font-semibold text-[#1A1C1A]">
                    {a.name}
                  </span>
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: scoreColor(a.score) }}
                  >
                    {a.score}%
                  </span>
                </div>
                <div className="h-[7px] bg-[#F0F0F0] rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${a.score}%`, background: barColor(a.score) }}
                  />
                </div>
                <div className="text-[10px] text-[#BDBDBD] mt-[3px]">
                  {a.store} · {a.visits} visits
                </div>
              </div>
            </div>
          );
        })
      )}
    </AnalyticsCard>
  );
}
