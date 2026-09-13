import type { LeadCardData } from "./types";

/** Pure presentational lead card: name, village · crop, land acres, last visit. */
export function LeadCard({ name, village, crop, land, lastVisit }: LeadCardData) {
  const sub = [village, crop].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl border border-black/[0.03] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-1 text-[13px] font-semibold text-ink">{name}</div>
      {sub && <div className="mb-2 text-[11px] text-ink-muted">{sub}</div>}
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] text-ink-400">
          {land != null ? `${land} acres` : ""}
        </div>
        <div className="text-[10px] text-ink-muted">{lastVisit ?? ""}</div>
      </div>
    </div>
  );
}
