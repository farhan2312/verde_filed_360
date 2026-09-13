"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { prepareCampaignWhatsApp, sendCampaignWhatsApp, type CampaignMemberVM, type WaPrepared } from "@/app/actions/campaigns";

/** "Send WhatsApp" button + popup (Meta Cloud API): pick the campaign's comm plan → auto-fill from
 *  farmer data → flag missing bits → edit → send → success → (in Focus mode) advance to next.
 *  Separate from the wa.me click-to-chat link, which stays for manual chats. Admin-gated by the parent. */
export function WaSender({
  member, commPlans, templates, onChange, onSent, big,
}: {
  member: CampaignMemberVM;
  commPlans: string[];
  templates: { id: number; name: string }[];
  onChange: (m: CampaignMemberVM) => void;
  onSent?: () => void;
  big?: boolean;
}) {
  const available = templates.filter((t) => commPlans.includes(t.name));
  const [open, setOpen] = useState(false);
  const [tplId, setTplId] = useState<number | null>(null);
  const [prep, setPrep] = useState<WaPrepared | null>(null);
  const [message, setMessage] = useState("");
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [sentOk, setSentOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const select = (id: number) => {
    setTplId(id); setPrep(null); setError(null); setMessage("");
    startLoad(async () => {
      const r = await prepareCampaignWhatsApp({ memberId: member.id, commTemplateId: id });
      if (!r.ok) { setError(r.error ?? "Could not load the message."); return; }
      setPrep(r); setMessage(r.message ?? "");
    });
  };

  useEffect(() => {
    if (!open) { setTplId(null); setPrep(null); setMessage(""); setSentOk(false); setError(null); return; }
    if (available.length === 1) select(available[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = () => {
    if (!message.trim()) { setError("Message is empty."); return; }
    setError(null);
    startSend(async () => {
      const r = await sendCampaignWhatsApp({ memberId: member.id, commTemplateId: tplId, message });
      if (!r.ok) { setError(r.error ?? "Send failed."); return; }
      setSentOk(true);
      onChange({ ...member, reached: true, mediums: member.mediums.includes("WHATSAPP") ? member.mediums : [...member.mediums.filter((m) => m !== "UNREACHABLE"), "WHATSAPP"], reachedAt: new Date().toISOString() });
      setTimeout(() => { setOpen(false); onSent?.(); }, 2000);
    });
  };

  const hasMobile = !!member.mobile;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`rounded-[10px] bg-[#0B8A3D] font-bold text-white ${big ? "px-5 py-3 text-[14px]" : "px-4 py-2.5 text-[13px]"}`}>
        ⚡ WA API
      </button>

      <Modal open={open} onClose={() => setOpen(false)} className="max-w-[560px]">
        <ModalHeader eyebrow="Send WhatsApp" eyebrowColor="#0B8A3D" title={member.name} onClose={() => setOpen(false)} />
        <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
          {available.length === 0 ? (
            <div className="rounded-[10px] bg-[#FEF6E9] px-4 py-3 text-[13px] text-[#8D6E00]">
              No comm plan is tagged to this campaign. Tag one in the campaign, or add it in the Comm Plan tab.
            </div>
          ) : sentOk ? (
            <div className="rounded-[12px] bg-[#F5F9EA] px-4 py-8 text-center">
              <div className="text-[34px]">✅</div>
              <div className="mt-1 text-[15px] font-bold text-[#66852A]">WhatsApp sent</div>
              <div className="mt-1 text-[12.5px] text-[#4C6B50]">{onSent ? "Moving to the next farmer…" : "Marked as reached by WhatsApp."}</div>
            </div>
          ) : (
            <>
              {available.length > 1 && (
                <div className="mb-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Comm plan</label>
                  <select value={tplId ?? ""} onChange={(e) => e.target.value && select(Number(e.target.value))}
                    className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-[#0B8A3D]">
                    <option value="">Select a comm plan…</option>
                    {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {loading && <div className="py-6 text-center text-[13px] text-[#9E9E9E]">Preparing message…</div>}

              {prep && (
                <>
                  {!hasMobile && <div className="mb-2 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">No phone number on file for this farmer.</div>}
                  {prep.missing && prep.missing.length > 0 && (
                    <div className="mb-2 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] text-[#C62828]">
                      <b>Missing data</b> — please fill in the message: {prep.missing.join(", ")}. (The <span className="font-mono">[slots]</span> are still in the text below.)
                    </div>
                  )}
                  {!prep.waReady && <div className="mb-2 rounded-[8px] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">WhatsApp not configured yet (set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID). Sending will fail until then.</div>}
                  {prep.waReady && !prep.hasTemplate && <div className="mb-2 rounded-[8px] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">This comm plan has no WhatsApp template — it will send as plain text, which Meta only delivers to numbers that messaged you in the last 24h or your test numbers. Add an approved template name in the Comm Plan tab for cold outreach.</div>}

                  <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Message {prep.mobile ? `· to ${prep.mobile}` : ""}</label>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6}
                    className="mt-1 w-full resize-y rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13.5px] leading-relaxed outline-none focus:border-[#0B8A3D]" />
                  <div className="mt-1 text-right text-[11px] text-[#9E9E9E]">{message.length} chars</div>

                  {error && <div className="mt-1 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{error}</div>}

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setOpen(false)} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Cancel</button>
                    <button type="button" onClick={send} disabled={sending || !hasMobile || !message.trim()}
                      className="rounded-[10px] bg-[#0B8A3D] px-5 py-2 text-[12.5px] font-bold text-white hover:bg-[#0A6E31] disabled:opacity-50">
                      {sending ? "Sending…" : "Send WhatsApp"}
                    </button>
                  </div>
                </>
              )}

              {error && !prep && <div className="mt-2 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{error}</div>}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
