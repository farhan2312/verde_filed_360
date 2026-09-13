import { AUDIT_ACTION_META } from "@/lib/status";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui";

export interface AuditRowData {
  id: number;
  displayTs: string;
  actor: string;
  action: string;
  detail: string;
  ip: string;
}

const GRID = "grid grid-cols-[0.8fr_0.7fr_0.6fr_1.5fr_0.5fr]";

function AuditActionBadge({ action }: { action: string }) {
  const meta = AUDIT_ACTION_META[action] ?? { bg: "#FAFAFA", c: "#757575" };
  return (
    <div
      className="inline-block rounded-[20px] px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: meta.bg, color: meta.c }}
    >
      {action}
    </div>
  );
}

function AuditRow({ row, isLast }: { row: AuditRowData; isLast: boolean }) {
  return (
    <div
      className={cn(
        GRID,
        "items-center px-[22px] py-[13px]",
        !isLast && "border-b border-[#F8F8F8]",
      )}
    >
      <div className="text-xs text-[#757575]">{row.displayTs}</div>
      <div className="text-xs font-semibold text-[#1A1C1A]">{row.actor}</div>
      <div>
        <AuditActionBadge action={row.action} />
      </div>
      <div className="text-xs text-[#616161]">{row.detail}</div>
      <div className="text-[11px] text-[#BDBDBD]">{row.ip}</div>
    </div>
  );
}

export function AuditTable({ rows }: { rows: AuditRowData[] }) {
  return (
    <div className="animate-fadeUp">
      <div className="overflow-hidden rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
        <div className="min-w-[680px] lg:min-w-0">
        <div
          className={cn(
            GRID,
            "border-b border-[#F0F0F0] bg-[#FAFAFA] px-[22px] py-[14px]",
            "text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]",
          )}
        >
          <div>Timestamp</div>
          <div>User</div>
          <div>Action</div>
          <div>Details</div>
          <div>IP</div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No audit events yet"
            hint="System activity & data changes will appear here."
          />
        ) : (
          rows.map((row, i) => (
            <AuditRow key={row.id} row={row} isLast={i === rows.length - 1} />
          ))
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
