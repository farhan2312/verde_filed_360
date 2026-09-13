import { SectionCard, ProgressBar } from "@/components/ui";
import { FUNNEL } from "@/lib/demo-metrics";
import { grouped } from "@/lib/format";

/**
 * Read-only lead funnel summary above the kanban board.
 * Numbers come verbatim from `lib/demo-metrics` (FUNNEL) — these are illustrative
 * org-level figures not derivable from the imported master data.
 */
export function LeadFunnel() {
  return (
    <SectionCard
      title="Lead Funnel"
      subtitle="Engagement conversion across the pipeline"
      className="mb-3.5"
    >
      <div className="flex flex-col gap-3.5">
        {FUNNEL.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-3">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: stage.color }}
            >
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[12.5px] font-semibold text-ink">
                  {stage.label}
                </div>
                <div className="text-[12px] font-semibold text-ink-600">
                  {grouped(stage.count)}
                  <span className="ml-1.5 text-[11px] font-medium text-ink-muted">
                    {stage.pct}%
                  </span>
                </div>
              </div>
              <ProgressBar pct={stage.pct} color={stage.color} height={6} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
