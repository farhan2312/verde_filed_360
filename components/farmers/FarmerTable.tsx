import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { InfoHint, InfoTip } from "@/components/InfoTip";
import { cropLabel } from "@/lib/crops";
import type { FarmerRowVM } from "./types";

/** Shared 9-column grid template (header + rows must stay aligned). */
const GRID =
  "grid [grid-template-columns:1.3fr_0.7fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_0.8fr_0.5fr]";

function StatusPill({
  label,
  bg,
  color,
}: {
  label: string | null;
  bg: string;
  color: string;
}) {
  if (!label) return <span className="text-[12px] text-[#BDBDBD]">—</span>;
  return (
    <div className="flex">
      <div
        className="inline-flex px-[9px] py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: bg, color }}
      >
        <InfoTip term={label}>{label}</InfoTip>
      </div>
    </div>
  );
}

function FarmerTableRow({ row }: { row: FarmerRowVM }) {
  return (
    <Link
      href={`/farmers/${row.id}`}
      className={`${GRID} px-[22px] py-[13px] border-b border-[#F8F8F8] cursor-pointer items-center hover:bg-[#FAFFFE]`}
    >
      {/* Col 1 — Farmer */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0"
          style={{ background: row.avBg }}
        >
          {row.init}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#1A1C1A]">{row.name}</div>
          <div className="text-[10.5px] text-[#BDBDBD]">{row.mobile || "—"}</div>
        </div>
      </div>
      {/* Col 2 — Village */}
      <div className="text-xs text-[#616161]">{row.village || "—"}</div>
      {/* Col 3 — Crops (canonical tags, sales ∪ visit) */}
      <div className="flex flex-wrap gap-1">
        {row.crops.length === 0 ? (
          <span className="text-[12px] text-[#BDBDBD]">—</span>
        ) : (
          row.crops.map((c) => (
            <span key={c} className="rounded-full bg-[#F5F7F5] px-1.5 py-0.5 text-[10px] font-medium text-[#616161]">{cropLabel(c)}</span>
          ))
        )}
      </div>
      {/* Col 4 — Value segment */}
      <StatusPill label={row.segment} bg={row.segBg} color={row.segColor} />
      {/* Col 5 — Lifecycle */}
      <StatusPill label={row.lifecycle} bg={row.lifeBg} color={row.lifeColor} />
      {/* Col 6 — LTV */}
      <div className="text-[12.5px] font-semibold text-[#1A1C1A]">{row.ltv}</div>
      {/* Col 6 — Last Visit */}
      <div className="text-xs text-[#9E9E9E]">{row.lastVisit}</div>
      {/* Col 7 — Store */}
      <div className="flex items-center gap-[5px]">
        <div
          className="w-2 h-2 rounded-sm shrink-0"
          style={{ background: row.storeColor }}
        />
        <div className="text-[11px] font-semibold text-[#616161]">
          {row.storeName}
        </div>
      </div>
      {/* Col 8 — Status */}
      <StatusPill label={row.status} bg={row.statusBg} color={row.statusColor} />
    </Link>
  );
}

export function FarmerTable({ rows }: { rows: FarmerRowVM[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] overflow-hidden">
      <div className="overflow-x-auto">
      <div className="min-w-[980px] lg:min-w-0">
      {/* Header row */}
      <div
        className={`${GRID} px-[22px] py-3.5 bg-[#FAFAFA] border-b border-[#F0F0F0] text-[10.5px] font-semibold text-[#9E9E9E] uppercase tracking-[0.5px]`}
      >
        <div>Farmer</div>
        <div>Village</div>
        <div>Crop</div>
        <div className="flex items-center">Segment<InfoHint term="VALUE SEGMENT" /></div>
        <div className="flex items-center">Lifecycle<InfoHint term="LIFECYCLE" /></div>
        <div className="flex items-center">LTV<InfoHint term="LTV" /></div>
        <div>Last Visit</div>
        <div>Store</div>
        <div>Status</div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No farmers found"
          hint="No farmers match the current search or segment filter."
        />
      ) : (
        rows.map((row) => <FarmerTableRow key={row.id} row={row} />)
      )}
      </div>
      </div>
    </div>
  );
}
