import { initials } from "@/lib/format";
import { visitTypeColor } from "@/lib/visit-types";
import { storeColor } from "@/lib/store-utils";
import type { VisitRecord } from "./types";

export function VisitRow({ row }: { row: VisitRecord }) {
  const swatch = row.storeId != null ? storeColor(row.storeId) : "#9E9E9E";

  return (
    <div className="grid grid-cols-[0.5fr_1.4fr_0.8fr_0.8fr_0.8fr_0.6fr_0.6fr_0.7fr_0.5fr] px-[22px] py-[13px] border-b border-[#F8F8F8] items-center cursor-pointer hover:bg-[#FAFFFE]">
      {/* Date */}
      <div className="text-xs font-semibold text-[#1A1C1A]">{row.date}</div>

      {/* Farmer */}
      <div className="flex items-center gap-[9px]">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] text-white shrink-0"
          style={{ background: row.avBg }}
        >
          {initials(row.farmerName)}
        </div>
        <div>
          <div className="flex items-center gap-[6px]">
            <span className="text-[13px] font-semibold text-[#1A1C1A]">
              {row.farmerName}
            </span>
            {row.reviewed && (
              <span className="inline-flex items-center rounded-full px-[7px] py-[1px] text-[9.5px] font-bold shrink-0" style={{ background: "#F3F8E6", color: "#678722" }}>
                ✓ Reviewed
              </span>
            )}
          </div>
          <div className="text-[10.5px] text-[#BDBDBD]">
            {[row.village, row.district].filter(Boolean).join(", ")}
          </div>
        </div>
      </div>

      {/* Visit type */}
      <div>
        <div className="inline-flex items-center gap-[5px] px-[10px] py-[3px] rounded-[20px] bg-[#F5F5F5]">
          <div
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: visitTypeColor(row.purpose) }}
          />
          <span className="text-[11px] font-semibold text-[#616161]">
            {row.purpose}
          </span>
        </div>
      </div>

      {/* Officer */}
      <div className="text-xs text-[#616161]">{row.officer}</div>

      {/* Store + Regional Manager */}
      <div className="min-w-0">
        <div className="flex items-center gap-[5px]">
          <div
            className="w-[7px] h-[7px] rounded-[2px] shrink-0"
            style={{ background: swatch }}
          />
          <span className="truncate text-xs text-[#616161]">{row.storeName}</span>
        </div>
        {row.rm && <div className="truncate text-[10px] text-[#BDBDBD]">RM: {row.rm}</div>}
      </div>

      {/* Crop */}
      <div className="text-xs text-[#616161]">{row.crop}</div>

      {/* Land */}
      <div className="text-xs text-[#616161]">{row.land || "—"}</div>

      {/* Follow-up */}
      <div>
        {row.followUp ? (
          <div className="px-[9px] py-[2px] rounded-[20px] text-[10px] font-semibold inline-block whitespace-nowrap" style={{ background: "#FFF3E0", color: "#E65100" }}>
            📅 {row.followUp}
          </div>
        ) : (
          <span className="text-[11px] text-[#BDBDBD]">—</span>
        )}
      </div>

      {/* Action */}
      <div className="text-[11px] font-semibold text-[#678722]">View →</div>
    </div>
  );
}
