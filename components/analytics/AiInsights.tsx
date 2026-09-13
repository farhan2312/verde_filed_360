import { EmptyState } from "@/components/ui";

export interface Insight {
  title: string;
  text: string;
  accent: string;
}

/** AI Insights row (lines 583–590): 4 accent-bordered cards. */
export function AiInsights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-[14px] bg-white p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
        <EmptyState title="No insights yet" hint="Insights appear as field data accumulates." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {insights.map((ins) => (
        <div
          key={ins.title}
          className="rounded-[14px] bg-white p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] border-l-[3px]"
          style={{ borderLeftColor: ins.accent }}
        >
          <div
            className="text-[11px] font-bold uppercase tracking-[0.5px] mb-1.5"
            style={{ color: ins.accent }}
          >
            {ins.title}
          </div>
          <div className="text-xs text-[#616161] leading-[1.55]">{ins.text}</div>
        </div>
      ))}
    </div>
  );
}
