"use client";

import { useEffect, useState } from "react";
import { getRecentWhatsAppLogs, type WaLogRow } from "@/app/actions/test-messaging";

/**
 * Recent WhatsApp delivery status — a standalone panel so it can sit in the right column of the
 * WhatsApp settings tab (visible without scrolling). `signal` bumps after a send to refetch (Meta's
 * status webhook lands a few seconds later, so it also refetches once after a short delay).
 */
export function WaDeliveryStatus({ signal = 0 }: { signal?: number }) {
  const [logs, setLogs] = useState<WaLogRow[] | null>(null);
  const refresh = () => getRecentWhatsAppLogs(10).then(setLogs);

  useEffect(() => {
    refresh();
    if (signal > 0) { const t = setTimeout(refresh, 4000); return () => clearTimeout(t); }
  }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl border border-black/[0.03] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:sticky lg:top-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-bold text-[#1A1C1A]">Recent WhatsApp delivery status</span>
        <button type="button" onClick={refresh} className="text-[11.5px] font-semibold text-[#0B8A3D] hover:underline">↻ Refresh</button>
      </div>
      {logs == null ? <div className="text-[11.5px] text-[#9E9E9E]">Loading…</div>
        : logs.length === 0 ? <div className="text-[11.5px] text-[#BDBDBD]">No WhatsApp sends yet.</div>
        : (
          <div className="flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto">
            {logs.map((l) => {
              const st = (l.status ?? (l.ok ? "SENT" : "FAILED")).toUpperCase();
              const failed = st.includes("FAIL") || !l.ok;
              const delivered = st === "DELIVERED" || st === "READ" || !!l.deliveredAt;
              const color = failed ? "#C62828" : delivered ? "#678722" : "#E65100";
              const bg = failed ? "#FDECEA" : delivered ? "#F3F8E6" : "#FFF3E0";
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[#EEE] px-2.5 py-1.5 text-[11.5px]">
                  <span className="font-mono text-[#616161]">{l.mobile}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: bg, color }}>{st}</span>
                  <span className="text-[#9E9E9E]">{new Date(l.createdAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                  {failed && l.error && <span className="text-[#C62828]">{l.error}</span>}
                </div>
              );
            })}
          </div>
        )}
      <div className="mt-1.5 text-[11px] text-[#9E9E9E]">Status updates need the webhook subscribed to <b>messages</b> in Meta. FAILED rows show Meta&apos;s error code.</div>
    </div>
  );
}
