import { AnalyticsCard, CardTitle } from "./AnalyticsCard";
import { EmptyState } from "@/components/ui";

export interface QualityRow {
  label: string;
  pct: number;
  color: string;
}

/** Data Quality Score card (lines 566–579). */
export function DataQualityScore({ quality }: { quality: QualityRow[] }) {
  return (
    <AnalyticsCard>
      <CardTitle>Data Quality Score</CardTitle>
      {quality.length === 0 ? (
        <EmptyState title="No quality metrics" hint="Completeness data unavailable." />
      ) : (
        quality.map((q) => (
          <div key={q.label} className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-[#616161]">{q.label}</span>
              <span className="text-xs font-bold" style={{ color: q.color }}>
                {q.pct}%
              </span>
            </div>
            <div className="h-2 bg-[#F0F0F0] rounded overflow-hidden">
              <div
                className="h-full rounded"
                style={{ width: `${q.pct}%`, background: q.color }}
              />
            </div>
          </div>
        ))
      )}
    </AnalyticsCard>
  );
}
