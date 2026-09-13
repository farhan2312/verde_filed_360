import { LeadCard } from "./LeadCard";
import type { LeadColumnData } from "./types";

/** A single kanban column: header (dot + title + count pill) and the card stack. */
export function LeadColumn({
  title,
  color,
  count,
  items,
}: Omit<LeadColumnData, "key">) {
  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
        />
        <div className="text-[13px] font-bold text-ink">{title}</div>
        <div className="rounded-[10px] bg-surface-200 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
          {count}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((li) => (
          <LeadCard key={li.id} {...li} />
        ))}
      </div>
    </div>
  );
}
