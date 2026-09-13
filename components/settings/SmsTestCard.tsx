"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchFarmersForAction } from "@/app/actions/action-registry";
import { sendTestSms, sendTestWhatsApp, getRecentSmsLogs, refreshSmsDeliveryStatus, smsBalance, type SmsLogRow } from "@/app/actions/test-messaging";
import { getSmsTemplates, type SmsTemplateVM } from "@/app/actions/campaigns";
import { countDltVars } from "@/lib/campaign-vars";

// Fill a DLT body by dropping each input value into its {#var#} position (fixed text stays intact).
const fillDltValues = (body: string, values: string[]) => { let i = 0; return body.replace(/\{#var#\}/gi, () => values[i++] ?? ""); };
import type { SmsBalance } from "@/lib/zapsms";
import { fillPreview } from "@/lib/wa-template-presets";
import type { FarmerPick } from "@/lib/action-constants";

type WaTemplateOpt = { name: string; language: string; body: string; varCount: number };
type Channel = "sms" | "whatsapp";

/**
 * Settings → Test messaging bench. Pick a farmer (search) or type any number, compose a message
 * (free text, optionally loaded from a saved Comm Plan), and fire one SMS (ZapSMS) or WhatsApp
 * (Meta Cloud API). Admin-only (Settings is sysadmin); every send is logged.
 */
export function SmsTestCard({ smsReady, missing, senderId, waReady, waMissing, waTemplates = [], only, onSent }: {
  smsReady: boolean; missing: string[]; senderId: string;
  waReady: boolean; waMissing: string[]; waTemplates?: WaTemplateOpt[];
  only?: Channel; // lock to one channel + hide the toggle (SMS tab / WhatsApp tab)
  onSent?: () => void; // fired after a WhatsApp send so a sibling delivery-status panel can refresh
}) {
  const [channel, setChannel] = useState<Channel>(only ?? "sms");
  const [tplName, setTplName] = useState<string>("");
  const [tplParams, setTplParams] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FarmerPick[]>([]);
  const [picked, setPicked] = useState<FarmerPick | null>(null);
  const [mobile, setMobile] = useState("");
  const [dltId, setDltId] = useState<string>(""); // selected approved DLT template id (SMS)
  const [smsParams, setSmsParams] = useState<string[]>([]); // one value per {#var#} in the DLT template
  const [sending, startSend] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const lastQ = useRef("");

  const isWa = channel === "whatsapp";
  const ready = isWa ? waReady : smsReady;
  const miss = isWa ? waMissing : missing;
  const accent = isWa ? "#0B8A3D" : "#6A1B9A";

  // Debounced farmer search.
  useEffect(() => {
    const term = q.trim();
    if (picked && term === picked.name) return;
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      if (term === lastQ.current) return;
      lastQ.current = term;
      setResults(await searchFarmersForAction(term));
    }, 300);
    return () => clearTimeout(t);
  }, [q, picked]);

  const pick = (f: FarmerPick) => {
    setPicked(f); setResults([]); setQ(f.name);
    if (f.mobile) setMobile(f.mobile.replace(/\D/g, "").slice(-10));
  };
  const clearPick = () => { setPicked(null); setQ(""); };

  // Pick an approved DLT template → one input box per {#var#}; content stays locked to the template.
  const pickDlt = (id: string) => {
    setDltId(id);
    const t = (tpls ?? []).find((x) => x.dltTemplateId === id);
    setSmsParams(t ? Array(countDltVars(t.content)).fill("") : []);
  };

  // SMS is India-only (10 digits, 6–9). WhatsApp test allows a full international number incl. country
  // code (e.g. a UAE 971… number) — testing convenience only; the portal still serves India everywhere else.
  const mobileValid = isWa ? /^\d{8,15}$/.test(mobile) : /^[6-9]\d{9}$/.test(mobile);

  const isTemplateMode = isWa; // WhatsApp is template-only now — approved templates are the only way to send
  const selectedTpl = waTemplates.find((t) => t.name === tplName) ?? null;
  const paramsFilled = !selectedTpl || tplParams.slice(0, selectedTpl.varCount).filter((s) => s.trim()).length === selectedTpl.varCount;
  const pickTemplate = (name: string) => {
    setTplName(name);
    const t = waTemplates.find((x) => x.name === name);
    setTplParams(t ? Array(t.varCount).fill("") : []);
  };

  // Approved DLT templates synced from ZapSMS — the SMS test bench sends via one of these.
  const [tpls, setTpls] = useState<SmsTemplateVM[] | null>(null);
  const loadApproved = () => getSmsTemplates().then((r) => setTpls((r.templates ?? []).filter((t) => t.approved)));
  const selectedDlt = (tpls ?? []).find((t) => t.dltTemplateId === dltId) ?? null;
  const dltVarCount = selectedDlt ? countDltVars(selectedDlt.content) : 0;
  // Exactly what goes out: the approved template content with each {#var#} filled. Sent verbatim
  // (TemplateId = the 19-digit DLT id, no entity id — the combination proven to deliver).
  const smsBody = selectedDlt ? fillDltValues(selectedDlt.content, smsParams) : "";
  const smsParamsFilled = !!selectedDlt && smsParams.slice(0, dltVarCount).filter((s) => s.trim()).length === dltVarCount;

  const canSend = ready && mobileValid && !sending && (
    isTemplateMode ? !!selectedTpl && paramsFilled : !!selectedDlt && smsBody.trim().length > 0 && smsParamsFilled
  );

  const [bal, setBal] = useState<SmsBalance | null>(null);
  const loadBalance = () => smsBalance().then((r) => setBal(r.ok && r.balance ? r.balance : null));
  const [smsLogs, setSmsLogs] = useState<SmsLogRow[] | null>(null);
  const [refreshingSms, startRefreshSms] = useTransition();
  const loadSmsLogs = () => getRecentSmsLogs(10).then(setSmsLogs);
  const refreshSmsStatus = () => startRefreshSms(async () => { const r = await refreshSmsDeliveryStatus(10); setSmsLogs(r.rows); });

  const send = () => {
    setResult(null);
    startSend(async () => {
      const r = isWa
        ? await sendTestWhatsApp({ mobile, templateName: selectedTpl!.name, languageCode: selectedTpl!.language, bodyParams: tplParams.slice(0, selectedTpl!.varCount), farmerId: picked?.id ?? null })
        : await sendTestSms({ mobile, message: smsBody, templateId: dltId || null, dltTemplateId: dltId || null, farmerId: picked?.id ?? null });
      setResult(r.ok
        ? {
            ok: true,
            text: isWa
              ? `Accepted by Meta${r.providerId ? ` · id ${r.providerId}` : ""}${r.status ? ` · ${r.status}` : ""} — watch delivery status below.`
              : `Submitted to the SMS gateway${r.providerId ? ` · id ${r.providerId}` : ""}${r.status ? ` · ${r.status}` : ""}.`,
          }
        : { ok: false, text: r.error ?? "Send failed." });
      if (isWa) onSent?.(); // the sibling delivery-status panel handles the refresh
      else loadSmsLogs(); // SMS: show the new row immediately (DLR is pulled on demand)
    });
  };

  // SMS-only side data (balance, delivery log, approved-DLT sync). WhatsApp delivery status lives in a sibling.
  useEffect(() => { if (!isWa) { loadSmsLogs(); if (smsReady) { loadBalance(); loadApproved(); } } }, [isWa]); // eslint-disable-line

  const inputCls = "w-full rounded-[10px] border border-[#E0E0E0] px-3 py-2.5 text-[13px] outline-none focus:border-[#678722]";

  return (
    <div className="rounded-2xl border border-black/[0.03] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px] font-bold text-[#1A1C1A]">Test messaging</span>
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: isWa ? "#F3F8E6" : "#F3E5F5", color: accent }}>{isWa ? "Meta WhatsApp" : "ZapSMS"}</span>
      </div>
      <p className="mb-3 text-[12px] text-[#9E9E9E]">Send a one-off message to a farmer or any number to verify the gateway. Admin-only; every send is logged.</p>

      {/* Channel toggle — hidden when the card is locked to one channel (SMS / WhatsApp tabs) */}
      {!only && (
        <div className="mb-4 inline-flex rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
          {([["sms", "✉ SMS"], ["whatsapp", "⚡ WhatsApp"]] as [Channel, string][]).map(([c, label]) => (
            <button key={c} type="button" onClick={() => { setChannel(c); setResult(null); }}
              className="rounded-[8px] px-4 py-1.5 text-[12.5px] font-bold transition-colors"
              style={{ background: channel === c ? "#fff" : "transparent", color: channel === c ? accent : "#9E9E9E", boxShadow: channel === c ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Gateway status */}
      {ready ? (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-[10px] bg-[#F3F8E6] px-3 py-2 text-[12px] text-[#678722]">
          <span>✓ {isWa ? "WhatsApp Cloud API configured." : `Gateway configured${senderId ? ` · sender ${senderId}` : ""}.`}</span>
          {!isWa && bal && (
            <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-bold text-[#516A1B]"
              title={bal.total > 0 ? bal.items.map((i) => `${i.productType}: ${i.credits.toLocaleString("en-IN")}`).join(" · ") : `Raw gateway response: ${bal.raw ?? "—"}`}>
              💳 {bal.currency
                ? `${bal.currency}${bal.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `${Math.round(bal.total).toLocaleString("en-IN")} credits`}
            </span>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-[10px] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">
          Not configured — set {miss.join(", ")} in the environment, then restart.
        </div>
      )}

      {isWa && (
        <div className="mb-4 rounded-[10px] bg-[#F3F8E6] px-3 py-2 text-[11.5px] text-[#678722]">
          WhatsApp sends only via <b>approved templates</b> — they reach any number, even a cold one (Meta’s 24h window doesn’t apply).
        </div>
      )}

      {/* Recipient: farmer search */}
      <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Find a farmer <span className="font-normal normal-case text-[#BDBDBD]">(optional)</span></label>
      <div className="relative mt-1">
        <input className={inputCls} placeholder="Search by name or mobile…" value={q}
          onChange={(e) => { setQ(e.target.value); if (picked) setPicked(null); }} />
        {picked && (
          <button type="button" onClick={clearPick} className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] leading-none text-[#9E9E9E] hover:text-[#C62828]">×</button>
        )}
        {results.length > 0 && !picked && (
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-[220px] overflow-y-auto rounded-[10px] border border-[#E0E0E0] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
            {results.map((f) => (
              <button key={f.id} type="button" onClick={() => pick(f)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-[#F5F7F5]">
                <span><span className="font-semibold text-[#1A1C1A]">{f.name}</span> <span className="text-[#9E9E9E]">· {f.village || "—"}</span></span>
                <span className="shrink-0 font-mono text-[11.5px] text-[#616161]">{f.mobile || "no #"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recipient: number */}
      <label className="mt-3 block text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Mobile number *</label>
      <input className={`${inputCls} mt-1 tracking-[1px] ${mobile && !mobileValid ? "border-[#EF9A9A]" : ""}`} inputMode="numeric"
        placeholder={isWa ? "Full international number, e.g. 9715XXXXXXXX" : "10-digit number"} value={mobile} maxLength={isWa ? 15 : 10}
        onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, isWa ? 15 : 10))} />
      {mobile && !mobileValid && (
        <div className="mt-1 text-[11px] text-[#C62828]">
          {isWa ? "Enter the full international number incl. country code (8–15 digits, no +)." : "Must be 10 digits starting 6, 7, 8 or 9."}
        </div>
      )}
      {isWa && <div className="mt-1 text-[11px] text-[#9E9E9E]">Testing only — include the country code (a UAE number is 971…). Everywhere else the portal is India-only.</div>}

      {/* Approved-template picker (WhatsApp template mode) */}
      {isTemplateMode ? (
        <div className="mt-3">
          <label className="block text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Approved template *</label>
          {waTemplates.length === 0 ? (
            <div className="mt-1 rounded-[10px] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">
              No approved templates yet. Create &amp; submit one in the <b>WhatsApp Templates</b> tab — once Meta approves it, it appears here.
            </div>
          ) : (
            <>
              <select className={`${inputCls} mt-1 bg-white`} value={tplName} onChange={(e) => pickTemplate(e.target.value)}>
                <option value="">Pick an approved template…</option>
                {waTemplates.map((t) => <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language}){t.varCount ? ` · ${t.varCount} var` : ""}</option>)}
              </select>
              {selectedTpl && (
                <>
                  {selectedTpl.varCount > 0 && (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Array.from({ length: selectedTpl.varCount }).map((_, i) => (
                        <div key={i}>
                          <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Value for {`{{${i + 1}}}`}</label>
                          <input className={`${inputCls} mt-1`} value={tplParams[i] ?? ""}
                            onChange={(e) => setTplParams((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                            placeholder={`{{${i + 1}}}`} />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2">
                    <div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Preview</div>
                    <div className="mt-1 rounded-[10px] rounded-tl-[3px] bg-[#DCF8C6] px-3 py-2 text-[12.5px] leading-relaxed text-[#1A1C1A] shadow-[0_1px_1px_rgba(0,0,0,0.08)]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>
                      {fillPreview(selectedTpl.body, tplParams)}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Approved DLT template picker (SMS delivery needs an approved template id) */}
          <div className="mt-3 flex items-end justify-between gap-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Approved DLT template <span className="normal-case text-[#BDBDBD]">(required for delivery)</span></label>
            <button type="button" onClick={loadApproved} className="text-[11px] font-semibold text-[#6A1B9A] hover:underline">↻ Sync</button>
          </div>
          <select value={dltId} onChange={(e) => pickDlt(e.target.value)}
            className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3 py-2.5 text-[13px] text-[#424242] outline-none focus:border-[#678722]">
            <option value="">{tpls == null ? "Loading approved templates…" : tpls.length ? "— Pick an approved template —" : "No approved templates found"}</option>
            {(tpls ?? []).map((t) => <option key={t.dltTemplateId} value={t.dltTemplateId}>{t.name} · {t.dltTemplateId}</option>)}
          </select>

          {selectedDlt ? (
            <>
              {/* One input per {#var#} — the content is locked to the approved template. */}
              {dltVarCount > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Array.from({ length: dltVarCount }).map((_, i) => (
                    <div key={i}>
                      <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Variable {i + 1} <span className="normal-case text-[#BDBDBD]">({`{#var#}`})</span></label>
                      <input className={`${inputCls} mt-1`} value={smsParams[i] ?? ""}
                        onChange={(e) => setSmsParams((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                        placeholder={`Value for {#var#} #${i + 1}`} />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-[10px] font-bold uppercase text-[#9E9E9E]">Exactly what will be sent</div>
              <div className="mt-1 rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] px-3 py-2.5 text-[13px] leading-relaxed text-[#1A1C1A]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{smsBody}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#9E9E9E]">
                <span>DLT template {selectedDlt.dltTemplateId}{selectedDlt.approved ? " — approved ✓" : ""}</span>
                <span>{smsBody.length} chars</span>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-[10px] bg-[#FEF6E9] px-3 py-2.5 text-[12px] text-[#8D6E00]">
              Pick an approved DLT template above to compose the message.
            </div>
          )}
        </>
      )}

      {result && (
        <div className={`mt-3 rounded-[10px] px-3 py-2 text-[12px] font-medium ${result.ok ? "bg-[#F3F8E6] text-[#678722]" : "bg-[#FDECEA] text-[#C62828]"}`}>
          {result.ok ? "✓ " : "✕ "}{result.text}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={send} disabled={!canSend}
          className="rounded-[10px] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
          {sending ? "Sending…" : isWa ? "⚡ Send test WhatsApp" : "✉ Send test SMS"}
        </button>
      </div>

      {/* SMS delivery reports — pulled on demand from the gateway (DLR). "Submitted" ≠ delivered. */}
      {!isWa && (
        <div className="mt-5 border-t border-[#F0F0F0] pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#1A1C1A]">Recent SMS delivery status</span>
            <button type="button" onClick={refreshSmsStatus} disabled={refreshingSms} className="text-[11.5px] font-semibold text-[#6A1B9A] hover:underline disabled:opacity-50">{refreshingSms ? "Checking…" : "↻ Refresh status"}</button>
          </div>
          {smsLogs == null ? <div className="text-[11.5px] text-[#9E9E9E]">Loading…</div>
            : smsLogs.length === 0 ? <div className="text-[11.5px] text-[#BDBDBD]">No SMS sends yet.</div>
            : (
              <div className="flex flex-col gap-1.5">
                {smsLogs.map((l) => {
                  const dlr = (l.deliveryStatus ?? "").toUpperCase();
                  const submitFailed = !l.ok;
                  const failed = submitFailed || dlr === "FAILED";
                  const delivered = dlr === "DELIVERED" || !!l.deliveredAt;
                  const label = submitFailed ? "NOT SENT" : dlr || "SUBMITTED";
                  const color = failed ? "#C62828" : delivered ? "#678722" : "#E65100";
                  const bg = failed ? "#FDECEA" : delivered ? "#F3F8E6" : "#FFF3E0";
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[#EEE] px-2.5 py-1.5 text-[11.5px]">
                      <span className="font-mono text-[#616161]">{l.mobile}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: bg, color }}>{label}</span>
                      <span className="text-[#9E9E9E]">{new Date(l.createdAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                      {failed && (l.error || (submitFailed ? l.status : null)) && <span className="text-[#C62828]">{l.error ?? l.status}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          <div className="mt-1.5 text-[11px] text-[#9E9E9E]">SMS delivery reports are pulled on demand — hit <b>Refresh status</b> a few seconds after sending. A blank/PENDING status just means the carrier hasn&apos;t reported back yet.</div>
        </div>
      )}
    </div>
  );
}
