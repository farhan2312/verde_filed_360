import { Card } from "@/components/ui";
import { initials } from "@/lib/format";
import { cropLabel } from "@/lib/crops";
import { InfoTip } from "@/components/InfoTip";
import type { FarmerDetail } from "./types";

function DetailRow({
  label,
  value,
  valueClass = "text-[#1A1C1A]",
  border = true,
}: {
  label: string;
  value: string;
  valueClass?: string;
  border?: boolean;
}) {
  return (
    <div
      className={`flex justify-between text-[12.5px] py-1.5 ${
        border ? "border-b border-[#F5F5F5]" : ""
      }`}
    >
      <span className="text-[#9E9E9E]">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

export function FarmerProfileCard({ farmer }: { farmer: FarmerDetail }) {
  return (
    <Card className="p-[22px] col-span-2">
      <div className="flex items-center gap-4 mb-[18px]">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-[20px] text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#678722,#B3D170)" }}
        >
          {farmer.name ? initials(farmer.name) : ""}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[18px] font-bold text-[#1A1C1A]">{farmer.name}</div>
            {farmer.segment && (
              <div
                className="px-2.5 py-[3px] rounded-[20px] text-[10px] font-bold"
                style={{ background: farmer.segBg, color: farmer.segColor }}
              >
                <InfoTip term={farmer.segment}>{farmer.segment}</InfoTip>
              </div>
            )}
            {farmer.lifecycle && (
              <div
                className="px-2.5 py-[3px] rounded-[20px] text-[10px] font-bold"
                style={{ background: farmer.lifeBg, color: farmer.lifeColor }}
              >
                <InfoTip term={farmer.lifecycle}>{farmer.lifecycle}</InfoTip>
              </div>
            )}
            {farmer.attendedGhoshti && (
              <div
                className="px-2.5 py-[3px] rounded-[20px] text-[10px] font-bold"
                style={{ background: "#FFF3E0", color: "#E65100" }}
                title="Attended a Ghoshti (farmer meetup)"
              >
                🌾 Ghoshti
              </div>
            )}
          </div>
          <div className="text-[12px] text-[#9E9E9E] mt-0.5">
            {farmer.village}
            {farmer.village && farmer.district ? ", " : ""}
            {farmer.district}
            {farmer.mobile ? ` · ${farmer.mobile}` : ""}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <DetailRow label="Village" value={farmer.village || "—"} />
        <DetailRow label="District" value={farmer.district || "—"} />
        <DetailRow label="Land" value={farmer.land || "—"} />
        <DetailRow label="Season" value={farmer.season} />
        <DetailRow label="Soil" value={farmer.soil} border={false} />
        <DetailRow
          label="Total Visits"
          value={String(farmer.visitCount)}
          border={false}
        />
      </div>

      {/* Crops — labelled by source (Sales upload vs Field visits) */}
      <div className="mt-3 border-t border-[#F5F5F5] pt-3">
        <div className="mb-1.5 flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Crops</span>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#678722]"><span className="inline-block h-2 w-2 rounded-full bg-[#F3F8E6] ring-1 ring-[#678722]" /> Sales</span>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#1565C0]"><span className="inline-block h-2 w-2 rounded-full bg-[#E3F2FD] ring-1 ring-[#1565C0]" /> Visit</span>
        </div>
        {farmer.salesCrops.length === 0 && farmer.visitCrops.length === 0 ? (
          <span className="text-[12px] text-[#BDBDBD]">No crop data yet</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {farmer.salesCrops.map((c) => (
              <span key={`s-${c}`} className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[11px] font-semibold text-[#678722]" title="From sales upload">{cropLabel(c)}</span>
            ))}
            {farmer.visitCrops.map((c) => (
              <span key={`v-${c}`} className="rounded-full bg-[#E3F2FD] px-2 py-0.5 text-[11px] font-semibold text-[#1565C0]" title="From field visit">{cropLabel(c)}</span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
