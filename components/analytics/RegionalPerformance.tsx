import { AnalyticsCard, CardTitle } from "./AnalyticsCard";
import { EmptyState } from "@/components/ui";

export interface Region {
  name: string;
  visits: number;
  conv: number;
  visitPct: number;
}

/** Regional Performance card (lines 511–525). */
export function RegionalPerformance({ regions }: { regions: Region[] }) {
  return (
    <AnalyticsCard>
      <CardTitle>Regional Performance</CardTitle>
      {regions.length === 0 ? (
        <EmptyState title="No regional data" hint="No visits recorded across regions." />
      ) : (
        regions.map((r) => (
          <div key={r.name} className="mb-3.5">
            <div className="flex justify-between mb-[5px]">
              <span className="text-[12.5px] font-semibold text-[#1A1C1A]">{r.name}</span>
              <span className="text-[11px] text-[#757575]">
                {r.visits.toLocaleString("en-IN")} farmers · {r.conv}% active
              </span>
            </div>
            <div className="flex gap-1 h-2">
              <div
                className="h-full rounded"
                style={{ width: `${r.visitPct}%`, background: "#678722" }}
              />
              <div className="h-full flex-1 bg-[#F0F0F0] rounded" />
            </div>
          </div>
        ))
      )}
    </AnalyticsCard>
  );
}
