import { AnalyticsCard, CardTitle } from "./AnalyticsCard";
import { EmptyState } from "@/components/ui";

export interface LandSegment {
  label: string;
  count: number;
  pct: number;
  color: string;
}

/** Farmer Segmentation by Land card (lines 549–564). */
export function LandSegmentation({ segments }: { segments: LandSegment[] }) {
  return (
    <AnalyticsCard>
      <CardTitle>Farmer Segmentation by Spend (12M)</CardTitle>
      {segments.length === 0 ? (
        <EmptyState title="No segmentation data" hint="No land-holding data available." />
      ) : (
        segments.map((seg) => (
          <div key={seg.label} className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-[#616161]">{seg.label}</span>
              <span className="text-xs font-bold text-[#1A1C1A]">{seg.count}</span>
            </div>
            <div className="h-5 bg-[#F5F5F5] rounded-md overflow-hidden">
              <div
                className="h-full rounded-md flex items-center pl-2"
                style={{ width: `${seg.pct}%`, background: seg.color }}
              >
                <span className="text-[10px] font-semibold text-white">{seg.pct}%</span>
              </div>
            </div>
          </div>
        ))
      )}
    </AnalyticsCard>
  );
}
