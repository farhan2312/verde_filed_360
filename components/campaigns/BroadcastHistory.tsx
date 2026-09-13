"use client";

import { useEffect, useState, useTransition } from "react";
import { listBroadcasts, syncBroadcastDelivery, type BroadcastVM } from "@/app/actions/broadcasts";

const n = (x: number) => x.toLocaleString("en-IN");
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }); };
const STATUS: Record<string, { bg: string; c: string; label: string }> = {
  running: { bg: "#FEF6E9", c: "#8D6E00", label: "Running" },
  done: { bg: "#F3F8E6", c: "#678722", label: "Done" },
  canceled: { bg: "#FDECEA", c: "#C62828", label: "Stopped" },
};

/** Past mass-sends for a campaign (admin-only). `reloadKey` bumps to refetch after a broadcast finishes. */
export function BroadcastHistory({ campaignId, reloadKey = 0, defaultOpen = false }: { campaignId: number; reloadKey?: number; defaultOpen?: boolean }) {
  const [rows, setRows] = useState<BroadcastVM[] | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [loading, start] = useTransition();

  const load = () => start(async () => setRows(await listBroadcasts(campaignId)));
  useEffect(() => { if (open) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, campaignId, reloadKey]);

  const [syncId, setSyncId] = useState<number | null>(null);
  const [syncMsg, setSyncMsg] = useState<Record<number, string>>({});
  const syncOne = (id: number) => {
    setSyncId(id);
    syncBroadcastDelivery(id).then((r) => {
      setSyncMsg((m) => ({ ...m, [id]: r.ok ? `${r.delivered} newly delivered` : (r.error ?? "failed") }));
      setSyncId(null);
    });
  };

  return (
    <div className="mb-3 rounded-[12px] border border-[#F0F0F0]">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left">
        <span className="text-[12.5px] font-bold text-[#3A3A3A]">📣 Broadcast history{rows ? ` (${rows.length})` : ""}</span>
        <span className="text-[11px] text-[#9E9E9E]">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && (
        <div className="border-t border-[#F0F0F0] px-3.5 py-3">
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={load} disabled={loading}
              className="rounded-[8px] border border-[#E0E0E0] px-2.5 py-1 text-[11.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5] disabled:opacity-50">{loading ? "…" : "Refresh"}</button>
          </div>
          {rows == null ? (
            <div className="py-4 text-center text-[12px] text-[#9E9E9E]">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-[#9E9E9E]">No mass-sends yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[12px]">
                <thead><tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]">
                  <th className="py-1.5">When</th><th>Channel</th><th>Template</th><th className="text-right">Sent</th><th className="text-right">Failed</th><th className="text-right">Left</th><th>Status</th><th>By</th><th>Delivery</th>
                </tr></thead>
                <tbody>
                  {rows.map((b) => {
                    const st = STATUS[b.status] ?? { bg: "#F5F5F5", c: "#616161", label: b.status };
                    return (
                      <tr key={b.id} className="border-b border-[#F6F6F6]">
                        <td className="py-1.5 text-[#616161]">{fmt(b.createdAt)}</td>
                        <td><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: b.channel === "WHATSAPP" ? "#F3F8E6" : "#F3E5F5", color: b.channel === "WHATSAPP" ? "#0B8A3D" : "#6A1B9A" }}>{b.channel === "WHATSAPP" ? "WhatsApp" : "SMS"}</span></td>
                        <td className="max-w-[200px] truncate text-[#424242]" title={b.templateLabel}>{b.templateLabel || "—"}</td>
                        <td className="text-right font-semibold text-[#678722]">{n(b.sent)}</td>
                        <td className="text-right text-[#C62828]">{n(b.failed)}</td>
                        <td className="text-right text-[#9E9E9E]">{n(b.remaining)}</td>
                        <td><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.c }}>{st.label}</span></td>
                        <td className="text-[#616161]">{b.createdBy || "—"}</td>
                        <td className="whitespace-nowrap">
                          <button type="button" onClick={() => syncOne(b.id)} disabled={syncId === b.id}
                            className="rounded-[8px] border border-[#CE93D8] px-2 py-0.5 text-[11px] font-semibold text-[#6A1B9A] hover:bg-[#F3E5F5] disabled:opacity-50">
                            {syncId === b.id ? "Syncing…" : "↻ Delivery"}</button>
                          {syncMsg[b.id] && <span className="ml-1.5 text-[10.5px] text-[#6A1B9A]">{syncMsg[b.id]}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
