"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import {
  getCampaignPhaseConfig, saveCampaignPhases, getRoundStatus, advanceCampaignRound,
  type CampaignPhaseConfig, type PhaseVM, type PhaseInput, type RoundStatus,
} from "@/app/actions/campaign-phases";
import {
  PURCHASED_LABEL, NOT_PURCHASED_LABEL, newTarget, channelLabel, mediumToChannel,
  type Coupon, type MessageTarget, type RoundMessaging,
} from "@/lib/campaign-phases";
import { VALUE_SEGMENTS, LIFECYCLE_SEGMENTS, segMeta } from "@/lib/campaign-segments";

type Tab = "define" | "status";
const LBL = "text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]";
const INPUT = "rounded-[10px] border border-[#E0E0E0] px-3 py-2 text-[13px] outline-none focus:border-[#678722]";
const BTN = "rounded-[10px] px-4 py-2 text-[12.5px] font-semibold";

export function PhasesPanel({
  campaignId, campaignName, campaignStart, campaignEnd, commPlanNames, commPlanMediums = {}, onClose,
}: {
  campaignId: number; campaignName: string; campaignStart: string; campaignEnd: string;
  commPlanNames: string[]; commPlanMediums?: Record<string, string>; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("define");
  const [cfg, setCfg] = useState<CampaignPhaseConfig | null>(null);
  const load = () => getCampaignPhaseConfig(campaignId).then((c) => { if (c) setCfg(c); });
  useEffect(() => { load(); }, [campaignId]); // eslint-disable-line

  return (
    <Modal open onClose={onClose} className="max-w-[1080px]">
      <ModalHeader eyebrow="Campaign · rounds" eyebrowColor="#678722" title={campaignName}
        subtitle={`${campaignStart} → ${campaignEnd} · define rounds and advance the campaign`} onClose={onClose} />
      <div className="px-5 py-4">
        <div className="mb-4 inline-flex rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
          {([["define", "Rounds"], ["status", "Round status"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className="rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{ background: tab === k ? "#fff" : "transparent", color: tab === k ? "#678722" : "#9E9E9E", boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
              {l}
            </button>
          ))}
        </div>

        {cfg == null ? <div className="py-10 text-center text-[13px] text-[#9E9E9E]">Loading…</div> : (
          <>
            {tab === "define" && <DefineTab cfg={cfg} commPlanNames={commPlanNames} commPlanMediums={commPlanMediums} onSaved={load} />}
            {tab === "status" && <RoundStatusTab campaignId={campaignId} />}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ─────────────────── Define tab ─────────────────── */

function DefineTab({ cfg, commPlanNames, commPlanMediums, onSaved }: { cfg: CampaignPhaseConfig; commPlanNames: string[]; commPlanMediums: Record<string, string>; onSaved: () => void }) {
  const [phases, setPhases] = useState<PhaseVM[]>(cfg.phases);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const patch = (i: number, p: Partial<PhaseVM>) => setPhases((ps) => ps.map((x, j) => j === i ? { ...x, ...p } : x));
  const addPhase = () => setPhases((ps) => [...ps, {
    id: -(ps.length + 1) - 100, ordinal: (ps.at(-1)?.ordinal ?? 0) + 1, name: "",
    defaultStart: cfg.campaignStart, defaultEnd: cfg.campaignEnd, coupons: [],
    messaging: { targets: [], purchased: [], notPurchased: [] },
  }]);
  const removePhase = (i: number) => setPhases((ps) => ps.filter((_, j) => j !== i).map((x, k) => ({ ...x, ordinal: k + 1 })));

  const save = () => {
    setErr(null); setMsg(null);
    const input: PhaseInput[] = phases.map((p) => ({
      ordinal: p.ordinal, name: p.name, defaultStart: p.defaultStart, defaultEnd: p.defaultEnd,
      coupons: p.coupons, messaging: p.messaging,
    }));
    startSave(async () => {
      const r = await saveCampaignPhases(cfg.campaignId, input);
      if (!r.ok) { setErr(r.error ?? "Save failed."); return; }
      setMsg("Rounds saved."); onSaved();
    });
  };

  if (phases.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#E4EFC9] bg-[#F1F8F1] px-5 py-10 text-center">
        <div className="text-[14px] font-bold text-[#516A1B]">No rounds defined yet</div>
        <div className="mt-1 text-[12.5px] text-[#66857A]">Add a round, name it for this campaign, set its dates, coupons &amp; messaging.</div>
        <button type="button" onClick={addPhase} className={`${BTN} mt-4 bg-[#678722] text-white`}>+ Add first round</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11.5px] text-[#9E9E9E]">Each round is a stage of the campaign with its own dates, coupons &amp; messaging. Round 2 onward splits messaging by whether the farmer has purchased.</div>
      {phases.map((p, i) => (
        <PhaseCard key={p.id} phase={p} commPlanNames={commPlanNames} commPlanMediums={commPlanMediums}
          onPatch={(x) => patch(i, x)} onRemove={() => removePhase(i)} canRemove={phases.length > 1} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addPhase} className={`${BTN} border border-[#E0E0E0] text-[#616161] hover:bg-[#F5F5F5]`}>+ Add round</button>
        <div className="ml-auto flex items-center gap-2">
          {err && <span className="text-[12px] font-semibold text-[#C62828]">{err}</span>}
          {msg && <span className="text-[12px] font-semibold text-[#678722]">{msg}</span>}
          <button type="button" onClick={save} disabled={saving} className={`${BTN} bg-[#678722] text-white disabled:opacity-50`}>{saving ? "Saving…" : "Save rounds"}</button>
        </div>
      </div>
    </div>
  );
}

function PhaseCard({ phase, commPlanNames, commPlanMediums, onPatch, onRemove, canRemove }: {
  phase: PhaseVM; commPlanNames: string[]; commPlanMediums: Record<string, string>;
  onPatch: (p: Partial<PhaseVM>) => void; onRemove: () => void; canRemove: boolean;
}) {
  const setCoupon = (ci: number, c: Partial<Coupon>) => onPatch({ coupons: phase.coupons.map((x, j) => j === ci ? { ...x, ...c } : x) });
  const addCoupon = () => onPatch({ coupons: [...phase.coupons, { label: "", code: "" }] });
  const rmCoupon = (ci: number) => onPatch({ coupons: phase.coupons.filter((_, j) => j !== ci) });
  const setMessaging = (patch: Partial<RoundMessaging>) => onPatch({ messaging: { ...phase.messaging, ...patch } });
  const split = phase.ordinal >= 2;

  return (
    <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-[#678722] text-[12px] font-bold text-white">{phase.ordinal}</div>
        <div className="flex-1 min-w-[160px]">
          <label className={LBL}>Round name</label>
          <input value={phase.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="e.g. Advance booking" className={`${INPUT} mt-1 w-full`} />
        </div>
        <div>
          <label className={LBL}>Start</label>
          <input type="date" value={phase.defaultStart} onChange={(e) => onPatch({ defaultStart: e.target.value })} className={`${INPUT} mt-1`} />
        </div>
        <div>
          <label className={LBL}>End</label>
          <input type="date" value={phase.defaultEnd} onChange={(e) => onPatch({ defaultEnd: e.target.value })} className={`${INPUT} mt-1`} />
        </div>
        {canRemove && <button type="button" onClick={onRemove} className="rounded-md bg-[#FDECEA] px-2 py-1.5 text-[11px] font-semibold text-[#C62828] hover:bg-[#FADBD8]">Remove</button>}
      </div>

      {/* Coupons */}
      <div className="mt-3 border-t border-[#F5F5F5] pt-3">
        <div className="mb-1.5 flex items-center justify-between"><span className={LBL}>Offers / coupons (fill message [coupon])</span>
          <button type="button" onClick={addCoupon} className="text-[11px] font-semibold text-[#678722]">+ Add coupon</button></div>
        {phase.coupons.length === 0 ? <div className="text-[11.5px] text-[#BDBDBD]">No coupons for this round.</div> : (
          <div className="flex flex-col gap-1.5">
            {phase.coupons.map((c, ci) => (
              <div key={ci} className="flex flex-wrap items-center gap-2">
                <input value={c.label} onChange={(e) => setCoupon(ci, { label: e.target.value })} placeholder="Rs 300 off" className={`${INPUT} w-[150px]`} />
                <input value={c.code} onChange={(e) => setCoupon(ci, { code: e.target.value.toUpperCase() })} placeholder="POT300" className={`${INPUT} w-[120px] font-mono`} />
                <input type="number" value={c.minSpend ?? ""} onChange={(e) => setCoupon(ci, { minSpend: e.target.value ? Number(e.target.value) : undefined })} placeholder="min ₹" className={`${INPUT} w-[90px]`} />
                <button type="button" onClick={() => rmCoupon(ci)} className="text-[11px] font-semibold text-[#C62828]">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messaging */}
      <div className="mt-3 border-t border-[#F5F5F5] pt-3">
        <div className={`${LBL} mb-2`}>Messaging — who to contact &amp; how</div>
        {!split ? (
          <MessageTargets targets={phase.messaging.targets} commPlanNames={commPlanNames} commPlanMediums={commPlanMediums} onChange={(targets) => setMessaging({ targets })} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-[10px] border border-[#E4EFC9] bg-[#F1F8F1] p-2.5">
              <div className="mb-1.5 text-[12px] font-bold text-[#678722]">✓ {PURCHASED_LABEL}</div>
              <MessageTargets targets={phase.messaging.purchased} commPlanNames={commPlanNames} commPlanMediums={commPlanMediums} onChange={(purchased) => setMessaging({ purchased })} />
            </div>
            <div className="rounded-[10px] border border-[#F5CE8E] bg-[#FFF8F0] p-2.5">
              <div className="mb-1.5 text-[12px] font-bold text-[#E65100]">○ {NOT_PURCHASED_LABEL}</div>
              <MessageTargets targets={phase.messaging.notPurchased} commPlanNames={commPlanNames} commPlanMediums={commPlanMediums} onChange={(notPurchased) => setMessaging({ notPurchased })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Message targets editor ─────────────────── */

function MessageTargets({ targets, commPlanNames, commPlanMediums, onChange }: {
  targets: MessageTarget[]; commPlanNames: string[]; commPlanMediums: Record<string, string>; onChange: (t: MessageTarget[]) => void;
}) {
  const setT = (i: number, patch: Partial<MessageTarget>) => onChange(targets.map((t, j) => j === i ? { ...t, ...patch } : t));
  return (
    <div className="flex flex-col gap-2">
      {targets.length === 0 && <div className="text-[11.5px] text-[#BDBDBD]">No targets — add one to say who gets which comm plan.</div>}
      {targets.map((t, i) => (
        <TargetRow key={i} t={t} commPlanNames={commPlanNames} commPlanMediums={commPlanMediums} onChange={(p) => setT(i, p)} onRemove={() => onChange(targets.filter((_, j) => j !== i))} />
      ))}
      <button type="button" onClick={() => onChange([...targets, newTarget()])}
        className="self-start rounded-[8px] border border-dashed border-[#E4EFC9] bg-[#F1F8F1] px-3 py-1 text-[11.5px] font-semibold text-[#678722] hover:bg-[#F3F8E6]">+ Add target</button>
    </div>
  );
}

function TargetRow({ t, commPlanNames, commPlanMediums, onChange, onRemove }: {
  t: MessageTarget; commPlanNames: string[]; commPlanMediums: Record<string, string>; onChange: (p: Partial<MessageTarget>) => void; onRemove: () => void;
}) {
  // Channel is derived from the chosen comm plan's medium — no separate picker.
  const planMedium = t.commPlan ? commPlanMediums[t.commPlan] : undefined;
  const pickPlan = (name: string) =>
    onChange({ commPlan: name || undefined, channel: name ? mediumToChannel(commPlanMediums[name]) : undefined });
  const toggle = (dim: "value" | "lifecycle", seg: string) => {
    const arr = t[dim];
    onChange({ [dim]: arr.includes(seg) ? arr.filter((x) => x !== seg) : [...arr, seg] } as Partial<MessageTarget>);
  };
  const chip = (seg: string, dim: "value" | "lifecycle") => {
    const on = t[dim].includes(seg); const m = segMeta(seg);
    return (
      <button key={seg} type="button" onClick={() => toggle(dim, seg)}
        className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
        style={{ background: on ? m.bg : "#fff", color: on ? m.color : "#9E9E9E", borderColor: on ? m.color : "#E0E0E0" }}>
        {m.label}
      </button>
    );
  };
  return (
    <div className="rounded-[10px] border border-[#EEE] bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#333]">
          <input type="checkbox" checked={t.all} onChange={(e) => onChange({ all: e.target.checked })} /> All farmers
        </label>
        <select value={t.commPlan ?? ""} onChange={(e) => pickPlan(e.target.value)} className="min-w-0 flex-1 rounded-[8px] border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[#678722]">
          <option value="">Comm plan…</option>
          {commPlanNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {/* Channel comes from the comm plan's medium — shown, not selected. */}
        {t.commPlan
          ? <span className="rounded-full bg-[#E3F2FD] px-2.5 py-1 text-[11px] font-semibold text-[#1565C0]" title="Sent via this comm plan's medium">{planMedium ? channelLabel(mediumToChannel(planMedium)) : "—"}</span>
          : <span className="text-[11px] text-[#BDBDBD]">channel set by comm plan</span>}
        <button type="button" onClick={onRemove} className="rounded-md bg-[#FDECEA] px-2 py-1 text-[11px] font-semibold text-[#C62828] hover:bg-[#FADBD8]">✕</button>
      </div>
      {!t.all && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase text-[#9E9E9E]">Value</span>
          {VALUE_SEGMENTS.map((s) => chip(s, "value"))}
          <span className="ml-2 text-[9.5px] font-bold uppercase text-[#9E9E9E]">Lifecycle</span>
          {LIFECYCLE_SEGMENTS.map((s) => chip(s, "lifecycle"))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Round status ─────────────────── */

function RoundStatusTab({ campaignId }: { campaignId: number }) {
  const [status, setStatus] = useState<RoundStatus | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const load = () => getRoundStatus(campaignId).then(setStatus);
  useEffect(() => { load(); }, [campaignId]); // eslint-disable-line

  if (status == null) return <div className="py-10 text-center text-[13px] text-[#9E9E9E]">Loading…</div>;
  if (status.rounds.length === 0) return <div className="py-10 text-center text-[13px] text-[#9E9E9E]">No rounds defined yet.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {status.rounds.map((r) => {
          const on = r.ordinal === status.currentOrdinal;
          const done = r.ordinal < status.currentOrdinal;
          return (
            <div key={r.ordinal} className="flex items-center gap-2">
              <div className="rounded-full px-3 py-1 text-[12px] font-bold"
                style={{ background: on ? "#678722" : done ? "#F3F8E6" : "#F5F5F5", color: on ? "#fff" : done ? "#678722" : "#9E9E9E" }}>
                {r.ordinal}. {r.name || "(unnamed)"}{done ? " ✓" : ""}
              </div>
              {r.ordinal < status.rounds.length && <span className="text-[#BDBDBD]">→</span>}
            </div>
          );
        })}
      </div>

      <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="rounded-full bg-[#F3F8E6] px-2.5 py-0.5 text-[11.5px] font-bold text-[#678722]">Current — Round {status.currentOrdinal}: {status.roundName || "(unnamed)"}</span>
            <span className="ml-2 text-[12px] text-[#757575]">{status.windowStart} → {status.windowEnd} · {status.memberCount} test farmers</span>
            {status.advancedByName && <div className="mt-1 text-[10.5px] text-[#9E9E9E]">Last advanced by {status.advancedByName} · {status.advancedAt}</div>}
          </div>
          {status.canManage && (status.hasNext
            ? <button type="button" onClick={() => setAdvancing(true)} className={`${BTN} bg-[#678722] text-white`}>→ Advance to {status.nextRoundName}</button>
            : <span className="text-[12px] font-semibold text-[#9E9E9E]">Final round</span>)}
        </div>
        {status.purchaseSplit && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-[10px] bg-[#F1F8F1] px-3 py-2"><span className="text-[18px] font-bold text-[#678722]">{status.purchasedCount}</span> <span className="text-[12px] text-[#616161]">{PURCHASED_LABEL}</span></div>
            <div className="rounded-[10px] bg-[#FFF8F0] px-3 py-2"><span className="text-[18px] font-bold text-[#E65100]">{status.notPurchasedCount}</span> <span className="text-[12px] text-[#616161]">{NOT_PURCHASED_LABEL}</span></div>
          </div>
        )}
      </div>

      {advancing && <AdvanceModal campaignId={campaignId} status={status} onClose={() => setAdvancing(false)} onDone={() => { setAdvancing(false); load(); }} />}
    </div>
  );
}

function AdvanceModal({ campaignId, status, onClose, onDone }: { campaignId: number; status: RoundStatus; onClose: () => void; onDone: () => void }) {
  const [attested, setAttested] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const go = () => {
    setErr(null);
    startSave(async () => {
      const r = await advanceCampaignRound({ campaignId, attested, note: note || undefined });
      if (!r.ok) { setErr(r.error ?? "Failed."); return; }
      onDone();
    });
  };
  return (
    <Modal open onClose={onClose} className="max-w-[460px]">
      <ModalHeader eyebrow="Advance round" eyebrowColor="#678722" title={`${status.roundName || "Round"} → ${status.nextRoundName}`} onClose={onClose} />
      <div className="px-5 py-4">
        <div className="rounded-[10px] bg-[#FEF6E9] px-3.5 py-2.5 text-[12px] text-[#8D6E00]">
          Moving the whole campaign to <b>{status.nextRoundName}</b>. From Round 2 on, messaging splits by whether each farmer has purchased — so confirm this round&apos;s sales data is uploaded first.
        </div>
        <label className="mt-3 flex items-start gap-2 text-[13px] text-[#333]">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5" />
          <span>I confirm the sales data for <b>{status.roundName || "this round"}</b> has been uploaded.</span>
        </label>
        <div className="mt-3">
          <label className={LBL}>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. booking file uploaded 25 Sep" className={`${INPUT} mt-1 w-full`} />
        </div>
        {err && <div className="mt-3 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${BTN} border border-[#E0E0E0] text-[#616161] hover:bg-[#F5F5F5]`}>Cancel</button>
          <button type="button" onClick={go} disabled={saving || !attested} className={`${BTN} bg-[#678722] text-white disabled:opacity-50`}>{saving ? "Advancing…" : "Advance"}</button>
        </div>
      </div>
    </Modal>
  );
}
