import { Card } from "@/components/ui";
import type { FarmerVisitLog } from "./types";

export function VisitReportsCard({
  visits,
  count,
}: {
  visits: FarmerVisitLog[];
  count: number;
}) {
  return (
    <Card className="p-[22px]">
      <div className="flex justify-between items-center mb-3.5">
        <div className="text-[15px] font-bold text-[#1A1C1A]">Visit Reports</div>
        <div className="text-[11px] text-[#678722] font-semibold">{count} visits</div>
      </div>
      {visits.length > 0 ? (
        visits.map((vl) => (
          <div key={vl.id} className="py-3.5 border-b border-[#F5F5F5]">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#678722] shrink-0" />
                <span className="text-[12.5px] font-semibold text-[#1A1C1A]">
                  {vl.purpose}
                </span>
              </div>
              <span className="text-[11px] text-[#BDBDBD]">{vl.date}</span>
            </div>
            {vl.notes && (
              <div className="text-[12px] text-[#616161] leading-[1.55] ml-4">
                {vl.notes}
              </div>
            )}
            {vl.followUp && (
              <div className="ml-4 mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#FFF3E0] px-2.5 py-1 text-[11px] font-semibold text-[#E65100]">
                <span>📅</span> Follow-up: {vl.followUp}
              </div>
            )}
            {vl.by && (
              <div className="text-[10.5px] text-[#9E9E9E] ml-4 mt-1">By {vl.by}</div>
            )}
          </div>
        ))
      ) : (
        <div className="p-7 text-center text-[#BDBDBD] text-[13px]">
          No visit reports yet
        </div>
      )}
    </Card>
  );
}
