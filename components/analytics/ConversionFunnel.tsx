import { AnalyticsCard, CardTitle } from "./AnalyticsCard";
import { EmptyState } from "@/components/ui";

export interface FunnelStep {
  label: string;
  count: number;
  pct: number;
  color: string;
}

/** Conversion Funnel card (lines 527–543). barH tapers: 32 - i*2 px. */
export function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  return (
    <AnalyticsCard>
      <CardTitle>Conversion Funnel</CardTitle>
      {steps.length === 0 ? (
        <EmptyState title="No funnel data" hint="No leads in the pipeline for this period." />
      ) : (
        steps.map((fd, i) => (
          <div key={fd.label} className="flex items-center gap-3 mb-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ background: fd.color }}
            >
              {i + 1}
            </div>
            <div className="flex-1">
              <div
                className="rounded-md flex items-center pl-3"
                style={{ height: `${32 - i * 2}px`, background: fd.color }}
              >
                <span className="text-[11px] font-semibold text-white">{fd.label}</span>
              </div>
            </div>
            <div className="w-[60px] text-right">
              <div className="text-sm font-bold text-[#1A1C1A]">{fd.count}</div>
              <div className="text-[10px] text-[#BDBDBD]">{fd.pct}%</div>
            </div>
          </div>
        ))
      )}
    </AnalyticsCard>
  );
}
