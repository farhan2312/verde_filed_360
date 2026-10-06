import type { FarmerClusterVM } from "@/lib/farmer-360";

const CARD = "rounded-[14px] border border-black/[0.03] bg-white p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

/** Clusters (segments) this farmer currently belongs to, with each cluster's defining attributes. */
export function FarmerClustersCard({ clusters }: { clusters: FarmerClusterVM[] }) {
  return (
    <div className={CARD}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px] font-bold text-[#1A1C1A]">🎯 Clusters &amp; segments</span>
        {clusters.length > 0 && <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[11px] font-bold text-[#7DA02E]">{clusters.length}</span>}
      </div>
      <div className="mb-4 text-[12px] text-[#9E9E9E]">Saved farmer groups this farmer matches — and what defines each group.</div>

      {clusters.length === 0 ? (
        <div className="rounded-[10px] bg-[#FAFBFA] px-3 py-6 text-center text-[12.5px] text-[#9E9E9E]">Not in any cluster yet.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {clusters.map((c) => (
            <div key={c.id} className="rounded-[10px] border border-[#F0F0F0] px-3.5 py-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold text-[#1A1C1A]">{c.name}</span>
                <span className="rounded-full px-1.5 py-px text-[9.5px] font-bold"
                  style={c.mode === "dynamic" ? { background: "#E9F2CF", color: "#5C7D22" } : { background: "#E3F2FD", color: "#1565C0" }}>
                  {c.mode === "dynamic" ? "LIVE" : "STATIC"}
                </span>
              </div>
              {c.description && c.description !== "—" && <div className="mb-1.5 text-[11.5px] text-[#616161]">{c.description}</div>}
              {c.attributes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.attributes.map((a) => (
                    <span key={a.label} className="rounded-[6px] bg-[#F5F9EA] px-2 py-0.5 text-[10.5px] text-[#424242]">
                      <span className="font-semibold text-[#9E9E9E]">{a.label}:</span> {a.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
