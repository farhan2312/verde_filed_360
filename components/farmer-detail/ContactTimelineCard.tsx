import type { ContactEvent } from "@/lib/farmer-360";

const CARD = "rounded-[14px] border border-black/[0.03] bg-white p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

const KIND_STYLE = (kind: string): { bg: string; c: string } => {
  if (kind.includes("WhatsApp")) return { bg: "#E9F2CF", c: "#5C7D22" };
  if (kind.includes("SMS")) return { bg: "#E3F2FD", c: "#1565C0" };
  if (kind.includes("Unreachable")) return { bg: "#FDECEA", c: "#C62828" };
  if (kind.includes("Call")) return { bg: "#FDF1DC", c: "#B9741A" };
  if (kind.includes("In-person")) return { bg: "#F3E5F5", c: "#6A1B9A" };
  return { bg: "#F5F5F5", c: "#616161" };
};
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Campaign contact timeline — when the farmer was contacted, how, what was conveyed, and by whom. */
export function ContactTimelineCard({ events }: { events: ContactEvent[] }) {
  return (
    <div className={CARD}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px] font-bold text-[#1A1C1A]">📣 Campaign contact timeline</span>
        {events.length > 0 && <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[11px] font-bold text-[#7DA02E]">{events.length}</span>}
      </div>
      <div className="mb-4 text-[12px] text-[#9E9E9E]">Every campaign touch — SMS, WhatsApp, calls and in-person — what was conveyed, by which Verde Agrotech employee, and when.</div>

      {events.length === 0 ? (
        <div className="rounded-[10px] bg-[#FAFBFA] px-3 py-6 text-center text-[12.5px] text-[#9E9E9E]">No campaign contacts recorded yet.</div>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-[10px] border border-[#F0F0F0]">
          <table className="w-full min-w-[680px] text-left text-[12px]">
            <thead className="sticky top-0 bg-[#FAFAFA]">
              <tr className="border-b border-[#EEE] text-[10px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">
                <th className="px-3 py-2">When (IST)</th><th>Channel</th><th>What was conveyed</th><th>Outcome</th><th>By</th><th>Campaign</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => {
                const st = KIND_STYLE(e.kind);
                return (
                  <tr key={i} className="border-b border-[#F5F5F5] last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-[#616161]">{fmt(e.at)}</td>
                    <td className="py-2"><span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.c }}>{e.kind}</span></td>
                    <td className="max-w-[300px] py-2 text-[#424242]">{e.detail || "—"}</td>
                    <td className="whitespace-nowrap py-2 text-[#616161]">{e.status || "—"}</td>
                    <td className="whitespace-nowrap py-2 text-[#616161]">{e.by || "—"}</td>
                    <td className="max-w-[140px] truncate py-2 text-[#9E9E9E]" title={e.campaign}>{e.campaign}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
