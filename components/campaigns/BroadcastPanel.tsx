"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import type { CommTemplateVM } from "./CampaignsScreen";
import {
  getBroadcastAudience, createBroadcast, runBroadcastBatch, cancelBroadcast, getBroadcastPreview,
  type Channel, type BroadcastAudience, type BroadcastPreviewRow,
} from "@/app/actions/broadcasts";
import { smsBalance } from "@/app/actions/test-messaging";
import type { SmsBalance } from "@/lib/zapsms";

const n = (x: number) => x.toLocaleString("en-IN");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Admin mass-send: pick channel + comm plan, see the TEST-group audience (WhatsApp = opted-in only,
 * enforced), then send in client-driven batches with live progress + resume. Handles 1k–10k.
 */
export function BroadcastPanel({ campaignId, campaignName, commPlans, templates, onClose }: {
  campaignId: number; campaignName: string; commPlans: string[]; templates: CommTemplateVM[]; onClose: () => void;
}) {
  const [channel, setChannel] = useState<Channel>("SMS");
  const [aud, setAud] = useState<BroadcastAudience | null>(null);
  const [tplId, setTplId] = useState<number | null>(null);
  const [skipContacted, setSkipContacted] = useState(false);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [prog, setProg] = useState({ sent: 0, failed: 0, total: 0, remaining: 0 });
  const [err, setErr] = useState<string | null>(null);
  const bidRef = useRef<number | null>(null);
  const stopRef = useRef(false);

  // Plans tagged to this campaign; for WhatsApp, only those that carry a WA template.
  const plans = templates.filter((t) => commPlans.includes(t.name) && (channel === "SMS" || !!t.waTemplateName));
  const accent = channel === "WHATSAPP" ? "#0B8A3D" : "#6A1B9A";
  const selectedPlan = plans.find((t) => t.id === tplId) ?? null;

  const [bal, setBal] = useState<SmsBalance | null>(null);
  const [preview, setPreview] = useState<BroadcastPreviewRow[] | null>(null);
  useEffect(() => { setTplId(null); setAud(null); getBroadcastAudience(campaignId, channel).then(setAud); }, [campaignId, channel]);
  // SMS credit balance — to warn before a mass send burns through more credits than the account has.
  useEffect(() => { setBal(null); if (channel === "SMS") smsBalance().then((r) => setBal(r.ok && r.balance ? r.balance : null)); }, [channel]);
  // Sample of exactly what will be sent (real farmers, variables filled).
  useEffect(() => {
    setPreview(null);
    if (tplId == null) return;
    getBroadcastPreview({ campaignId, channel, commTemplateId: tplId, limit: 3 }).then((r) => setPreview(r.ok ? r.rows : []));
  }, [campaignId, channel, tplId]);

  const ready = channel === "WHATSAPP" ? aud?.waReady : aud?.smsReady;
  const eligible = aud ? (channel === "WHATSAPP" ? aud.optedIn : aud.withMobile) - (skipContacted ? aud.alreadyContacted : 0) : 0;

  const [starting, setStarting] = useState(false);
  const start = async () => {
    if (tplId == null) { setErr("Pick a comm plan / template."); return; }
    setErr(null); stopRef.current = false; setStarting(true);
    // Wrap the whole run: a thrown server error used to vanish silently ("nothing happened, no code").
    try {
      const c = await createBroadcast({ campaignId, channel, commTemplateId: tplId, skipContacted });
      if (!c.ok || c.broadcastId == null) { setErr(c.error ?? "Could not start the broadcast."); setStarting(false); return; }
      bidRef.current = c.broadcastId;
      setPhase("running"); setStarting(false); setProg({ sent: 0, failed: 0, total: c.total ?? 0, remaining: c.total ?? 0 });
      for (;;) {
        if (stopRef.current) break;
        const r = await runBroadcastBatch({ broadcastId: c.broadcastId, limit: 40 });
        if (!r.ok) { setErr(r.error ?? "Send error mid-run."); break; }
        setProg({ sent: r.sent, failed: r.failed, total: r.total, remaining: r.remaining });
        if (r.done) break;
        await sleep(1200); // pace to respect gateway rate limits
      }
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The send failed to start (server error).");
      setStarting(false); setPhase("setup");
    }
  };

  const stop = async () => { stopRef.current = true; if (bidRef.current) await cancelBroadcast(bidRef.current); };

  const pct = prog.total ? Math.round(((prog.sent + prog.failed) / prog.total) * 100) : 0;
  const cell = "rounded-[10px] bg-[#F5F7F5] px-3 py-2";

  return (
    <Modal open onClose={phase === "running" ? () => {} : onClose} className="max-w-[560px]">
      <ModalHeader eyebrow="Mass send" eyebrowColor={accent} title={campaignName}
        subtitle="Test group only · WhatsApp goes to opted-in farmers only" onClose={phase === "running" ? () => {} : onClose} />
      <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
        {phase === "setup" && (
          <>
            {/* Channel */}
            <div className="mb-3 inline-flex rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
              {(["SMS", "WHATSAPP"] as Channel[]).map((c) => (
                <button key={c} type="button" onClick={() => setChannel(c)}
                  className="rounded-[8px] px-4 py-1.5 text-[12.5px] font-bold transition-colors"
                  style={{ background: channel === c ? "#fff" : "transparent", color: channel === c ? accent : "#9E9E9E", boxShadow: channel === c ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                  {c === "SMS" ? "✉ SMS" : "⚡ WhatsApp"}
                </button>
              ))}
            </div>

            {!ready && <div className="mb-3 rounded-[8px] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">{channel === "WHATSAPP" ? "WhatsApp" : "SMS gateway"} not configured — set the env vars, then restart.</div>}

            {/* Comm plan */}
            <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Comm plan / template</label>
            <select value={tplId ?? ""} onChange={(e) => setTplId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2.5 text-[13px] outline-none">
              <option value="">Select…</option>
              {plans.map((t) => <option key={t.id} value={t.id}>{t.name}{channel === "WHATSAPP" && t.waTemplateName ? ` · ${t.waTemplateName}` : ""}</option>)}
            </select>
            {plans.length === 0 && (
              <div className="mt-1 text-[11.5px] text-[#C62828]">
                {channel === "WHATSAPP" ? "No comm plan tagged to this campaign has a WhatsApp template — set one (approved) in the Comm Plan tab." : "No comm plan is tagged to this campaign."}
              </div>
            )}

            {/* Audience */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
              <div className={cell}><div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Test group</div><div className="text-[16px] font-bold text-[#1A1C1A]">{aud ? n(aud.total) : "…"}</div></div>
              <div className={cell}><div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Valid mobile</div><div className="text-[16px] font-bold text-[#1A1C1A]">{aud ? n(aud.withMobile) : "…"}</div></div>
              <div className={cell}><div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Opted-in</div><div className="text-[16px] font-bold text-[#0B8A3D]">{aud ? n(aud.optedIn) : "…"}</div></div>
              <div className={cell} style={{ background: "#F3F8E6" }}><div className="text-[10px] font-bold uppercase text-[#678722]">Will send</div><div className="text-[16px] font-bold text-[#678722]">{aud ? n(Math.max(0, eligible)) : "…"}</div></div>
            </div>

            {/* Skipped — invalid or missing number (never sent) */}
            {aud && (aud.invalidMobile > 0 || aud.noMobile > 0) && (
              <div className="mt-2 text-[11.5px] text-[#EF6C00]">
                ⚠ {n(aud.invalidMobile + aud.noMobile)} skipped —{aud.invalidMobile ? ` ${n(aud.invalidMobile)} invalid number` : ""}{aud.invalidMobile && aud.noMobile ? "," : ""}{aud.noMobile ? ` ${n(aud.noMobile)} no number on file` : ""}.
              </div>
            )}

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-[#424242]">
              <input type="checkbox" checked={skipContacted} onChange={(e) => setSkipContacted(e.target.checked)} />
              Skip farmers already contacted on {channel === "WHATSAPP" ? "WhatsApp" : "SMS"} ({aud ? n(aud.alreadyContacted) : 0})
            </label>

            {channel === "WHATSAPP" && (
              <div className="mt-3 rounded-[8px] bg-[#F3F8E6] px-3 py-2 text-[11.5px] text-[#678722]">WhatsApp sends only to <b>opted-in</b> farmers with an <b>approved</b> template — this protects your number's quality rating.</div>
            )}
            {channel === "SMS" && bal && (
              // Credit-count accounts: 1 credit ≈ 1 SMS, so we can warn on shortfall. Rupee-wallet accounts
              // (currency set) cost a fraction of a rupee per SMS — just show the balance, no false alarm.
              !bal.currency && bal.total < Math.max(0, eligible) ? (
                <div className="mt-3 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[11.5px] font-semibold text-[#C62828]">
                  ⚠ Only {n(bal.total)} SMS credits left — this send needs ~{n(Math.max(0, eligible))}. Top up, or it will stop partway.
                </div>
              ) : (
                <div className="mt-3 text-[11.5px] text-[#9E9E9E]">
                  💳 {bal.currency ? `${bal.currency}${bal.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} balance` : `${n(bal.total)} SMS credits`} available.
                </div>
              )
            )}
            {/* The comm plan + exactly how it will look per farmer */}
            {selectedPlan && (
              <div className="mt-4 rounded-[10px] border border-[#EEE] bg-[#FCFCFD] p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Comm plan · {selectedPlan.name}</span>
                  <span className="text-[10px] font-semibold text-[#9E9E9E]">{channel === "WHATSAPP" ? (selectedPlan.waTemplateName ? `WA: ${selectedPlan.waTemplateName}` : "") : (selectedPlan.dltTemplateId ? `DLT ${selectedPlan.dltTemplateId}` : "")}</span>
                </div>
                <div className="rounded-[8px] bg-white px-3 py-2 text-[12.5px] leading-relaxed text-[#616161] ring-1 ring-[#F0F0F0]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{selectedPlan.template || "—"}</div>

                <div className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">How it will look when sent</div>
                {preview == null ? <div className="mt-1 text-[11.5px] text-[#9E9E9E]">Loading sample…</div>
                  : preview.length === 0 ? <div className="mt-1 text-[11.5px] text-[#BDBDBD]">No sample recipients.</div>
                  : (
                    <div className="mt-1 flex flex-col gap-1.5">
                      {preview.map((r, i) => (
                        <div key={i} className="rounded-[8px] bg-[#F5F7F5] px-3 py-2 text-[12.5px] leading-relaxed text-[#1A1C1A]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>
                          <div className="mb-0.5 text-[10.5px] font-semibold text-[#9E9E9E]">{r.name} · {r.mobile}</div>
                          {r.message}
                        </div>
                      ))}
                      <div className="text-[11px] text-[#9E9E9E]">Sample of {preview.length} — every farmer gets their own name in place of the variable.</div>
                    </div>
                  )}
              </div>
            )}

            {err && <div className="mt-2 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Cancel</button>
              <button type="button" onClick={start} disabled={!ready || tplId == null || eligible <= 0 || starting}
                className="rounded-[10px] px-5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
                {starting ? "Starting…" : `Send to ${aud ? n(Math.max(0, eligible)) : "…"} farmers`}
              </button>
            </div>
          </>
        )}

        {phase !== "setup" && (
          <>
            <div className="mb-2 flex items-center justify-between text-[12.5px]">
              <span className="font-semibold text-[#1A1C1A]">{phase === "done" ? (stopRef.current ? "Stopped" : "Done") : "Sending…"}</span>
              <span className="text-[#9E9E9E]">{n(prog.sent + prog.failed)} / {n(prog.total)} ({pct}%)</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#EEE]"><div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} /></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <div className={cell}><div className="text-[10px] font-bold uppercase text-[#678722]">Sent</div><div className="text-[16px] font-bold text-[#678722]">{n(prog.sent)}</div></div>
              <div className={cell}><div className="text-[10px] font-bold uppercase text-[#C62828]">Failed</div><div className="text-[16px] font-bold text-[#C62828]">{n(prog.failed)}</div></div>
              <div className={cell}><div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Remaining</div><div className="text-[16px] font-bold text-[#1A1C1A]">{n(prog.remaining)}</div></div>
            </div>
            {err && <div className="mt-2 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}
            <div className="mt-4 flex justify-end gap-2">
              {phase === "running"
                ? <button type="button" onClick={stop} className="rounded-[10px] border border-[#C62828] px-4 py-2 text-[12.5px] font-semibold text-[#C62828] hover:bg-[#FDECEA]">Stop</button>
                : <button type="button" onClick={onClose} className="rounded-[10px] px-5 py-2 text-[12.5px] font-bold text-white" style={{ background: accent }}>Close</button>}
            </div>
            {phase === "done" && <p className="mt-2 text-[11.5px] text-[#9E9E9E]">Delivery logs are in the SMS/WhatsApp audit. You can re-open Mass send to continue an interrupted run.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
