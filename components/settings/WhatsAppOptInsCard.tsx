"use client";

import { useState, useTransition } from "react";
import { listOptIns, generateOptInQr, saveOptInQrConfig, exportOptInsXlsx, type OptInRow } from "@/app/actions/whatsapp-optins";
import { downloadB64 } from "@/lib/download";

const DEFAULT_MSG = "Hi Verde Agrotech, I'd like to receive product updates & offers on WhatsApp.";
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
/** Show the full international number (waId) with a leading +; fall back to the 10-digit key. */
const fmtPhone = (r: { waId: string | null; mobile: string }) => {
  const full = (r.waId ?? "").replace(/\D/g, "");
  return full ? `+${full}` : r.mobile;
};

/**
 * Settings → WhatsApp opt-ins. Two halves:
 *  • QR generator — build a click-to-chat link + QR for a poster; scanning it opens a chat to your
 *    number with the opt-in message pre-filled. When they send it, the inbound webhook records them.
 *  • Opt-ins list — everyone captured by the webhook (marketable, opted-in contacts).
 */
export function WhatsAppOptInsCard({ initial, qrConfig }: { initial: { total: number; rows: OptInRow[] }; qrConfig: { number: string; message: string } }) {
  // QR generator state — prefilled from the saved visit-form config.
  const [num, setNum] = useState(qrConfig.number || "");
  const [msg, setMsg] = useState(qrConfig.message || DEFAULT_MSG);
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [qrErr, setQrErr] = useState<string | null>(null);
  const [gen, startGen] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [savingCfg, startSaveCfg] = useTransition();

  // Opt-ins list state
  const [rows, setRows] = useState(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [q, setQ] = useState("");
  const [loading, startLoad] = useTransition();

  const makeQr = () => {
    setQrErr(null);
    startGen(async () => {
      const r = await generateOptInQr({ businessNumber: num, message: msg });
      if (!r.ok) { setQrErr(r.error ?? "Failed."); setQr(""); setLink(""); return; }
      setLink(r.link ?? ""); setQr(r.qr ?? "");
    });
  };
  const refresh = (term = q) => startLoad(async () => { const r = await listOptIns(term); setRows(r.rows); setTotal(r.total); });
  const [exporting, startExport] = useTransition();
  const exportXlsx = () => startExport(async () => { const r = await exportOptInsXlsx(q); if (r.ok && r.b64 && r.filename) downloadB64(r.b64, r.filename); });
  const saveForVisitForm = () => {
    setSaved(null); setQrErr(null);
    startSaveCfg(async () => {
      const r = await saveOptInQrConfig({ number: num, message: msg });
      if (!r.ok) { setQrErr(r.error ?? "Save failed."); return; }
      setSaved(num.trim() ? "Saved — this QR now shows on the visit form's last page." : "Cleared — the visit form will not show a QR.");
    });
  };

  const inputCls = "w-full rounded-[10px] border border-[#E0E0E0] px-3 py-2.5 text-[13px] outline-none focus:border-[#0B8A3D]";

  return (
    <div className="rounded-2xl border border-black/[0.03] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px] font-bold text-[#1A1C1A]">WhatsApp opt-ins</span>
        <span className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[10.5px] font-bold text-[#0B8A3D]">{total} opted in</span>
      </div>
      <p className="mb-4 text-[12px] text-[#9E9E9E]">Print the QR on posters/bills. When a customer scans it and sends the message, they’re captured here as an opted-in contact you can market to.</p>

      {/* QR generator */}
      <div className="rounded-[12px] border border-[#ECEFEC] bg-[#FAFBFA] p-4">
        <div className="mb-2.5 text-[12px] font-bold text-[#3A3A3A]">Opt-in QR generator</div>
        <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Business WhatsApp number</label>
        <input className={`${inputCls} mt-1`} inputMode="numeric" placeholder="e.g. 917068655546 (country code + number)"
          value={num} onChange={(e) => setNum(e.target.value)} />
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Opt-in message (what the customer sends)</label>
        <textarea className={`${inputCls} mt-1 resize-y`} rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={makeQr} disabled={gen}
            className="rounded-[10px] bg-[#0B8A3D] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#0A6E31] disabled:opacity-50">
            {gen ? "Generating…" : "Generate QR + link"}</button>
          <button type="button" onClick={saveForVisitForm} disabled={savingCfg}
            className="rounded-[10px] border border-[#0B8A3D] px-4 py-2 text-[13px] font-bold text-[#0B8A3D] hover:bg-[#F3F8E6] disabled:opacity-50"
            title="Show this exact QR on the last page of the New Visit form so officers can get farmers to opt in during a visit">
            {savingCfg ? "Saving…" : "★ Use on visit form"}</button>
        </div>
        {saved && <div className="mt-2 rounded-[8px] bg-[#F3F8E6] px-3 py-2 text-[12px] font-semibold text-[#678722]">{saved}</div>}
        {qrErr && <div className="mt-2 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{qrErr}</div>}

        {qr && (
          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="WhatsApp opt-in QR" className="h-40 w-40 rounded-[10px] border border-[#E0E0E0] bg-white p-1" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Click-to-chat link</div>
              <div className="break-all rounded-[8px] bg-white px-2.5 py-2 font-mono text-[11.5px] text-[#424242] ring-1 ring-[#EEE]">{link}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={qr} download="verde-whatsapp-optin-qr.png"
                  className="rounded-[8px] border border-[#0B8A3D] px-3 py-1.5 text-[12px] font-semibold text-[#0B8A3D] hover:bg-[#F3F8E6]">⬇ Download QR (PNG)</a>
                <button type="button" onClick={() => navigator.clipboard?.writeText(link)}
                  className="rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Copy link</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Opt-ins list */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] font-bold text-[#3A3A3A]">Captured opt-ins <span className="font-normal text-[#9E9E9E]">· {rows.length}{rows.length !== total ? ` of ${total}` : ""}</span></div>
        <div className="flex items-center gap-2">
          <input className="w-[150px] rounded-[8px] border border-[#E0E0E0] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#0B8A3D]"
            placeholder="Search name / number" value={q}
            onChange={(e) => { setQ(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") refresh(); }} />
          <button type="button" onClick={() => refresh()} disabled={loading}
            className="rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-semibold text-[#616161] hover:bg-[#F5F5F5] disabled:opacity-50">{loading ? "…" : "Refresh"}</button>
          <button type="button" onClick={exportXlsx} disabled={exporting || rows.length === 0}
            className="rounded-[8px] border border-[#0B8A3D] px-3 py-1.5 text-[12px] font-semibold text-[#0B8A3D] hover:bg-[#F3F8E6] disabled:opacity-50">{exporting ? "…" : "⬇ Excel"}</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-[10px] bg-[#FAFBFA] px-3 py-6 text-center text-[12.5px] text-[#9E9E9E]">No opt-ins yet. Once the webhook is live and someone scans the QR + sends the message, they appear here.</div>
      ) : (
        <div className="mt-2 max-h-[560px] overflow-y-auto rounded-[10px] border border-[#F0F0F0]">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-[#FAFAFA]">
              <tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]">
                <th className="px-3 py-2">Number</th><th className="py-2">Name</th><th className="py-2">Type</th><th className="py-2">Last message</th><th className="py-2 text-right pr-3">Opted in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#F6F6F6]">
                  <td className="px-3 py-2 font-mono font-semibold text-[#1A1C1A]">{fmtPhone(r)}</td>
                  <td className="py-2 text-[#424242]">{r.farmerName || r.name || "—"}</td>
                  <td className="py-2">
                    {r.farmerId
                      ? <span className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[10px] font-bold text-[#678722]">✓ Registered farmer</span>
                      : <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-bold text-[#9E9E9E]">Not registered farmer</span>}
                  </td>
                  <td className="py-2 text-[#9E9E9E]"><span className="line-clamp-1">{r.lastMessage || "—"}</span></td>
                  <td className="py-2 pr-3 text-right text-[#616161]">{fmt(r.optInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
