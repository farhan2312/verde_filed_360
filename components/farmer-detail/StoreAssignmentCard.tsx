import { Card } from "@/components/ui";
import { initials } from "@/lib/format";
import type { FarmerStore } from "./types";

function OfficerTile({
  label,
  name,
  color,
}: {
  label: string;
  name: string;
  color: string;
}) {
  return (
    <div className="flex-1 px-3 py-2.5 bg-[#F5F7F5] rounded-[10px]">
      <div className="text-[9px] font-bold text-[#9E9E9E] uppercase mb-1">{label}</div>
      <div className="flex items-center gap-[7px]">
        <div
          className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
          style={{ background: color }}
        >
          {name ? initials(name) : ""}
        </div>
        <div className="text-[12.5px] font-semibold text-[#1A1C1A]">{name}</div>
      </div>
    </div>
  );
}

export function StoreAssignmentCard({ store }: { store: FarmerStore }) {
  const ao1 = store.officers[0]?.name ?? "";
  const ao2 = store.officers[1]?.name ?? "";

  return (
    <Card className="p-0 overflow-hidden col-span-2 flex flex-col">
      <div
        className="px-[18px] py-3 flex items-center justify-between"
        style={{ background: store.color }}
      >
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="white">
            <path d="M1 5.5l1-3h10l1 3v1H1V5.5z" opacity="0.85" />
            <rect x="2" y="6.5" width="10" height="6" rx="0.5" fill="white" />
            <rect x="5" y="8.5" width="4" height="4" rx="0.5" fill={store.color} />
          </svg>
          <div>
            <div className="text-[11px] font-bold text-white/75 uppercase tracking-[0.7px]">
              Primary Store
            </div>
            <div className="text-[14px] font-bold text-white">{store.name}</div>
          </div>
        </div>
        <div className="text-[11px] font-bold text-white/80 bg-white/[0.18] px-2.5 py-[3px] rounded-[20px]">
          {store.code}
        </div>
      </div>
      <div className="px-[18px] py-3.5 flex-1">
        <div className="text-[11px] text-[#9E9E9E] mb-2.5">{store.address}</div>
        <div className="text-[10px] font-bold text-[#9E9E9E] uppercase tracking-[0.6px] mb-2">
          Relationship Officers
        </div>
        <div className="flex gap-2.5">
          <OfficerTile label="AO 1 · Primary" name={ao1} color={store.color} />
          <OfficerTile label="AO 2 · Support" name={ao2} color="#9E9E9E" />
        </div>
      </div>
    </Card>
  );
}
