import type { CropHistoryEntry } from "./types";

/** Crop history from field visits — one entry per visit, newest first, flagging where the
 *  primary crop changed from the previous visit (e.g. Potato → Paddy). */
export function CropHistoryCard({ history }: { history: CropHistoryEntry[] }) {
  return (
    <div className="rounded-[14px] border border-black/[0.03] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[15px] font-bold text-[#1A1C1A]">Crop History</h3>
        <span className="text-[11px] text-[#9E9E9E]">Primary crop recorded on each visit</span>
      </div>

      {history.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[#9E9E9E]">No crop recorded on a visit yet.</div>
      ) : (
        <ol className="mt-3">
          {history.map((e, i) => (
            <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* timeline rail */}
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${e.changedFrom ? "bg-[#F2A72C]" : "bg-[#678722]"}`} />
                {i < history.length - 1 && <span className="mt-1 w-px flex-1 bg-[#EAEAEA]" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[14px] font-bold text-[#1A1C1A]">{e.primary || "—"}</span>
                  {e.season && (
                    <span className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[10px] font-semibold text-[#678722]">{e.season}</span>
                  )}
                  {e.changedFrom && (
                    <span className="rounded-full bg-[#FFF3E0] px-2 py-0.5 text-[10px] font-bold text-[#E65100]">
                      Changed from {e.changedFrom}
                    </span>
                  )}
                </div>
                {e.others.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {e.others.map((c) => (
                      <span key={c} className="rounded-full bg-[#F1F5F0] px-2 py-0.5 text-[10.5px] text-[#557055]">{c}</span>
                    ))}
                  </div>
                )}
                <div className="mt-1 text-[11px] text-[#9E9E9E]">
                  {e.date || "—"}{e.by ? ` · ${e.by}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
