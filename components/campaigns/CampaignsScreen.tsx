"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/components/interactive";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS, VALUE_TITLE, LIFECYCLE_TITLE } from "@/lib/campaign-segments";
import { SmsSender } from "./SmsSender";
import { WaSender } from "./WaSender";
import { BroadcastPanel } from "./BroadcastPanel";
import { BroadcastHistory } from "./BroadcastHistory";
import { PhasesPanel } from "./phases/PhasesPanel";
import { PhaseOutreachPanel } from "./phases/PhaseOutreachPanel";
import { WA_VAR_TOKENS, SAMPLE_VARS, fillNamedTemplate, countDltVars, fillDltTemplate } from "@/lib/campaign-vars";
import { listTemplates, type WaTemplate } from "@/app/actions/whatsapp-templates";
import { useConfirm } from "@/components/ConfirmDialog";
import { cropLabel } from "@/lib/crops";
import { inr } from "@/lib/format";
import {
  saveCommTemplate, createCommTemplate, deleteCommTemplate, createCampaign, getCampaignTracker, extendCampaign, updateCampaignCommPlans, deleteCampaign, getCampaignMembers, markCampaignMember, getCampaignAnalytics, exportCampaignAudienceXlsx, getSmsTemplates,
  type CampaignListItem, type CampaignTracker, type ProjectVM, type CampaignMemberVM, type CampaignAnalytics, type SmsTemplateVM,
} from "@/app/actions/campaigns";
import { downloadB64 } from "@/lib/download";

/** Distinct-crop option (kept here as it's imported by the Farmer Clusters + Projects screens). */
export interface CropOption { crop: string; count: number }
/** Distinct Target-pest option (item-code derived). */
export interface PestOption { pest: string; count: number }

export interface CommTemplateVM {
  id: number; name: string; language: string; promoType: string;
  segment: string; segments: string[]; priority: number; medium: string; offer: string; timingLabel: string; template: string;
  dltTemplateId?: string | null;
  waTemplateName?: string | null;
  waLanguage?: string | null;
  waVariables?: string[];
  smsVariables?: string[];
}
export interface StoreLite { id: number; name: string }
/** An approved Meta template + the friendly names of its {{1}},{{2}}… slots (for comm-plan var mapping). */
export interface TemplateVarHint { name: string; language: string; labels: string[] }

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => x.toLocaleString("en-IN");

/* ══════════════════ Comm plan (WF3) ══════════════════ */

const LANG_LABEL: Record<string, string> = { en: "English", hi: "हिंदी" };
const MEDIUM_CHIPS = ["All", "WhatsApp", "Call", "SMS"];
const PROMO_TYPES = ["General", "Discount", "Festival", "New launch", "Scheme/Credit", "Reminder"];

const MEDIA = ["WhatsApp", "SMS", "Call"];
// Insertable named slots for SMS/Call — every farmer field we can fill at send time (from WA_VAR_TOKENS,
// minus the niche "₹ to reach HNI" gap). Each is { slot: "[name]", label: "Farmer first name" }.
const NAMED_SLOTS = WA_VAR_TOKENS.filter((t) => t.key !== "gap");

/** Fill a template with sample values for a live preview (WhatsApp → {{n}} via mapping; else named slots). */
function samplePreview(t: { medium: string; template?: string | null; waVariables?: string[] }): string {
  const body = t.template ?? "";
  if ((t.medium || "") === "WhatsApp")
    return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => SAMPLE_VARS[(t.waVariables ?? [])[Number(n) - 1] ?? ""] ?? `{{${n}}}`);
  return fillNamedTemplate(body, SAMPLE_VARS);
}

/** Full editable form for one comm plan (used by both edit + create). Fields adapt to the chosen medium. */
function CommPlanForm({ draft, setDraft }: { draft: CommTemplateVM; setDraft: (t: CommTemplateVM) => void }) {
  const input = "rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]";
  const med = draft.medium || "WhatsApp";
  const isWa = med === "WhatsApp", isSms = med === "SMS", isCall = med === "Call";
  const body = draft.template ?? "";
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Insert at the cursor (falls back to the end), then restore the caret after the inserted text.
  const insertSlot = (s: string) => {
    const ta = taRef.current;
    const at = ta ? ta.selectionStart : body.length;
    const end = ta ? ta.selectionEnd : body.length;
    const next = body.slice(0, at) + s + body.slice(end);
    setDraft({ ...draft, template: next });
    requestAnimationFrame(() => { if (ta) { ta.focus(); const p = at + s.length; ta.setSelectionRange(p, p); } });
  };
  const preview = samplePreview(draft);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div><label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Name</label>
          <input className={`${input} w-full`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Festival Bonanza — English" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Language</label>
            <select className={`${input} w-full bg-white`} value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
              <option value="hi">हिंदी</option><option value="en">English</option>
            </select></div>
          <div><label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Promotion</label>
            <select className={`${input} w-full bg-white`} value={draft.promoType} onChange={(e) => setDraft({ ...draft, promoType: e.target.value })}>
              {PROMO_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
        </div>
      </div>
      {/* Target segments — multi-select. Empty = All. Value tiers + lifecycle (incl. Leads). */}
      <div>
        <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Target segments <span className="normal-case text-[#BDBDBD]">(none selected = All)</span></label>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setDraft({ ...draft, segments: [] })}
            className="rounded-full border px-3 py-1 text-[11.5px] font-semibold"
            style={{ background: draft.segments.length === 0 ? "#F3F8E6" : "#fff", color: draft.segments.length === 0 ? "#678722" : "#616161", borderColor: draft.segments.length === 0 ? "#678722" : "#E0E0E0" }}>All</button>
          <span className="mx-0.5 h-4 w-px bg-[#EEE]" />
          {[...VALUE_SEGMENTS, ...LIFECYCLE_SEGMENTS].map((s) => {
            const on = draft.segments.includes(s); const m = segMeta(s);
            return (
              <button key={s} type="button"
                onClick={() => setDraft({ ...draft, segments: on ? draft.segments.filter((x) => x !== s) : [...draft.segments, s] })}
                className="rounded-full border px-3 py-1 text-[11.5px] font-semibold"
                style={{ background: on ? m.bg : "#fff", color: on ? m.color : "#9E9E9E", borderColor: on ? m.color : "#E0E0E0" }}>{m.label}</button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div><label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Medium</label>
          <select className={`${input} w-full bg-white`} value={med} onChange={(e) => setDraft({ ...draft, medium: e.target.value })}>
            {MEDIA.map((x) => <option key={x} value={x}>{x}</option>)}
          </select></div>
        <div><label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Timing</label>
          <input className={`${input} w-full`} value={draft.timingLabel} onChange={(e) => setDraft({ ...draft, timingLabel: e.target.value })} placeholder="e.g. Festival week" /></div>
      </div>
      <div><label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Offer</label>
        <input className={`${input} w-full`} value={draft.offer} onChange={(e) => setDraft({ ...draft, offer: e.target.value })} placeholder="Offer" /></div>

      {/* Message / template. Call: free script. SMS & WhatsApp: pick an APPROVED template — no free typing. */}
      {isCall ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Call script</label>
            <div className="flex flex-wrap gap-1">
              {NAMED_SLOTS.map((t) => <button key={t.slot} type="button" title={t.label} onClick={() => insertSlot(t.slot)} className="rounded-md border border-[#E0E0E0] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">{t.slot}</button>)}
            </div>
          </div>
          <textarea ref={taRef} className={`${input} mt-1 min-h-[90px] w-full`} value={body} dir="auto"
            onChange={(e) => setDraft({ ...draft, template: e.target.value })} placeholder="Namaste [name]! ..." />
          {body.trim() && (
            <>
              <div className="mt-1.5 text-[10px] font-bold uppercase text-[#9E9E9E]">Preview (sample customer)</div>
              <div className="mt-1 rounded-[10px] bg-[#F5F7F5] px-3 py-2 text-[12.5px] italic leading-[1.6] text-[#424242]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{preview}</div>
            </>
          )}
        </div>
      ) : isSms ? (
        <SmsPlanEditor draft={draft} setDraft={setDraft} inputCls={input} />
      ) : (
        <WaPlanEditor draft={draft} setDraft={setDraft} inputCls={input} />
      )}
    </div>
  );
}

/** One variable-mapping row list: map N positions to farmer fields (shared by SMS {#var#} and WA {{n}}). */
function VarMap({ label, positions, values, onChange, inputCls, fmtPos }: {
  label: string; positions: number; values: string[]; onChange: (v: string[]) => void; inputCls: string; fmtPos: (i: number) => string;
}) {
  if (positions === 0) return <div className="text-[11.5px] text-[#9E9E9E]">This template has no variables — it sends exactly as approved.</div>;
  const set = (i: number, tok: string) => onChange(Array.from({ length: positions }, (_, j) => (j === i ? tok : values[j] ?? WA_VAR_TOKENS[0].key)));
  return (
    <div>
      <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">{label}</label>
      <div className="mt-1 flex flex-col gap-1.5">
        {Array.from({ length: positions }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] font-mono font-bold text-[#616161]">{fmtPos(i)}</span>
            <select className={`${inputCls} flex-1`} value={values[i] ?? WA_VAR_TOKENS[0].key} onChange={(e) => set(i, e.target.value)}>
              {WA_VAR_TOKENS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SMS DLT template picker — syncs the account's approved templates from ZapSMS and lets the user
 * pick one (fills the DLT id + offers to load the approved text). Manual id entry stays as a fallback.
 */
/**
 * SMS comm plan: pick an APPROVED DLT template — the body is locked to the approved content and its
 * `{#var#}` positions are mapped to farmer fields. No free typing (DLT compliance). Legacy plans whose
 * id isn't in the synced approved list are shown read-only with a prompt to switch.
 */
function SmsPlanEditor({ draft, setDraft, inputCls }: { draft: CommTemplateVM; setDraft: (t: CommTemplateVM) => void; inputCls: string }) {
  const [tpls, setTpls] = useState<SmsTemplateVM[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const load = () => start(async () => {
    setErr(null);
    const r = await getSmsTemplates();
    if (r.ok) setTpls(r.templates); else { setTpls([]); setErr(r.error ?? "Could not load templates."); }
  });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const curId = (draft.dltTemplateId ?? "").trim();
  const approved = (tpls ?? []).filter((t) => t.approved);
  const selected = (tpls ?? []).find((t) => t.dltTemplateId === curId) ?? null;
  // Legacy = a stored body/id not tied to a synced approved template. We no longer show or use that
  // free-text body — the message can ONLY come from the picker.
  const isLegacy = tpls != null && !selected && !!(draft.template || curId);
  const content = selected ? selected.content : "";
  const positions = countDltVars(content);

  const pick = (id: string) => {
    const t = (tpls ?? []).find((x) => x.dltTemplateId === id);
    if (!t) return;
    const positions = countDltVars(t.content);
    const smsVariables = Array.from({ length: positions }, (_, i) => draft.smsVariables?.[i] ?? WA_VAR_TOKENS[0].key);
    setDraft({ ...draft, dltTemplateId: t.dltTemplateId, template: t.content, smsVariables });
  };
  const previewText = fillDltTemplate(content, draft.smsVariables, SAMPLE_VARS);

  return (
    <div className="rounded-[10px] border border-[#EDE7F6] bg-[#FBFAFF] p-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase text-[#6A1B9A]">DLT SMS template <span className="normal-case text-[#BDBDBD]">— pick an approved one (content is locked)</span></label>
        <button type="button" onClick={load} disabled={loading} className="text-[11px] font-semibold text-[#6A1B9A] hover:underline disabled:opacity-50">{loading ? "Syncing…" : "↻ Sync"}</button>
      </div>

      <select className={`${inputCls} mt-1 w-full bg-white`} value={selected ? curId : ""} disabled={loading}
        onChange={(e) => pick(e.target.value)}>
        <option value="">{loading ? "Loading approved templates…" : approved.length ? "— Pick an approved template —" : "No approved templates found"}</option>
        {approved.map((t) => <option key={t.dltTemplateId} value={t.dltTemplateId}>{t.name} · {t.dltTemplateId}</option>)}
      </select>
      {err && <div className="mt-1.5 text-[11.5px] text-[#C62828]">{err}</div>}
      {!loading && approved.length === 0 && !isLegacy && (
        <div className="mt-1.5 text-[11px] text-[#8D6E00]">Approve content templates on your DLT portal — they’ll sync here automatically.</div>
      )}

      {isLegacy && (
        <div className="mt-2 rounded-[8px] border border-[#F2C4C4] bg-[#FDF3F3] p-2.5 text-[11.5px] font-medium text-[#B71C1C]">
          ⚠ This plan isn’t linked to an approved DLT template{curId ? ` (old id ${curId})` : ""}. Pick one above — the carrier rejects any un-approved content (code 129).
        </div>
      )}

      {content && (
        <div className="mt-2 rounded-[8px] border border-[#E0E0E0] bg-white p-2.5">
          <div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Approved content · locked</div>
          <div className="mt-1 text-[12px] leading-[1.5] text-[#424242]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{content}</div>
        </div>
      )}

      {content && (
        <div className="mt-2">
          <VarMap label={`Map the ${positions} variable${positions === 1 ? "" : "s"} to farmer fields`} positions={positions}
            values={draft.smsVariables ?? []} onChange={(v) => setDraft({ ...draft, smsVariables: v })} inputCls={inputCls} fmtPos={(i) => `#${i + 1}`} />
          {positions > 0 && (
            <>
              <div className="mt-1.5 text-[10px] font-bold uppercase text-[#9E9E9E]">Preview (sample customer)</div>
              <div className="mt-1 rounded-[10px] bg-[#F5F7F5] px-3 py-2 text-[12.5px] italic leading-[1.6] text-[#424242]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{previewText}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** WhatsApp comm plan: pick an APPROVED Meta template. Body is locked; {{n}} positions map to farmer fields. */
function WaPlanEditor({ draft, setDraft, inputCls }: { draft: CommTemplateVM; setDraft: (t: CommTemplateVM) => void; inputCls: string }) {
  const [tpls, setTpls] = useState<WaTemplate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const load = () => start(async () => {
    setErr(null);
    const r = await listTemplates();
    if (r.ok && r.templates) setTpls(r.templates); else { setTpls([]); setErr(r.error ?? "Could not load templates."); }
  });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const approved = (tpls ?? []).filter((t) => t.status === "APPROVED");
  const curName = (draft.waTemplateName ?? "").trim();
  const selected = (tpls ?? []).find((t) => t.name === curName) ?? null;
  const isLegacy = !!(curName && !selected);
  const body = selected ? selected.body : draft.template;
  const positions = waVarCount(body);

  const pick = (name: string) => {
    const t = (tpls ?? []).find((x) => x.name === name);
    if (!t) return;
    const positions = waVarCount(t.body);
    const waVariables = Array.from({ length: positions }, (_, i) => draft.waVariables?.[i] ?? WA_VAR_TOKENS[0].key);
    setDraft({ ...draft, waTemplateName: t.name, waLanguage: t.language, template: t.body, waVariables });
  };
  const previewText = fillWaPreview(body, draft.waVariables);

  return (
    <div className="rounded-[10px] border border-[#E0F2E9] bg-[#F7FCF9] p-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase text-[#0B8A3D]">WhatsApp template <span className="normal-case text-[#BDBDBD]">— pick an approved one</span></label>
        <button type="button" onClick={load} disabled={loading} className="text-[11px] font-semibold text-[#0B8A3D] hover:underline disabled:opacity-50">{loading ? "Syncing…" : "↻ Sync"}</button>
      </div>

      <select className={`${inputCls} mt-1 w-full bg-white`} value={selected ? curName : ""} disabled={loading}
        onChange={(e) => pick(e.target.value)}>
        <option value="">{loading ? "Loading approved templates…" : approved.length ? "— Pick an approved template —" : "No approved templates found"}</option>
        {approved.map((t) => <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language})</option>)}
      </select>
      {err && <div className="mt-1.5 text-[11.5px] text-[#C62828]">{err}</div>}
      <div className="mt-1.5 text-[11px] text-[#607D8B]">Create &amp; approve new templates in <b>Settings → WhatsApp Templates</b>; approved ones appear here.</div>

      {isLegacy && (
        <div className="mt-2 rounded-[8px] border border-[#F5CE8E] bg-[#FFFDF7] p-2.5 text-[11.5px] text-[#8D6E00]">
          ⚠ “{curName}” isn’t in the approved list (maybe still pending). It stays until you pick an approved template.
        </div>
      )}

      {body && (
        <div className="mt-2 rounded-[8px] border border-[#E0E0E0] bg-white p-2.5">
          <div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Template body · locked</div>
          <div className="mt-1 text-[12px] leading-[1.5] text-[#424242]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{body}</div>
        </div>
      )}

      {body && (
        <div className="mt-2">
          <VarMap label={`Map the ${positions} variable${positions === 1 ? "" : "s"} to farmer fields`} positions={positions}
            values={draft.waVariables ?? []} onChange={(v) => setDraft({ ...draft, waVariables: v })} inputCls={inputCls} fmtPos={(i) => `{{${i + 1}}}`} />
          {positions > 0 && (
            <>
              <div className="mt-1.5 text-[10px] font-bold uppercase text-[#9E9E9E]">Preview (sample customer)</div>
              <div className="mt-1 rounded-[10px] bg-[#F5F7F5] px-3 py-2 text-[12.5px] italic leading-[1.6] text-[#424242]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{previewText}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Count distinct {{n}} placeholders in a WhatsApp template body. */
function waVarCount(body: string): number {
  return new Set((body.match(/\{\{\s*(\d+)\s*\}\}/g) ?? []).map((x) => x.replace(/\D/g, ""))).size;
}
/** Fill {{1}},{{2}}… in a WA body with sample values, in the mapped-token order. */
function fillWaPreview(body: string, waVariables: string[] | null | undefined): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, d) => {
    const tok = (waVariables ?? [])[Number(d) - 1];
    return tok ? (SAMPLE_VARS[tok] ?? `{{${d}}}`) : `{{${d}}}`;
  });
}

const EMPTY_PLAN: CommTemplateVM = { id: 0, name: "", language: "hi", promoType: "General", segment: "REGULAR", segments: [], priority: 5, medium: "WhatsApp", offer: "", timingLabel: "", template: "", dltTemplateId: "", waTemplateName: "", waLanguage: "", waVariables: [], smsVariables: [] };

function CommPlanTab({ templates, templateVars }: { templates: CommTemplateVM[]; templateVars: TemplateVarHint[] }) {
  const [rows, setRows] = useState(templates);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<CommTemplateVM | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  // Filters: medium · promotion type · language
  const [fMedium, setFMedium] = useState("All");
  const [fPromo, setFPromo] = useState("");
  const [fLang, setFLang] = useState("");

  const shown = rows.filter((r) =>
    (fMedium === "All" || r.medium.toLowerCase().includes(fMedium.toLowerCase())) &&
    (!fPromo || r.promoType === fPromo) &&
    (!fLang || r.language === fLang));

  const save = () => {
    if (!draft) return;
    // Lock SMS/WhatsApp to a picked template — no plan can be saved without one.
    const med = draft.medium || "WhatsApp";
    if (med === "SMS" && !(draft.dltTemplateId ?? "").trim()) { setErr("Pick an approved DLT template for this SMS plan."); return; }
    if (med === "WhatsApp" && !(draft.waTemplateName ?? "").trim()) { setErr("Pick an approved WhatsApp template for this plan."); return; }
    setErr(null);
    start(async () => {
      const patch = { name: draft.name, language: draft.language, promoType: draft.promoType, segments: draft.segments, medium: draft.medium, offer: draft.offer, timingLabel: draft.timingLabel, template: draft.template, dltTemplateId: (draft.dltTemplateId ?? "").trim() || null, waTemplateName: (draft.waTemplateName ?? "").trim() || null, waLanguage: (draft.waLanguage ?? "").trim() || null, waVariables: draft.waVariables ?? [], smsVariables: draft.smsVariables ?? [] };
      if (adding) {
        const res = await createCommTemplate(patch);
        if (res.ok && res.id != null) { setRows((r) => [...r, { ...draft, id: res.id! }]); setAdding(false); setDraft(null); }
        else setErr(res.error ?? "Failed");
      } else {
        const res = await saveCommTemplate(draft.id, patch);
        if (res.ok) { setRows((r) => r.map((x) => (x.id === draft.id ? draft : x))); setEditing(null); setDraft(null); }
        else setErr(res.error ?? "Failed");
      }
    });
  };
  const remove = (id: number) =>
    start(async () => { const res = await deleteCommTemplate(id); if (res.ok) setRows((r) => r.filter((x) => x.id !== id)); });
  const askRemove = async (t: CommTemplateVM) => {
    if (await confirm({ title: "Delete this comm plan?", confirmLabel: "Delete comm plan", message: <><b>{t.name || "This comm plan"}</b> will be permanently removed. Campaigns tagged with it lose that template. This can’t be undone.</> })) remove(t.id);
  };
  // Approved Meta template names (templateVars are already filtered to APPROVED on the server).
  const approvedNames = new Set(templateVars.map((v) => v.name));

  return (
    <div className="flex flex-col gap-3.5">
      {dialog}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[12.5px] text-[#757575]">Reusable message templates — campaigns are tagged with one or more of these by name. Slots like <b>[name]</b>, <b>[crop]</b>, <b>[Store]</b>, <b>[village]</b>, <b>[number]</b>, <b>[date]</b>, <b>[coupon]</b> fill per customer.</div>
        <button type="button" onClick={() => { setAdding(true); setEditing(null); setDraft({ ...EMPTY_PLAN }); setErr(null); }}
          className="ml-auto rounded-[10px] bg-[#678722] px-4 py-2 text-[13px] font-semibold text-white">+ New comm plan</button>
      </div>

      {/* Filters */}
      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">Filter:</span>
        {MEDIUM_CHIPS.map((m) => (
          <button key={m} type="button" onClick={() => setFMedium(m)}
            className="rounded-full border-[1.5px] px-3 py-1 text-[11.5px] font-semibold"
            style={{ background: fMedium === m ? "#678722" : "#fff", color: fMedium === m ? "#fff" : "#616161", borderColor: fMedium === m ? "#678722" : "#E0E0E0" }}>{m}</button>
        ))}
        <select value={fPromo} onChange={(e) => setFPromo(e.target.value)} className="rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[12px] text-[#424242]">
          <option value="">All promotions</option>
          {PROMO_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={fLang} onChange={(e) => setFLang(e.target.value)} className="rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[12px] text-[#424242]">
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="hi">हिंदी</option>
        </select>
        <span className="text-[11.5px] text-[#9E9E9E]">{shown.length} of {rows.length} plans</span>
      </div>

      {/* New plan */}
      {adding && draft && (
        <div className={`${CARD} border-l-4 border-l-[#678722] p-[18px]`}>
          <div className="mb-2 text-[13px] font-bold text-[#1A1C1A]">New comm plan</div>
          <CommPlanForm draft={draft} setDraft={setDraft} />
          {err && <div className="mt-2 text-[12px] text-[#C62828]">{err}</div>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} disabled={saving || !draft.name.trim()} className="rounded-[10px] bg-[#678722] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Create plan"}</button>
            <button type="button" onClick={() => { setAdding(false); setDraft(null); }} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
          </div>
        </div>
      )}

      {shown.length === 0 && !adding && <div className={`${CARD} px-4 py-10 text-center text-[13px] text-[#9E9E9E]`}>No comm plans match these filters.</div>}
      {shown.map((t) => {
        const isEditing = editing === t.id;
        const cur = isEditing && draft ? draft : t;
        const segs = cur.segments;
        const m = segMeta(segs[0] ?? "OTHER"); // left-border tint from the first target (neutral when All)
        return (
          <div key={t.id} className={`${CARD} p-[18px]`} style={{ borderLeft: `4px solid ${segs.length ? m.color : "#B0BEC5"}` }}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-bold text-[#1A1C1A]">{cur.name || "(unnamed)"}</span>
              {segs.length === 0
                ? <span className="rounded-full bg-[#ECEFF1] px-2.5 py-0.5 text-[10px] font-bold text-[#546E7A]">All segments</span>
                : segs.map((s) => { const sm = segMeta(s); return <span key={s} className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>; })}
              <span className="rounded-full bg-[#E3F2FD] px-2 py-0.5 text-[10px] font-semibold text-[#1565C0]">{LANG_LABEL[cur.language] ?? cur.language}</span>
              <span className="rounded-full bg-[#F3E5F5] px-2 py-0.5 text-[10px] font-semibold text-[#6A1B9A]">{cur.promoType}</span>
              <span className="text-[11.5px] text-[#616161]">{cur.medium}</span>
              <span className="text-[11.5px] text-[#9E9E9E]">· {cur.timingLabel}</span>
              {/* WhatsApp plans: which approved Meta template is selected (created in Settings). */}
              {t.medium === "WhatsApp" && (
                t.waTemplateName && approvedNames.has(t.waTemplateName)
                  ? <span className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[10px] font-bold text-[#678722]">✓ WA approved</span>
                  : t.waTemplateName
                    ? <span className="rounded-full bg-[#FEF6E9] px-2 py-0.5 text-[10px] font-bold text-[#8D6E00]">⏳ WA pending</span>
                    : <span className="rounded-full bg-[#FDECEA] px-2 py-0.5 text-[10px] font-bold text-[#C62828]">⚠ No template</span>
              )}
              {/* SMS plans: DLT template attached? */}
              {t.medium === "SMS" && (
                t.dltTemplateId
                  ? <span className="rounded-full bg-[#EDE7F6] px-2 py-0.5 text-[10px] font-bold text-[#6A1B9A]">DLT set</span>
                  : <span className="rounded-full bg-[#FDECEA] px-2 py-0.5 text-[10px] font-bold text-[#C62828]">⚠ No DLT template</span>
              )}
              <div className="ml-auto flex items-center gap-3">
                <button type="button" onClick={() => { setEditing(isEditing ? null : t.id); setAdding(false); setDraft({ ...t }); setErr(null); }}
                  className="text-[12px] font-semibold text-[#678722] hover:underline">{isEditing ? "Cancel" : "Edit"}</button>
                <button type="button" onClick={() => askRemove(t)} disabled={saving} className="text-[12px] font-semibold text-[#C62828] hover:underline disabled:opacity-50">Delete</button>
              </div>
            </div>
            {isEditing && draft ? (
              <>
                <CommPlanForm draft={draft} setDraft={setDraft} />
                {err && <div className="mt-2 text-[12px] text-[#C62828]">{err}</div>}
                <button type="button" onClick={save} disabled={saving || !draft.name.trim()} className="mt-3 self-start rounded-[10px] bg-[#678722] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
              </>
            ) : (
              <>
                <div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Offer</div>
                <div className="mb-2 text-[12.5px] text-[#424242]">{cur.offer}</div>
                <div className="rounded-[10px] bg-[#FAFFF9] border border-[#F3F8E6] p-3 text-[12.5px] leading-[1.6] text-[#33691E]">{cur.template}</div>
                <div className="mt-2 text-[10px] font-bold uppercase text-[#9E9E9E]">Preview (sample customer)</div>
                <div className="mt-1 rounded-[10px] bg-[#F5F7F5] p-3 text-[12.5px] italic leading-[1.6] text-[#424242]">{samplePreview(cur)}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════ Campaigns + tracking (WF4) ══════════════════ */
function CampaignsTab({ campaigns, projects, canManage, initialProjectId, commPlanNames, templates, crops }: { campaigns: CampaignListItem[]; projects: ProjectVM[]; canManage: boolean; initialProjectId?: number; commPlanNames: string[]; templates: CommTemplateVM[]; crops: CropOption[] }) {
  // Chain: arriving via /campaigns?forProject=<id> opens the create form with that project preselected.
  const initialProject = initialProjectId != null ? projects.find((p) => p.id === initialProjectId) ?? null : null;
  const defaultProject = initialProject ?? projects[0] ?? null;
  const router = useRouter();
  // Render the server prop directly (no snapshot state) so router.refresh() shows the new campaign.
  const list = campaigns;
  const [creating, setCreating] = useState(canManage && initialProject != null);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<number | null>(defaultProject?.id ?? null);
  const [clusterId, setClusterId] = useState<number | null>(null); // null = whole project
  const [commPlans, setCommPlans] = useState<string[]>([]); // every campaign must be tagged with ≥1 comm plan (by name)
  const [startDate, setStart] = useState(defaultProject?.startDate ?? "");
  const [endDate, setEnd] = useState(defaultProject?.endDate ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [trackerOf, setTrackerOf] = useState<CampaignListItem | null>(null);
  const [tracker, setTracker] = useState<CampaignTracker | null>(null);
  const [analyticsOf, setAnalyticsOf] = useState<CampaignListItem | null>(null);
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [membersOf, setMembersOf] = useState<CampaignListItem | null>(null);
  const [members, setMembers] = useState<CampaignMemberVM[] | null>(null);
  const [memberPage, setMemberPage] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false); // admin mass-send panel
  const [bcReload, setBcReload] = useState(0); // bump to refresh broadcast history after a run
  const [historyOf, setHistoryOf] = useState<CampaignListItem | null>(null); // broadcast history modal from a card
  const [focusCurrent, setFocusCurrent] = useState<CampaignMemberVM | null>(null); // Focus view's current farmer → drives the script panel
  const [extendOf, setExtendOf] = useState<CampaignListItem | null>(null);
  const [editOf, setEditOf] = useState<CampaignListItem | null>(null);
  const [phasesOf, setPhasesOf] = useState<CampaignListItem | null>(null); // manager phase setup/board
  const [phaseOutreachOf, setPhaseOutreachOf] = useState<CampaignListItem | null>(null); // phase-routed outreach (all roles)

  // The comm-plan scripts tagged to the open campaign (by name) — shown as the outreach left panel.
  const scripts = membersOf ? templates.filter((t) => membersOf.commPlans.includes(t.name)) : [];

  const project = projects.find((p) => p.id === projectId) ?? null;
  const audience = clusterId ? project?.clusters.find((c) => c.id === clusterId)?.count ?? 0 : project?.audienceCount ?? 0;

  const pickProject = (id: number) => {
    const p = projects.find((x) => x.id === id) ?? null;
    setProjectId(id); setClusterId(null);
    setStart(p?.startDate ?? ""); setEnd(p?.endDate ?? "");
  };

  const toggleCommPlan = (p: string) =>
    setCommPlans((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const submit = () => {
    if (!projectId) { setMsg("Pick a project first."); return; }
    if (!name.trim()) { setMsg("Name the campaign."); return; }
    if (commPlans.length === 0) { setMsg("Tag at least one comm plan."); return; }
    setMsg(null);
    start(async () => {
      const res = await createCampaign({ name, startDate, endDate, projectId, clusterId, commPlans });
      if (res.ok) {
        setMsg(`Created "${name}" · ${n(res.members ?? 0)} enrolled${res.skipped ? ` · ${n(res.skipped)} skipped (already in another campaign of this project)` : ""}.`);
        // Close + reset the form, then soft-refresh so the new campaign appears in the list.
        setCreating(false);
        setName(""); setClusterId(null); setCommPlans([]);
        // Drop ?forProject= — otherwise the chain deep link re-opens the form on refresh.
        if (initialProjectId != null) router.replace("/campaigns");
        router.refresh();
      } else setMsg(res.error ?? "Failed");
    });
  };
  const openTracker = (c: CampaignListItem) => { setTrackerOf(c); setTracker(null); getCampaignTracker(c.id).then(setTracker); };
  const openAnalytics = (c: CampaignListItem) => { setAnalyticsOf(c); setAnalytics(null); getCampaignAnalytics(c.id).then(setAnalytics); };
  const openMembers = (c: CampaignListItem) => { setMembersOf(c); setMembers(null); setMemberPage(0); setFocusMode(false); getCampaignMembers(c.id).then(setMembers); };
  const patchMember = (u: CampaignMemberVM) => setMembers((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] text-[#757575]">
          {canManage
            ? "Run a campaign on a project (all its clusters) or one cluster inside it. Farmers already in another campaign of the same project are skipped — no double-contact."
            : "Your campaigns — showing only the farmers enrolled from your store / district."}
        </div>
        {canManage && <button type="button" onClick={() => setCreating((v) => !v)} disabled={projects.length === 0} className="rounded-[10px] bg-[#678722] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{creating ? "Close" : "+ New campaign"}</button>}
      </div>

      {canManage && projects.length === 0 && (
        <div className="mb-3 rounded-[10px] border border-[#F5CE8E] bg-[#FEF6E9] px-3.5 py-2.5 text-[12.5px] text-[#8D6E00]">
          Create a project first (Projects page) — campaigns run on a project or one of its clusters.
        </div>
      )}

      {canManage && creating && project && (
        <div className={`${CARD} mb-4 p-[18px]`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Name</label><input className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kharif HNI Push" /></div>
            <div><label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Start</label><input type="date" min={project.startDate ?? undefined} max={project.endDate ?? undefined} className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={startDate} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">End</label><input type="date" min={startDate || project.startDate || undefined} max={project.endDate ?? undefined} className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={endDate} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Project</label>
              <select className="mt-1 w-full rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-2 text-[13px]" value={projectId ?? ""} onChange={(e) => pickProject(Number(e.target.value))}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.startDate ? ` (${p.startDate} → ${p.endDate})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Scope</label>
              <select className="mt-1 w-full rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-2 text-[13px]" value={clusterId ?? ""} onChange={(e) => setClusterId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Whole project ({project.clusters.length} clusters)</option>
                {project.clusters.map((c) => <option key={c.id} value={c.id}>{c.name} · {n(c.count)}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-[#9E9E9E]">Campaign dates must fall within the project window{project.endDate ? ` (${project.startDate} → ${project.endDate})` : ""}. To run past the project end, extend the project first.</div>
          {/* Required: every campaign is tagged with one or more comm plans (by name) */}
          <div className="mt-3">
            <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Comm plans <span className="normal-case text-[#C62828]">*</span> — tag one or more</label>
            {commPlanNames.length === 0 ? (
              <div className="mt-1 rounded-[10px] border border-[#F5CE8E] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">No comm plans yet — create one on the Comm Plan tab first.</div>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {commPlanNames.map((p) => {
                  const on = commPlans.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => toggleCommPlan(p)}
                      className="rounded-full border-[1.5px] px-3 py-1 text-[11.5px] font-semibold"
                      style={{ background: on ? "#678722" : "#fff", color: on ? "#fff" : "#616161", borderColor: on ? "#678722" : "#E0E0E0" }}>
                      {on ? "✓ " : ""}{p}
                    </button>
                  );
                })}
              </div>
            )}
            {commPlans.length > 0 && <div className="mt-1 text-[11px] text-[#678722]">{commPlans.length} tagged</div>}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-[10px] bg-[#F5F7F5] px-4 py-3">
            <div className="text-[12px] text-[#616161]">Audience {clusterId ? "(cluster)" : "(project, de-duplicated)"} · before cross-campaign de-dup</div>
            <div className="text-[18px] font-bold text-[#678722]">{n(audience)}</div>
          </div>
          <button type="button" onClick={submit} disabled={pending || !name.trim() || commPlans.length === 0} className="mt-4 rounded-[10px] bg-[#678722] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{pending ? "Creating…" : "Create & enrol"}</button>
        </div>
      )}
      {msg && <div className="mb-3 rounded-[10px] border border-[#D3E4AB] bg-[#F3F8E6] px-3.5 py-2.5 text-[12.5px] font-medium text-[#678722]">{msg}</div>}

      <div className={`${CARD} overflow-hidden`}>
        {list.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[#9E9E9E]">{canManage ? "No campaigns yet." : "No campaigns assigned to your store / district yet."}</div>
        ) : list.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-[#F5F5F5] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold text-[#1A1C1A]">{c.name}</div>
              <div className="text-[11.5px] text-[#9E9E9E]">{c.startDate} → {c.endDate} · {c.target}</div>
              {c.commPlans.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.commPlans.map((p) => (
                    <span key={p} className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[10px] font-semibold text-[#678722]">💬 {p}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-[12px] text-[#616161]">{n(c.members)} farmers</div>
            <button type="button" onClick={() => openMembers(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#1565C0] hover:bg-[#E3F2FD]">{canManage ? "Farmers" : "Contact"}</button>
            <button type="button" onClick={() => openAnalytics(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#00838F] hover:bg-[#E0F7FA]">Analytics</button>
            <button type="button" onClick={() => setPhaseOutreachOf(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#1565C0] hover:bg-[#E3F2FD]">⏱ Round</button>
            {canManage && <button type="button" onClick={() => setPhasesOf(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#E65100] hover:bg-[#FFF3E0]">⚙ Round setup</button>}
            {canManage && <button type="button" onClick={() => openTracker(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#678722] hover:bg-[#F3F8E6]">Campaign Tracker</button>}
            {canManage && <button type="button" onClick={() => setEditOf(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#455A64] hover:bg-[#ECEFF1]">✎ Edit</button>}
            {canManage && <button type="button" onClick={() => setExtendOf(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#6A1B9A] hover:bg-[#F3E5F5]">Extend</button>}
            {canManage && <button type="button" onClick={() => setHistoryOf(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#0B8A3D] hover:bg-[#F3F8E6]">📣 Broadcasts</button>}
          </div>
        ))}
      </div>

      {/* Scoped contact list — outreach (TEST group): list view + one-at-a-time Focus mode */}
      <Modal open={membersOf != null} onClose={() => { setMembersOf(null); setFocusMode(false); setFocusCurrent(null); }} className="max-w-[1180px]">
        {membersOf && (
          <>
            <ModalHeader eyebrow="Campaign · outreach" eyebrowColor="#1565C0" title={membersOf.name}
              subtitle={canManage ? "Contact list (test group)" : "Your farmers — call, then log how you reached them"} onClose={() => { setMembersOf(null); setFocusMode(false); setFocusCurrent(null); }} />
            <div className="px-5 py-4">
              {members == null ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">Loading…</div>
                : members.length === 0 ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">No farmers to contact here.</div>
                : (
                  <div className="flex flex-col gap-4 lg:max-h-[74vh] lg:flex-row">
                    {scripts.length > 0 && (
                      <ScriptPanel scripts={scripts} member={focusMode ? focusCurrent : null}
                        className="lg:w-[330px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-[#F0F0F0] lg:pr-4" />
                    )}
                    <div className="min-w-0 flex-1 lg:overflow-y-auto">
                    <OutreachProgress members={members} />
                    {canManage && <BroadcastHistory campaignId={membersOf.id} reloadKey={bcReload} />}
                    <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12px] text-[#757575]">{focusMode ? "Focus mode — one farmer at a time" : "Work the list, switch to Focus mode, or open the full-page matrix."}</div>
                      <div className="flex flex-wrap gap-2">
                        {canManage && (
                          <button type="button" onClick={() => setBroadcasting(true)}
                            className="rounded-[10px] bg-[#0B8A3D] px-4 py-2 text-[12.5px] font-bold text-white">📣 Mass send</button>
                        )}
                        <Link href={`/campaigns/${membersOf.id}/outreach`}
                          className="rounded-[10px] bg-[#6A1B9A] px-4 py-2 text-[12.5px] font-bold text-white">⛶ Matrix view</Link>
                        <button type="button" onClick={() => setFocusMode((v) => !v)}
                          className="rounded-[10px] px-4 py-2 text-[12.5px] font-bold text-white" style={{ background: focusMode ? "#616161" : "#1565C0" }}>
                          {focusMode ? "← Back to list" : "▶ Focus mode"}
                        </button>
                      </div>
                    </div>
                    {focusMode
                      ? <FocusMode members={members} crops={crops} onChange={patchMember} onExit={() => setFocusMode(false)} onCurrent={setFocusCurrent} commPlans={membersOf?.commPlans ?? []} templates={templates} canSms={canManage} />
                      : (() => {
                          // List view: un-contacted first, reached/unreachable sink to the bottom.
                          const sorted = [...members].sort((a, b) => rank(a) - rank(b));
                          const PAGE = 25;
                          const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
                          const page = Math.min(memberPage, pages - 1);
                          const slice = sorted.slice(page * PAGE, page * PAGE + PAGE);
                          return (
                            <>
                              <div className="flex flex-col gap-2.5">
                                {slice.map((m) => <MemberRow key={m.id} member={m} crops={crops} onChange={patchMember} commPlans={membersOf?.commPlans ?? []} templates={templates} canSms={canManage} />)}
                              </div>
                              {pages > 1 && (
                                <div className="mt-3 flex items-center justify-center gap-3">
                                  <button type="button" onClick={() => setMemberPage(Math.max(0, page - 1))} disabled={page === 0}
                                    className="rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40">← Prev</button>
                                  <span className="text-[12px] text-[#757575]">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, sorted.length)} of {n(sorted.length)}</span>
                                  <button type="button" onClick={() => setMemberPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}
                                    className="rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40">Next →</button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                    </div>
                  </div>
                )}
            </div>
          </>
        )}
      </Modal>

      {/* Campaign Tracker (managers only) */}
      <Modal open={trackerOf != null} onClose={() => setTrackerOf(null)} className="max-w-[840px]">
        {trackerOf && (
          <>
            <ModalHeader eyebrow="Campaign Tracker" eyebrowColor="#678722" title={trackerOf.name} subtitle="Outreach reach · real attributed revenue · test vs control uplift" onClose={() => setTrackerOf(null)} />
            <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
              {tracker == null ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">Loading…</div> : <TrackerBody t={tracker} />}
            </div>
          </>
        )}
      </Modal>

      {/* Campaign audience Analytics — composition + unique farmer list */}
      <Modal open={analyticsOf != null} onClose={() => setAnalyticsOf(null)} className="max-w-[980px]">
        {analyticsOf && (
          <>
            <ModalHeader eyebrow="Campaign · audience analytics" eyebrowColor="#00838F" title={analyticsOf.name}
              subtitle="Who's enrolled — composition by segment, store, village & crop" onClose={() => setAnalyticsOf(null)} />
            <div className="max-h-[74vh] overflow-y-auto px-5 py-4">
              {analytics == null ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">Loading…</div> : <AnalyticsBody a={analytics} campaign={analyticsOf} />}
            </div>
          </>
        )}
      </Modal>

      {extendOf && <ExtendModal campaign={extendOf} project={projects.find((p) => p.id === projectId) ?? null} onClose={() => setExtendOf(null)} />}
      {editOf && <EditCommPlansModal campaign={editOf} commPlanNames={commPlanNames} onClose={() => setEditOf(null)} />}
      {phasesOf && (
        <PhasesPanel campaignId={phasesOf.id} campaignName={phasesOf.name} campaignStart={phasesOf.startDate} campaignEnd={phasesOf.endDate}
          commPlanNames={phasesOf.commPlans ?? []}
          commPlanMediums={Object.fromEntries(templates.map((t) => [t.name, t.medium]))}
          onClose={() => setPhasesOf(null)} />
      )}
      {phaseOutreachOf && (
        <PhaseOutreachPanel campaignId={phaseOutreachOf.id} campaignName={phaseOutreachOf.name} onClose={() => setPhaseOutreachOf(null)} />
      )}
      {broadcasting && membersOf && (
        <BroadcastPanel campaignId={membersOf.id} campaignName={membersOf.name} commPlans={membersOf.commPlans ?? []} templates={templates} onClose={() => { setBroadcasting(false); setBcReload((k) => k + 1); }} />
      )}
      {historyOf && (
        <Modal open onClose={() => setHistoryOf(null)} className="max-w-[720px]">
          <ModalHeader eyebrow="Campaign · broadcasts" eyebrowColor="#0B8A3D" title={historyOf.name} subtitle="Past mass-sends (SMS / WhatsApp)" onClose={() => setHistoryOf(null)} />
          <div className="px-5 py-4"><BroadcastHistory campaignId={historyOf.id} defaultOpen /></div>
        </Modal>
      )}
    </div>
  );
}

function ExtendModal({ campaign, project, onClose }: { campaign: CampaignListItem; project: ProjectVM | null; onClose: () => void }) {
  const [end, setEnd] = useState(campaign.endDate);
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    setErr(null);
    start(async () => {
      const res = await extendCampaign(campaign.id, end);
      if (res.ok) location.reload(); else setErr(res.error ?? "Failed");
    });
  };
  return (
    <Modal open onClose={onClose} className="max-w-[440px]">
      <ModalHeader eyebrow="Extend campaign" eyebrowColor="#6A1B9A" title={campaign.name} subtitle={`Currently ends ${campaign.endDate}`} onClose={onClose} />
      <div className="px-5 py-4">
        <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">New end date</label>
        <input type="date" min={campaign.endDate} max={project?.endDate ?? undefined} className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={end} onChange={(e) => setEnd(e.target.value)} />
        <div className="mt-1 text-[11px] text-[#9E9E9E]">Can't go past the project end. To extend further, extend the project first (Projects page).</div>
        {err && <div className="mt-2 text-[12px] text-[#C62828]">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-[10px] bg-[#6A1B9A] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Extending…" : "Extend"}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Edit which comm plans a campaign is tagged with — add/remove by toggling; must keep at least one. */
function EditCommPlansModal({ campaign, commPlanNames, onClose }: { campaign: CampaignListItem; commPlanNames: string[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(campaign.commPlans ?? []);
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, startDel] = useTransition();
  const del = () => {
    setErr(null);
    startDel(async () => {
      const res = await deleteCampaign(campaign.id);
      if (res.ok) location.reload(); else setErr(res.error ?? "Delete failed");
    });
  };
  const toggle = (p: string) => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  // Show every known comm plan, plus any the campaign already has that no longer exist in the catalog.
  const options = [...new Set([...commPlanNames, ...(campaign.commPlans ?? [])])].sort((a, b) => a.localeCompare(b));
  const save = () => {
    setErr(null);
    start(async () => {
      const res = await updateCampaignCommPlans(campaign.id, selected);
      if (res.ok) location.reload(); else setErr(res.error ?? "Failed");
    });
  };
  return (
    <Modal open onClose={onClose} className="max-w-[520px]">
      <ModalHeader eyebrow="Edit campaign · comm plans" eyebrowColor="#455A64" title={campaign.name} subtitle="Add or remove the comm plans this campaign is tagged with" onClose={onClose} />
      <div className="px-5 py-4">
        <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Comm plans <span className="normal-case text-[#C62828]">*</span> — tag one or more</label>
        {options.length === 0 ? (
          <div className="mt-1 rounded-[10px] border border-[#F5CE8E] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">No comm plans yet — create one on the Comm Plan tab first.</div>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {options.map((p) => {
              const on = selected.includes(p);
              return (
                <button key={p} type="button" onClick={() => toggle(p)}
                  className="rounded-full border-[1.5px] px-3 py-1 text-[11.5px] font-semibold"
                  style={{ background: on ? "#678722" : "#fff", color: on ? "#fff" : "#616161", borderColor: on ? "#678722" : "#E0E0E0" }}>
                  {on ? "✓ " : ""}{p}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-1 text-[11px] text-[#678722]">{selected.length} tagged</div>
        {err && <div className="mt-2 text-[12px] text-[#C62828]">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
          <button type="button" onClick={save} disabled={saving || selected.length === 0} className="rounded-[10px] bg-[#678722] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save comm plans"}</button>
        </div>

        {/* Danger zone — delete the whole campaign (two-step confirm) */}
        <div className="mt-5 rounded-[12px] border border-[#F2C4C4] bg-[#FDF3F3] p-3.5">
          {!confirmDel ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12.5px] font-bold text-[#B71C1C]">Delete this campaign</div>
                <div className="text-[11.5px] text-[#8E5252]">Permanently removes the campaign, its {inr(campaign.members)} members and outreach. Message logs are kept.</div>
              </div>
              <button type="button" onClick={() => setConfirmDel(true)} className="shrink-0 rounded-[10px] border-[1.5px] border-[#C62828] px-3.5 py-1.5 text-[12px] font-semibold text-[#C62828] hover:bg-[#FDECEA]">Delete…</button>
            </div>
          ) : (
            <div>
              <div className="text-[12.5px] font-bold text-[#B71C1C]">Delete “{campaign.name}” permanently?</div>
              <div className="mt-0.5 text-[11.5px] text-[#8E5252]">This can’t be undone. {inr(campaign.members)} members and all outreach state will be removed.</div>
              <div className="mt-2.5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmDel(false)} disabled={deleting} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] disabled:opacity-50">Keep it</button>
                <button type="button" onClick={del} disabled={deleting} className="rounded-[10px] bg-[#C62828] px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#B71C1C] disabled:opacity-50">{deleting ? "Deleting…" : "Yes, delete permanently"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Outreach: approach tiles, status, phone, progress, list row + Focus mode ──
   (exported pieces are shared with the full-page Matrix view, OutreachMatrix.tsx) */
export const APPROACH_TILES: { key: string; label: string; color: string; bg: string }[] = [
  { key: "CALL", label: "Call", color: "#1565C0", bg: "#E3F2FD" },
  { key: "WHATSAPP", label: "WhatsApp", color: "#516A1B", bg: "#F3F8E6" },
  { key: "SMS", label: "SMS", color: "#6A1B9A", bg: "#F3E5F5" },
  { key: "IN_PERSON", label: "In-person", color: "#E65100", bg: "#FFF3E0" },
];
export const UNREACHABLE_TILE = { color: "#C62828", bg: "#FDECEA" };
const APPROACH_KEYS = APPROACH_TILES.map((t) => t.key);
/** True if the outcome set contains at least one real approach (⇒ reached). */
export function isApproach(meds: string[]): boolean { return meds.some((m) => APPROACH_KEYS.includes(m)); }
export function mediumLabel(k: string): string { return APPROACH_TILES.find((t) => t.key === k)?.label ?? k; }
/** "Call + WhatsApp" — approaches in tile order, for badges. */
export function mediumsLabel(meds: string[]): string {
  return APPROACH_TILES.filter((t) => meds.includes(t.key)).map((t) => t.label).join(" + ");
}
/** Toggle one outcome in the set: approaches are multi-select; Unreachable is exclusive. */
export function toggleMedium(meds: string[], key: string): string[] {
  if (key === "UNREACHABLE") return meds.includes("UNREACHABLE") ? [] : ["UNREACHABLE"];
  const rest = meds.filter((m) => m !== "UNREACHABLE"); // picking an approach clears Unreachable
  return rest.includes(key) ? rest.filter((m) => m !== key) : [...rest, key];
}
/** Stable key for change detection (order-insensitive). */
export function medKey(meds: string[]): string { return [...meds].sort().join(","); }
export function statusOf(m: CampaignMemberVM): "reached" | "unreachable" | "pending" {
  if (m.reached) return "reached";
  if (m.mediums.includes("UNREACHABLE")) return "unreachable";
  return "pending";
}
/** Sort order for the list — un-contacted first, unreachable next, reached last. */
export function rank(m: CampaignMemberVM): number { const s = statusOf(m); return s === "pending" ? 0 : s === "unreachable" ? 1 : 2; }
/** Normalise an Indian mobile to its last 10 digits for tel:/wa.me links (null if not a usable number). */
export function digits10(mobile: string | null): string | null {
  if (!mobile) return null;
  const d = mobile.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

export function StatusBadge({ member }: { member: CampaignMemberVM }) {
  const s = statusOf(member);
  const who = member.reachedBy ? ` · by ${member.reachedBy}` : "";
  const audit = member.reachedBy ? `Recorded by ${member.reachedBy}${member.reachedByCode ? ` (${member.reachedByCode})` : ""}${member.reachedAt ? ` on ${member.reachedAt}` : ""}` : undefined;
  if (s === "reached")
    return <span title={audit} className="rounded-full bg-[#F3F8E6] px-2.5 py-0.5 text-[10px] font-semibold text-[#678722]">✓ Reached{mediumsLabel(member.mediums) ? ` · ${mediumsLabel(member.mediums)}` : ""}{member.reachedAt ? ` · ${member.reachedAt}` : ""}{who}</span>;
  if (s === "unreachable")
    return <span title={audit} className="rounded-full bg-[#FDECEA] px-2.5 py-0.5 text-[10px] font-semibold text-[#C62828]">Unreachable{member.reachedAt ? ` · ${member.reachedAt}` : ""}{who}</span>;
  return null;
}

/** Prominent, tappable phone number — what officers dial from. Everyone gets Call + the manual
 *  wa.me WhatsApp chat link; only admins get the API send controls (`extra`: SMS / WA API). */
function PhoneBlock({ mobile, big, extra }: { mobile: string | null; big?: boolean; extra?: ReactNode }) {
  const d10 = digits10(mobile);
  if (!d10) return (
    <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-[#FEF6E9] px-4 py-3">
      <span className="text-[13px] font-semibold text-[#8D6E00]">No phone number on file</span>
      {extra && <div className="ml-auto flex gap-2">{extra}</div>}
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-[#F5F8FF] px-4 py-3">
      <a href={`tel:+91${d10}`} className={`flex items-center gap-2 font-bold leading-none tracking-wide text-[#0D47A1] hover:underline ${big ? "text-[32px]" : "text-[24px]"}`}>
        <span className={big ? "text-[24px]" : "text-[18px]"}>📞</span>{mobile}
      </a>
      <div className="ml-auto flex flex-wrap gap-2">
        <a href={`tel:+91${d10}`} className={`rounded-[10px] bg-[#1565C0] font-bold text-white ${big ? "px-5 py-3 text-[14px]" : "px-4 py-2.5 text-[13px]"}`}>Call</a>
        <a href={`https://wa.me/91${d10}`} target="_blank" rel="noopener noreferrer" className={`rounded-[10px] bg-[#1B8A4B] font-bold text-white ${big ? "px-5 py-3 text-[14px]" : "px-4 py-2.5 text-[13px]"}`}>WhatsApp</a>
        {extra}
      </div>
    </div>
  );
}

/** Approach tiles (Call/WhatsApp/SMS/In-person) — MULTI-select — + a right-aligned exclusive Unreachable tile.
 *  Emits the tapped KEY; the parent applies it with a functional update so two fast taps can't drop one. */
function ApproachPicker({ value, onToggle, disabled }: { value: string[]; onToggle: (key: string) => void; disabled?: boolean }) {
  const unreachable = value.includes("UNREACHABLE");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase text-[#757575]">How did you reach them? <span className="normal-case text-[#9E9E9E]">(pick all that apply)</span></span>
      {APPROACH_TILES.map((t) => { const on = value.includes(t.key); return (
        <button key={t.key} type="button" disabled={disabled} onClick={() => onToggle(t.key)}
          className="rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
          style={{ background: on ? t.bg : "#fff", color: on ? t.color : "#616161", borderColor: on ? t.color : "#DADADA" }}>{on ? "✓ " : ""}{t.label}</button>
      ); })}
      <button type="button" disabled={disabled} onClick={() => onToggle("UNREACHABLE")}
        className="ml-auto rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
        style={{ background: unreachable ? UNREACHABLE_TILE.bg : "#fff", color: unreachable ? UNREACHABLE_TILE.color : "#9E9E9E", borderColor: unreachable ? UNREACHABLE_TILE.color : "#E0E0E0" }}>
        Unreachable
      </button>
    </div>
  );
}

/* ── Interest response: Interested · Not interested · Wants another crop (+ crop) ── */
export const RESPONSE_TILES: { key: string; label: string; color: string; bg: string }[] = [
  { key: "INTERESTED", label: "Interested", color: "#516A1B", bg: "#F3F8E6" },
  { key: "NOT_INTERESTED", label: "Not interested", color: "#C62828", bg: "#FDECEA" },
  { key: "OTHER_CROP", label: "Wants another crop", color: "#E65100", bg: "#FFF3E0" },
];
export function responseLabel(k: string | null): string { return RESPONSE_TILES.find((t) => t.key === k)?.label ?? ""; }
/** reached = any channel OR any interest response — mirrors the server's derivation. */
export function isReached(mediums: string[], response: string | null): boolean { return isApproach(mediums) || response != null; }

/** The 3 response tiles + a crop dropdown that appears only for "Wants another crop". Single-select. */
export function ResponsePicker({ value, crop, crops, onPick, onCrop, disabled, compact }: {
  value: string | null; crop: string | null; crops: CropOption[]; onPick: (k: string | null) => void; onCrop: (c: string) => void; disabled?: boolean; compact?: boolean;
}) {
  const pad = compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-[12.5px]";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!compact && <span className="text-[11px] font-semibold uppercase text-[#757575]">What did they say?</span>}
      {RESPONSE_TILES.map((t) => { const on = value === t.key; return (
        <button key={t.key} type="button" disabled={disabled} onClick={() => onPick(on ? null : t.key)}
          className={`rounded-full border-[1.5px] font-semibold disabled:opacity-50 ${pad}`}
          style={{ background: on ? t.bg : "#fff", color: on ? t.color : "#616161", borderColor: on ? t.color : "#DADADA" }}>{on ? "✓ " : ""}{t.label}</button>
      ); })}
      {value === "OTHER_CROP" && (
        <select value={crop ?? ""} onChange={(e) => onCrop(e.target.value)} disabled={disabled}
          className={`rounded-full border-[1.5px] border-[#E65100] bg-[#FFF8F2] font-semibold text-[#E65100] disabled:opacity-50 ${pad}`}>
          <option value="">Which crop?…</option>
          {crops.map((c) => <option key={c.crop} value={c.crop}>{cropLabel(c.crop)}</option>)}
        </select>
      )}
    </div>
  );
}

/** Small pill showing a member's recorded response (with the requested crop for "another crop"). */
export function ResponseBadge({ member }: { member: CampaignMemberVM }) {
  const t = RESPONSE_TILES.find((x) => x.key === member.response);
  if (!t) return null;
  const suffix = member.response === "OTHER_CROP" && member.responseCrop ? `: ${cropLabel(member.responseCrop)}` : "";
  return <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: t.bg, color: t.color }}>{t.label}{suffix}</span>;
}

/** Separate 📣 broadcast marker — a mass send DELIVERED to this farmer (not the same as being reached). */
export function BroadcastBadge({ member }: { member: CampaignMemberVM }) {
  const meds = member.broadcastMediums ?? [];
  if (meds.length === 0) return null;
  const label = meds.map((m) => (m === "WHATSAPP" ? "WhatsApp" : m === "SMS" ? "SMS" : m)).join(" · ");
  return <span title="Delivered via a mass send — not the same as an individual contact" className="rounded-full bg-[#F3E5F5] px-2.5 py-0.5 text-[10px] font-semibold text-[#6A1B9A]">📣 Broadcast · {label}</span>;
}

/** Reached (green) + unreachable (red) progress bar over the whole list. */
export function OutreachProgress({ members }: { members: CampaignMemberVM[] }) {
  const total = members.length;
  const reached = members.filter((m) => m.reached).length;
  const unreachable = members.filter((m) => statusOf(m) === "unreachable").length;
  const left = total - reached - unreachable;
  const broadcast = members.filter((m) => (m.broadcastMediums?.length ?? 0) > 0).length; // delivered via mass send (overlaps reached)
  const pct = (x: number) => (total ? (x / total) * 100 : 0);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className="font-semibold text-[#1A1C1A]">{n(total)} to contact</span>
        <span className="text-[#616161]"><b className="text-[#678722]">{n(reached)} reached</b>{unreachable ? <> · <b className="text-[#C62828]">{n(unreachable)} unreachable</b></> : null} · {n(left)} left{broadcast ? <> · <b className="text-[#6A1B9A]">📣 {n(broadcast)} broadcast</b></> : null}</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#EDEDED]">
        <div style={{ width: `${pct(reached)}%`, background: "#678722" }} />
        <div style={{ width: `${pct(unreachable)}%`, background: "#C62828" }} />
      </div>
    </div>
  );
}

/* ── Call scripts (comm plans tagged to the campaign) — the left-side panel across all outreach views ── */

/** The slots the officer's live context can fill; others stay as amber placeholders to read/fill on the call. */
const SCRIPT_SLOT = /(\[name\]|\[Naam\]|\[Store name\]|\[Store\]|\[number\]|\[gap\]|\[last item\]|\[date\])/gi;

/** Renders a script with its placeholders highlighted. When a member is given, [name]/[Store]/[number]
 *  are filled (green); everything else the officer supplies verbally stays amber. */
export function ScriptText({ template, member }: { template: string; member?: CampaignMemberVM | null }) {
  const nameFirst = member?.name ? member.name.trim().split(/\s+/)[0] : null;
  const fill: Record<string, string | null | undefined> = {
    "[name]": nameFirst,
    "[naam]": nameFirst,
    "[store name]": member?.store,
    "[store]": member?.store,
    "[number]": member?.mobile,
  };
  return (
    <span className="whitespace-pre-wrap">
      {template.split(SCRIPT_SLOT).map((part, i) => {
        if (!/^\[.+\]$/.test(part)) return <span key={i}>{part}</span>;
        const val = fill[part.toLowerCase()];
        return val
          ? <span key={i} className="rounded bg-[#F3F8E6] px-1 font-semibold text-[#516A1B]">{val}</span>
          : <span key={i} className="rounded bg-[#FFF3E0] px-1 font-semibold text-[#E65100]">{part}</span>;
      })}
    </span>
  );
}

/** Plain-text version (for copy) — fills known slots, leaves the rest as their label. */
function filledPlain(template: string, member?: CampaignMemberVM | null): string {
  const first = member?.name ? member.name.trim().split(/\s+/)[0] : null;
  return template
    .replace(/\[(?:name|Naam)\]/gi, first ?? "[name]")
    .replace(/\[Store name\]/gi, member?.store ?? "[Store name]")
    .replace(/\[Store\]/gi, member?.store ?? "[Store]")
    .replace(/\[number\]/gi, member?.mobile ?? "[number]");
}

function CopyScript({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}
      className="mt-1.5 text-[10.5px] font-semibold text-[#6A1B9A] hover:underline">
      {done ? "✓ Copied" : "⧉ Copy"}
    </button>
  );
}

/**
 * Left-side call-script panel: the one-or-many comm plans tagged to this campaign.
 * Pass `member` (Focus view / a specific farmer) to float their segment's script to the top,
 * fill the live slots, and flag the matching script "★ this farmer".
 */
export function ScriptPanel({ scripts, member, className = "" }: { scripts: CommTemplateVM[]; member?: CampaignMemberVM | null; className?: string }) {
  if (scripts.length === 0) return null;
  // A script matches a farmer when it targets All (no segments) or lists the farmer's segment.
  const matches = (s: CommTemplateVM) => member != null && (s.segments.length === 0 || s.segments.includes(member.segment));
  // Farmer's-segment script(s) first when a farmer is in focus; otherwise keep priority order.
  const ordered = member
    ? [...scripts].sort((a, b) => Number(matches(b)) - Number(matches(a)))
    : scripts;
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#6A1B9A]">📋 Call script{scripts.length > 1 ? "s" : ""}</div>
        <span className="rounded-full bg-[#F3E5F5] px-2 py-0.5 text-[10px] font-semibold text-[#6A1B9A]">{scripts.length}</span>
      </div>
      {member && <div className="mb-2 text-[11px] text-[#757575]">Reading to <b className="text-[#1A1C1A]">{member.name.split(/\s+/)[0]}</b> · {segMeta(member.segment).label}</div>}
      <div className="flex flex-col gap-2.5">
        {ordered.map((s) => {
          const m = segMeta(s.segments[0] ?? "OTHER");
          const mine = matches(s);
          return (
            <div key={s.id} className="rounded-[12px] border bg-white p-3"
              style={{ borderColor: mine ? m.color : "#ECECEC", borderLeftWidth: 4, borderLeftColor: m.color }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[12.5px] font-bold text-[#1A1C1A]">{s.name || "(script)"}</span>
                {mine && <span className="rounded-full bg-[#F3F8E6] px-1.5 py-0.5 text-[9px] font-bold text-[#678722]">★ THIS FARMER</span>}
              </div>
              <div className="mb-1.5 flex flex-wrap items-center gap-1">
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                <span className="rounded-full bg-[#E3F2FD] px-1.5 py-0.5 text-[9px] font-semibold text-[#1565C0]">{LANG_LABEL[s.language] ?? s.language}</span>
                <span className="rounded-full bg-[#F3E5F5] px-1.5 py-0.5 text-[9px] font-semibold text-[#6A1B9A]">{s.promoType}</span>
                {s.medium && <span className="text-[10px] text-[#9E9E9E]">{s.medium}</span>}
              </div>
              {s.offer && <div className="mb-1 text-[11px] text-[#616161]"><span className="font-semibold text-[#9E9E9E]">Offer:</span> {s.offer}</div>}
              <div className="rounded-[8px] bg-[#FAFAFA] p-2.5 text-[12.5px] leading-[1.65] text-[#33322E]">
                <ScriptText template={s.template} member={member} />
              </div>
              <CopyScript text={filledPlain(s.template, member)} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] leading-[1.5] text-[#BDBDBD]">Green = filled from this farmer · amber = fill on the call.</div>
    </div>
  );
}

/**
 * Shared per-member outreach state (channels + interest response + note), used by all 3 surfaces.
 * Keeps the two dimensions reconciled: a response clears Unreachable; Unreachable clears the response.
 */
export function useOutreach(member: CampaignMemberVM) {
  const [mediums, setMediums] = useState<string[]>(member.mediums);
  const [comment, setComment] = useState(member.comment ?? "");
  const [response, setResponse] = useState<string | null>(member.response);
  const [crop, setCrop] = useState<string | null>(member.responseCrop);

  const toggleChannel = (k: string) => {
    setMediums((cur) => toggleMedium(cur, k));
    if (k === "UNREACHABLE") { setResponse(null); setCrop(null); } // can't be unreachable AND have a response
  };
  const pickResponse = (k: string | null) => {
    setResponse(k);
    if (k !== "OTHER_CROP") setCrop(null);
    if (k) setMediums((cur) => cur.filter((m) => m !== "UNREACHABLE")); // a response ⇒ they were reached
  };

  const dirty = medKey(mediums) !== medKey(member.mediums) || comment !== (member.comment ?? "")
    || response !== member.response || (crop ?? "") !== (member.responseCrop ?? "");
  const cropMissing = response === "OTHER_CROP" && !crop;
  const effMediums = response ? mediums.filter((m) => m !== "UNREACHABLE") : mediums;
  const patch = { mediums, comment, response, responseCrop: crop };
  const optimistic = (): CampaignMemberVM => ({
    ...member, mediums: effMediums, comment: comment.trim() || null,
    response, responseCrop: response === "OTHER_CROP" ? crop : null, reached: isReached(effMediums, response),
  });
  return { mediums, comment, response, crop, setComment, setCrop, toggleChannel, pickResponse, dirty, cropMissing, patch, optimistic };
}

function MemberRow({ member, crops, onChange, commPlans, templates, canSms }: { member: CampaignMemberVM; crops: CropOption[]; onChange: (m: CampaignMemberVM) => void; commPlans: string[]; templates: CommTemplateVM[]; canSms?: boolean }) {
  const o = useOutreach(member);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const st = statusOf(member);

  const save = () => {
    if (o.cropMissing) { setErr("Pick which crop they're interested in."); return; }
    setErr(null); setSaved(false);
    start(async () => {
      const res = await markCampaignMember(member.id, o.patch);
      if (res.ok) { onChange(o.optimistic()); setSaved(true); }
      else setErr(res.error ?? "Failed");
    });
  };

  return (
    <div className="rounded-[16px] border p-4" style={{ borderColor: st === "reached" ? "#C2D98D" : st === "unreachable" ? "#EF9A9A" : "#E8E8E8", background: st === "reached" ? "#F6FFF4" : st === "unreachable" ? "#FEF6F5" : "#fff" }}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[16px] font-bold text-[#1A1C1A]">{member.name}</span>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: segMeta(member.segment).bg, color: segMeta(member.segment).color }}>{segMeta(member.segment).label}</span>
        <StatusBadge member={member} />
        <BroadcastBadge member={member} />
        <ResponseBadge member={member} />
        <span className="text-[12px] text-[#9E9E9E]">{member.village ?? "—"}{member.store ? ` · ${member.store}` : ""}</span>
      </div>
      <div className="mb-3"><PhoneBlock mobile={member.mobile} extra={canSms ? <><SmsSender member={member} commPlans={commPlans} templates={templates} onChange={onChange} /><WaSender member={member} commPlans={commPlans} templates={templates} onChange={onChange} /></> : null} /></div>
      <div className="flex flex-col gap-2.5 rounded-[12px] border border-[#EAEAEA] bg-[#FBFBFB] p-3">
        <ResponsePicker value={o.response} crop={o.crop} crops={crops} onPick={o.pickResponse} onCrop={o.setCrop} disabled={pending} />
        <ApproachPicker value={o.mediums} onToggle={o.toggleChannel} disabled={pending} />
        <textarea value={o.comment} onChange={(e) => o.setComment(e.target.value)} placeholder="Add a note (optional)…"
          rows={2} className="w-full resize-y rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" />
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={pending || !o.dirty}
            className="rounded-[10px] bg-[#678722] px-5 py-2 text-[13px] font-bold text-white disabled:opacity-40">
            {pending ? "Saving…" : saved && !o.dirty ? "Saved ✓" : "Save"}
          </button>
          {err && <span className="text-[12px] font-semibold text-[#C62828]">{err}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Focus mode: one farmer at a time (queue: head = current; skip requeues; back re-opens last) ── */
function FocusMode({ members, crops, onChange, onExit, onCurrent, commPlans, templates, canSms }: { members: CampaignMemberVM[]; crops: CropOption[]; onChange: (m: CampaignMemberVM) => void; onExit: () => void; onCurrent?: (m: CampaignMemberVM | null) => void; commPlans: string[]; templates: CommTemplateVM[]; canSms?: boolean }) {
  const [queue, setQueue] = useState<number[]>(() => members.filter((m) => statusOf(m) === "pending").map((m) => m.id));
  const [history, setHistory] = useState<number[]>([]);
  const currentId = queue[0];
  const member = members.find((m) => m.id === currentId) ?? null;

  // Surface the current farmer to the parent so the left script panel can fill/highlight for them.
  useEffect(() => { onCurrent?.(member); return () => onCurrent?.(null); }, [member, onCurrent]);

  const handled = () => { setHistory((h) => [...h, currentId]); setQueue((q) => q.slice(1)); };
  const skip = () => setQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));
  const back = () => { if (!history.length) return; const id = history[history.length - 1]; setHistory((h) => h.slice(0, -1)); setQueue((q) => [id, ...q.filter((x) => x !== id)]); };

  return (
    <div className="mt-3">
      {member
        ? <FocusCard key={member.id} member={member} crops={crops} onChange={onChange} onHandled={handled} onSkip={skip} onBack={history.length ? back : undefined} remaining={queue.length} commPlans={commPlans} templates={templates} canSms={canSms} />
        : (
          <div className="rounded-[18px] border-2 border-[#D3E4AB] bg-[#F6FFF4] p-10 text-center">
            <div className="text-[20px] font-bold text-[#516A1B]">All done 🎉</div>
            <div className="mt-1.5 text-[13px] text-[#616161]">You've worked through everyone in this list. Skipped farmers loop back until they're handled.</div>
            <button type="button" onClick={onExit} className="mt-4 rounded-[10px] bg-[#678722] px-6 py-2.5 text-[13px] font-bold text-white">Back to list</button>
          </div>
        )}
    </div>
  );
}

function FocusCard({ member, crops, onChange, onHandled, onSkip, onBack, remaining, commPlans, templates, canSms }: {
  member: CampaignMemberVM; crops: CropOption[]; onChange: (m: CampaignMemberVM) => void; onHandled: () => void; onSkip: () => void; onBack?: () => void; remaining: number; commPlans: string[]; templates: CommTemplateVM[]; canSms?: boolean;
}) {
  const o = useOutreach(member);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const unreachable = o.mediums.includes("UNREACHABLE");
  const canCommit = o.mediums.length > 0 || o.response != null; // a channel OR a response = handled

  const commit = () => {
    if (!canCommit) return;
    if (o.cropMissing) { setErr("Pick which crop they're interested in."); return; }
    setErr(null);
    start(async () => {
      const res = await markCampaignMember(member.id, o.patch);
      if (res.ok) { onChange(o.optimistic()); onHandled(); }
      else setErr(res.error ?? "Failed");
    });
  };

  return (
    <div className="rounded-[18px] border-2 border-[#E3EAF5] bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[22px] font-bold text-[#1A1C1A]">{member.name}</span>
        <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold" style={{ background: segMeta(member.segment).bg, color: segMeta(member.segment).color }}>{segMeta(member.segment).label}</span>
        <StatusBadge member={member} />
        <BroadcastBadge member={member} />
        <ResponseBadge member={member} />
        <span className="ml-auto rounded-full bg-[#F5F7F5] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#616161]">{remaining} left</span>
      </div>
      <div className="mb-3 text-[12.5px] text-[#9E9E9E]">{member.village ?? "—"}{member.store ? ` · ${member.store}` : ""}</div>
      <div className="mb-4"><PhoneBlock mobile={member.mobile} big extra={canSms ? <><SmsSender member={member} commPlans={commPlans} templates={templates} onChange={onChange} onSent={onHandled} big /><WaSender member={member} commPlans={commPlans} templates={templates} onChange={onChange} onSent={onHandled} big /></> : null} /></div>
      <div className="flex flex-col gap-3 rounded-[12px] border border-[#EAEAEA] bg-[#FBFBFB] p-3.5">
        <ResponsePicker value={o.response} crop={o.crop} crops={crops} onPick={o.pickResponse} onCrop={o.setCrop} disabled={pending} />
        <ApproachPicker value={o.mediums} onToggle={o.toggleChannel} disabled={pending} />
        <textarea value={o.comment} onChange={(e) => o.setComment(e.target.value)} placeholder="Add a note (optional)…"
          rows={2} className="w-full resize-y rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" />
      </div>
      {err && <div className="mt-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}
      <div className="mt-4 flex items-center gap-2">
        {onBack && <button type="button" onClick={onBack} disabled={pending} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2.5 text-[13px] font-semibold text-[#616161] disabled:opacity-40">← Back</button>}
        <button type="button" onClick={onSkip} disabled={pending} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2.5 text-[13px] font-semibold text-[#616161] disabled:opacity-40">Skip →</button>
        <button type="button" onClick={commit} disabled={pending || !canCommit}
          className="ml-auto rounded-[10px] px-6 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40"
          style={{ background: unreachable ? "#C62828" : "#678722" }}>
          {pending ? "Saving…" : unreachable ? "Mark unreachable & next" : "Save & next"}
        </button>
      </div>
      {!canCommit && <div className="mt-2 text-right text-[11.5px] text-[#9E9E9E]">Log their response and/or how you reached them — or Skip to come back later.</div>}
    </div>
  );
}

/* ── Campaign Tracker body: reach + real attributed revenue + uplift ── */
function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="rounded-[10px] bg-[#F5F7F5] px-3 py-2.5"><div className="text-[17px] font-bold" style={{ color: color ?? "#1A1C1A" }}>{value}</div><div className="text-[10.5px] text-[#757575]">{label}</div></div>;
}

/* ── Campaign audience analytics: pie + treemap composition + Segment × Store matrix ── */

const CHART_PALETTE = ["#1565C0", "#678722", "#E65100", "#6A1B9A", "#00838F", "#C62828", "#EDA942", "#5D4037", "#0277BD", "#558B2F", "#AD1457", "#4527A0"];

/** #RRGGBB → rgba() with the given alpha (for tinted matrix cells). */
function hexToRgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${a})`;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/** Donut pie with legend (label · count · %). Handles the single-slice (100%) case as a full ring. */
function PieCard({ title, data, total }: { title: string; data: { label: string; count: number; color: string }[]; total: number }) {
  const R = 52, r = 30, cx = 60, cy = 60;
  const slices = data.filter((d) => d.count > 0);
  let ang = -Math.PI / 2;
  const arcs = slices.map((d) => {
    const frac = total ? d.count / total : 0;
    const a0 = ang, a1 = ang + frac * 2 * Math.PI;
    ang = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad: number, an: number) => `${(cx + rad * Math.cos(an)).toFixed(2)},${(cy + rad * Math.sin(an)).toFixed(2)}`;
    const path = `M${pt(R, a0)} A${R},${R} 0 ${large} 1 ${pt(R, a1)} L${pt(r, a1)} A${r},${r} 0 ${large} 0 ${pt(r, a0)} Z`;
    return { path, color: d.color, label: d.label, count: d.count, pct: Math.round(frac * 100) };
  });
  const single = slices.length === 1;
  return (
    <div className={`${CARD} p-3.5`}>
      <div className="mb-2 text-[12px] font-bold text-[#1A1C1A]">{title}</div>
      {slices.length === 0 ? <div className="py-3 text-center text-[11.5px] text-[#BDBDBD]">No data</div> : (
        <div className="flex flex-wrap items-center gap-3">
          <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] shrink-0">
            {single ? (
              <><circle cx={cx} cy={cy} r={R} fill={slices[0].color} /><circle cx={cx} cy={cy} r={r} fill="#fff" /></>
            ) : arcs.map((s) => <path key={s.label} d={s.path} fill={s.color} />)}
          </svg>
          <div className="flex min-w-[130px] flex-1 flex-col gap-1">
            {arcs.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                <span className="truncate text-[#424242]" title={s.label}>{s.label}</span>
                <span className="ml-auto shrink-0 font-semibold text-[#616161]">{n(s.count)} · {s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bar chart — for overlapping dimensions (e.g. crops: a farmer can grow several, so
 *  shares don't partition a whole and a pie would mislead). % is share of enrolled farmers. */
function HBarCard({ title, data, total, note }: { title: string; data: { label: string; count: number; color: string }[]; total: number; note?: string }) {
  const shown = data.filter((d) => d.count > 0);
  const max = Math.max(1, ...shown.map((d) => d.count));
  return (
    <div className={`${CARD} p-3.5`}>
      <div className="mb-2 text-[12px] font-bold text-[#1A1C1A]">{title}</div>
      {shown.length === 0 ? <div className="py-3 text-center text-[11.5px] text-[#BDBDBD]">No data</div> : (
        <div className="flex flex-col gap-2">
          {shown.map((d) => (
            <div key={d.label}>
              <div className="flex justify-between text-[11px]">
                <span className="truncate text-[#424242]" title={d.label}>{d.label}</span>
                <span className="ml-2 shrink-0 font-semibold text-[#616161]">{n(d.count)} · {total ? ((d.count / total) * 100).toFixed(1) : "0"}%</span>
              </div>
              <div className="mt-0.5 h-2 rounded-full bg-[#F0F0F0]"><div className="h-2 rounded-full" style={{ width: `${(d.count / max) * 100}%`, background: d.color }} /></div>
            </div>
          ))}
          {note && <div className="mt-1 text-[10px] text-[#9E9E9E]">{note}</div>}
        </div>
      )}
    </div>
  );
}

/** Squarified treemap layout (Bruls et al.) inside a [0..W]×[0..H] box. */
function squarify(items: { label: string; count: number; color: string }[], W: number, H: number) {
  const nodes = items.filter((i) => i.count > 0);
  const total = nodes.reduce((s, i) => s + i.count, 0);
  if (!nodes.length || total <= 0) return [] as { label: string; color: string; count: number; x: number; y: number; w: number; h: number }[];
  const scale = (W * H) / total;
  const scaled = nodes.map((i) => ({ ...i, area: i.count * scale }));
  const out: { label: string; color: string; count: number; x: number; y: number; w: number; h: number }[] = [];
  const worst = (areas: number[], side: number) => {
    const s = areas.reduce((a, b) => a + b, 0);
    const mx = Math.max(...areas), mn = Math.min(...areas);
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  let rect = { x: 0, y: 0, w: W, h: H };
  let i = 0;
  while (i < scaled.length) {
    const side = Math.min(rect.w, rect.h);
    let j = i + 1;
    const row = [scaled[i]];
    while (j < scaled.length && worst(row.map((r) => r.area), side) >= worst([...row.map((r) => r.area), scaled[j].area], side)) {
      row.push(scaled[j]); j++;
    }
    const rowArea = row.reduce((a, b) => a + b.area, 0);
    if (rect.w >= rect.h) {
      const colW = rowArea / rect.h;
      let yy = rect.y;
      for (const rr of row) { const rh = rr.area / colW; out.push({ label: rr.label, color: rr.color, count: rr.count, x: rect.x, y: yy, w: colW, h: rh }); yy += rh; }
      rect = { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
    } else {
      const rowH = rowArea / rect.w;
      let xx = rect.x;
      for (const rr of row) { const rw = rr.area / rowH; out.push({ label: rr.label, color: rr.color, count: rr.count, x: xx, y: rect.y, w: rw, h: rowH }); xx += rw; }
      rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    }
    i = j;
  }
  return out;
}

/** Decomposition (treemap) card — rectangles area-proportional to the category's share. */
function TreemapCard({ title, rows, total }: { title: string; rows: { label: string; count: number }[]; total: number }) {
  const W = 100, H = 62;
  const data = rows.map((r, i) => ({ ...r, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  const cells = squarify(data, W, H);
  const shown = cells.reduce((s, c) => s + c.count, 0);
  return (
    <div className={`${CARD} p-3.5`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[12px] font-bold text-[#1A1C1A]">{title}</span>
        {shown < total && <span className="text-[10px] text-[#9E9E9E]">top {rows.length} · {Math.round((shown / total) * 100)}% of audience</span>}
      </div>
      {cells.length === 0 ? <div className="py-3 text-center text-[11.5px] text-[#BDBDBD]">No data</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          {cells.map((c) => {
            const pct = total ? Math.round((c.count / total) * 100) : 0;
            const fits = c.w > 15 && c.h > 9;
            return (
              <g key={c.label}>
                <rect x={c.x + 0.4} y={c.y + 0.4} width={Math.max(0, c.w - 0.8)} height={Math.max(0, c.h - 0.8)} rx={1.2} fill={c.color}>
                  <title>{`${c.label}: ${n(c.count)} (${pct}%)`}</title>
                </rect>
                {fits && (
                  <text x={c.x + 2} y={c.y + 4.6} fill="#fff" style={{ fontSize: 3.2, fontWeight: 700 }}>
                    <tspan>{c.label.length > c.w / 2.4 ? c.label.slice(0, Math.max(2, Math.floor(c.w / 2.4))) + "…" : c.label}</tspan>
                    <tspan x={c.x + 2} dy={4} style={{ fontSize: 2.8, fontWeight: 500 }}>{n(c.count)} · {pct}%</tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Segment × Store cross-tab: rows = stores, columns = segments, cells tinted by count. */
function SegStoreMatrix({ valueCols, lifecycleCols, matrix, total }: { valueCols: CampaignAnalytics["valueCols"]; lifecycleCols: CampaignAnalytics["lifecycleCols"]; matrix: CampaignAnalytics["matrix"]; total: number }) {
  const vTot: Record<string, number> = {}, lTot: Record<string, number> = {};
  for (const c of valueCols) vTot[c.key] = matrix.reduce((s, r) => s + (r.value[c.key] ?? 0), 0);
  for (const c of lifecycleCols) lTot[c.key] = matrix.reduce((s, r) => s + (r.lifecycle[c.key] ?? 0), 0);
  const maxCell = Math.max(1, ...matrix.flatMap((r) => [...valueCols.map((c) => r.value[c.key] ?? 0), ...lifecycleCols.map((c) => r.lifecycle[c.key] ?? 0)]));
  const cell = (key: string, v: number, color: string) => (
    <td key={key} className="px-2 py-1.5 text-right tabular-nums" style={{ background: v ? hexToRgba(color, 0.08 + 0.55 * (v / maxCell)) : undefined, color: v ? "#1A1C1A" : "#DADADA" }}>{v || "·"}</td>
  );
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="border-b border-[#F0F0F0] px-4 py-2.5 text-[12px] font-bold text-[#1A1C1A]">Store × Value segment + Lifecycle</div>
      <div className="max-h-[46vh] overflow-auto">
        <table className="w-full min-w-[680px] border-collapse text-[11.5px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FAFAFA] text-[10px] font-bold uppercase tracking-[0.3px] text-[#9E9E9E]">
              <th className="sticky left-0 z-10 bg-[#FAFAFA] px-4 py-2 text-left">Store</th>
              {valueCols.map((c) => <th key={c.key} className="px-2 py-2 text-right" style={{ color: c.color }}>{c.label}</th>)}
              <th className="border-l border-[#EEE] px-3 py-2 text-right text-[#1A1C1A]">Segment total</th>
              {lifecycleCols.map((c) => <th key={c.key} className="px-2 py-2 text-right" style={{ color: c.color }}>{c.label}</th>)}
              <th className="border-l border-[#EEE] px-3 py-2 text-right text-[#1A1C1A]">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((r) => (
              <tr key={r.store} className="border-b border-[#F5F5F5]">
                <td className="sticky left-0 z-10 bg-white px-4 py-1.5 font-semibold text-[#1565C0]">{r.store}</td>
                {valueCols.map((c) => cell("v" + c.key, r.value[c.key] ?? 0, c.color))}
                <td className="border-l border-[#EEE] px-3 py-1.5 text-right font-bold text-[#1A1C1A]">{n(r.total)}</td>
                {lifecycleCols.map((c) => cell("l" + c.key, r.lifecycle[c.key] ?? 0, c.color))}
                <td className="border-l border-[#EEE] px-3 py-1.5 text-right font-bold text-[#1A1C1A]">{n(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="border-t border-[#EEE] bg-[#F8F8F8] font-bold text-[#1A1C1A]">
              <td className="sticky left-0 z-10 bg-[#F8F8F8] px-4 py-2">All stores</td>
              {valueCols.map((c) => <td key={c.key} className="px-2 py-2 text-right tabular-nums">{n(vTot[c.key])}</td>)}
              <td className="border-l border-[#EEE] px-3 py-2 text-right">{n(total)}</td>
              {lifecycleCols.map((c) => <td key={c.key} className="px-2 py-2 text-right tabular-nums">{n(lTot[c.key])}</td>)}
              <td className="border-l border-[#EEE] px-3 py-2 text-right">{n(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function AnalyticsBody({ a, campaign }: { a: CampaignAnalytics; campaign: CampaignListItem }) {
  const [exporting, setExporting] = useState(false);
  const doExport = () => {
    setExporting(true);
    exportCampaignAudienceXlsx(campaign.id, campaign.name)
      .then((res) => {
        if (res.ok && res.b64 && res.filename) downloadB64(res.b64, res.filename);
        else alert(res.error ?? "Export failed.");
      })
      .catch(() => alert("Export failed."))
      .finally(() => setExporting(false));
  };
  if (a.total === 0) return <div className="py-8 text-center text-[13px] text-[#9E9E9E]">No enrolled farmers in your scope for this campaign.</div>;
  const cropData = a.byCrop.map((c, i) => ({ label: c.label, count: c.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[22px] font-bold text-[#00838F]">{n(a.total)}</span>
          <span className="text-[13px] text-[#757575]">enrolled farmers</span>
        </div>
        <button type="button" onClick={doExport} disabled={exporting}
          className="rounded-[8px] border border-[#00838F] px-3 py-1.5 text-[12px] font-semibold text-[#00838F] hover:bg-[#E0F7FA] disabled:opacity-40">
          {exporting ? "Exporting…" : "⬇ Export to Excel"}
        </button>
      </div>

      {/* Two independent segment dimensions: value tier + lifecycle */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PieCard title="By value segment" data={a.byValue.map((s) => ({ label: s.label, count: s.count, color: s.color }))} total={a.total} />
        <PieCard title="By lifecycle" data={a.byLifecycle.map((s) => ({ label: s.label, count: s.count, color: s.color }))} total={a.total} />
      </div>

      {/* Crop bars (crops overlap across farmers, so a bar reads clearer than a pie) */}
      <HBarCard title="By crop (top)" data={cropData} total={a.total} note="% = share of enrolled farmers; a farmer may grow several crops, so these overlap." />

      {/* Decomposition treemaps: store + village */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TreemapCard title="By store" rows={a.byStore} total={a.total} />
        <TreemapCard title="By village (top)" rows={a.byVillage} total={a.total} />
      </div>

      {/* Store × Value + Lifecycle matrix (replaces the farmer list) */}
      <SegStoreMatrix valueCols={a.valueCols} lifecycleCols={a.lifecycleCols} matrix={a.matrix} total={a.total} />
    </div>
  );
}

function TrackerBody({ t }: { t: CampaignTracker }) {
  const a = t.attribution;
  const reachPct = t.reach.testTotal > 0 ? Math.round((t.reach.reached / t.reach.testTotal) * 100) : 0;
  const [upliftBy, setUpliftBy] = useState<"value" | "lifecycle">("value");
  const uplift = upliftBy === "value" ? t.upliftByValue : t.upliftByLifecycle;
  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} p-4`}>
        <div className="mb-2 text-[13px] font-bold text-[#1A1C1A]">Outreach</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Test farmers" value={n(t.reach.testTotal)} />
          <Kpi label={`Reached (${reachPct}%)`} value={n(t.reach.reached)} color="#678722" />
          <Kpi label="Call·WA·SMS·Visit" value={`${n(t.reach.byApproach.CALL)}·${n(t.reach.byApproach.WHATSAPP)}·${n(t.reach.byApproach.SMS)}·${n(t.reach.byApproach.IN_PERSON)}`} />
          <Kpi label="Paying (contacted)" value={n(a.payingFarmers)} color="#1565C0" />
        </div>
        <div className="mt-2 text-[11px] text-[#9E9E9E]">A farmer can be reached by more than one approach, so the Call·WA·SMS·Visit counts can add up to more than “Reached”.</div>
        {/* Interest response breakdown (of the reached farmers) */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F0F0F0] pt-3">
          <span className="text-[11px] font-semibold uppercase text-[#757575]">Response</span>
          <span className="rounded-full bg-[#F3F8E6] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#516A1B]">Interested {n(t.reach.byResponse.interested)}</span>
          <span className="rounded-full bg-[#FDECEA] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#C62828]">Not interested {n(t.reach.byResponse.notInterested)}</span>
          <span className="rounded-full bg-[#FFF3E0] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#E65100]">Wants another crop {n(t.reach.byResponse.otherCrop)}</span>
          {t.reach.byResponse.noResponse > 0 && <span className="rounded-full bg-[#F5F5F5] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#9E9E9E]">Not logged {n(t.reach.byResponse.noResponse)}</span>}
        </div>
        {t.reach.otherCrops.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase text-[#757575]">Crops requested</span>
            {t.reach.otherCrops.map((c) => <span key={c.crop} className="rounded-full border border-[#FFCC80] bg-[#FFF8F0] px-2 py-0.5 text-[11px] font-semibold text-[#E65100]">{cropLabel(c.crop)} · {n(c.count)}</span>)}
          </div>
        )}
      </div>

      {/* Outreach progress per store — individually reached / total (TEST group) */}
      {t.reach.byStore.length > 0 && (
        <div className={`${CARD} p-4`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-bold text-[#1A1C1A]">Reached by store</div>
            <span className="text-[11px] text-[#9E9E9E]">individually reached / total</span>
          </div>
          <div className="flex flex-col gap-2">
            {t.reach.byStore.map((s) => {
              const pct = s.total ? Math.round((s.reached / s.total) * 100) : 0;
              return (
                <div key={s.store} className="flex items-center gap-2.5 text-[12px]">
                  <span className="w-[130px] shrink-0 truncate font-semibold text-[#424242]" title={s.store}>{s.store}</span>
                  <div className="relative h-[16px] flex-1 overflow-hidden rounded-[6px] bg-[#F0F0F0]">
                    <div className="absolute inset-y-0 left-0 rounded-[6px] bg-[#678722]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-[74px] shrink-0 text-right tabular-nums text-[#616161]"><b className="text-[#1A1C1A]">{n(s.reached)}</b> / {n(s.total)}</span>
                  <span className="w-[64px] shrink-0 text-right text-[10.5px] text-[#6A1B9A]">{s.broadcast > 0 ? `📣 ${n(s.broadcast)}` : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`${CARD} p-4`}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-bold text-[#1A1C1A]">Attributed revenue</div>
          <div className="text-[11px] text-[#9E9E9E]">{a.windowStart} → {a.windowEnd}</div>
        </div>
        <div className="mb-2 text-[11.5px] text-[#616161]">Counts purchases by <b>contacted</b> farmers · matched on — <b>{a.basisLabel}</b></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[10px] bg-[#F3F8E6] px-4 py-3"><div className="text-[20px] font-bold text-[#516A1B]">{inr(a.matchedRevenue)}</div><div className="text-[11px] text-[#678722]">Campaign-matched revenue</div></div>
          <div className="rounded-[10px] bg-[#F5F7F5] px-4 py-3"><div className="text-[20px] font-bold text-[#1A1C1A]">{inr(a.totalRevenue)}</div><div className="text-[11px] text-[#9E9E9E]">All purchases by contacted farmers</div></div>
        </div>
        {a.noCatalogMatch && (
          <div className="mt-2 rounded-[10px] border border-[#F5CE8E] bg-[#FEF6E9] px-3 py-2 text-[11.5px] text-[#8D6E00]">
            No sales data carries this cluster's crop, so crop-matched revenue reads ₹0 — use the "all purchases" figure for context, or target by product category for precise attribution.
          </div>
        )}
      </div>

      <div className={`${CARD} p-4`}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-bold text-[#1A1C1A]">Test vs control uplift</div>
          <div className="inline-flex rounded-[8px] border border-[#E0E0E0] bg-[#F5F7F5] p-0.5">
            {([["value", VALUE_TITLE], ["lifecycle", LIFECYCLE_TITLE]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setUpliftBy(k)}
                className="rounded-[6px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
                style={{ background: upliftBy === k ? "#fff" : "transparent", color: upliftBy === k ? "#678722" : "#9E9E9E", boxShadow: upliftBy === k ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2 text-[11px] text-[#9E9E9E]">Value tier and lifecycle are independent — a farmer can be an HNI <b>and</b> Lapsed. Toggle to break the same members down either way.</div>
        {uplift.length === 0 ? <div className="py-4 text-center text-[12.5px] text-[#9E9E9E]">No members / no matched sales yet. Uplift matures as monthly sales are imported.</div>
          : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[12px]">
              <thead><tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]">
                <th className="py-2">{upliftBy === "value" ? VALUE_TITLE : LIFECYCLE_TITLE}</th><th className="text-right">Test</th><th className="text-right">Reached</th><th className="text-right">Test %buy</th><th className="text-right">Ctrl %buy</th><th className="text-right">Uplift</th><th className="text-right">Incremental ₹</th>
              </tr></thead>
              <tbody>{uplift.map((u) => { const testPct = u.test.reached > 0 ? (u.test.purchased / u.test.reached) : (u.test.farmers ? u.test.purchased / u.test.farmers : 0); const ctrlPct = u.control.farmers ? u.control.purchased / u.control.farmers : 0; return (
                <tr key={u.segment} className="border-b border-[#F5F5F5]">
                  <td className="py-2 font-semibold" style={{ color: segMeta(u.segment).color }}>{segMeta(u.segment).label}</td>
                  <td className="text-right">{n(u.test.farmers)}</td>
                  <td className="text-right">{n(u.test.reached)}</td>
                  <td className="text-right">{(testPct * 100).toFixed(0)}%</td>
                  <td className="text-right">{(ctrlPct * 100).toFixed(0)}%</td>
                  <td className="text-right font-semibold" style={{ color: u.upliftPurchasePct >= 0 ? "#678722" : "#C62828" }}>{u.upliftPurchasePct > 0 ? "+" : ""}{u.upliftPurchasePct}pp</td>
                  <td className="text-right font-bold text-[#1A1C1A]">{inr(u.incremental)}</td>
                </tr>
              ); })}</tbody>
            </table></div>
          )}
      </div>

      {/* Broadcast reach — kept separate from individual outreach (mass-send DELIVERY, carrier-confirmed) */}
      <div className={`${CARD} border-[#EDE7F6] p-4`} style={{ background: "#FCFAFF" }}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-bold text-[#6A1B9A]">📣 Broadcast reach</div>
          <span className="text-[11px] text-[#9E9E9E]">mass send · separate from individual reach</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Kpi label="Delivered to" value={n(t.reach.broadcastDelivered)} color="#6A1B9A" />
          <Kpi label="via SMS" value={n(t.reach.byBroadcastChannel.SMS)} />
          <Kpi label="via WhatsApp" value={n(t.reach.byBroadcastChannel.WHATSAPP)} />
        </div>
        <div className="mt-2 text-[11px] text-[#9E9E9E]">Farmers a mass send was <b>delivered</b> to (carrier-confirmed). They stay in the outreach list for individual follow-up and are <b>not</b> counted as “reached”. Sync delivery from a campaign's Broadcast history.</div>
      </div>
    </div>
  );
}

/* ══════════════════ Shell ══════════════════ */
export function CampaignsScreen({ templates, campaigns, stores: _stores, projects, canManage, initialProjectId, crops = [], templateVars = [] }: {
  templates: CommTemplateVM[]; campaigns: CampaignListItem[]; stores: StoreLite[]; projects: ProjectVM[]; canManage: boolean; initialProjectId?: number; crops?: CropOption[]; templateVars?: TemplateVarHint[];
}) {
  const [tab, setTab] = useState<"comms" | "campaigns">("campaigns");
  // Officers/RMs get the scoped campaign view only; the comm-plan config is central.
  const TABS: [("comms" | "campaigns"), string][] = canManage
    ? [["campaigns", "Campaigns"], ["comms", "Comm Plan"]]
    : [["campaigns", "Campaigns"]];
  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {canManage && (
        <div className="mb-4 inline-flex flex-wrap rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className="rounded-[8px] px-4 py-2 text-[12.5px] font-semibold transition-colors"
              style={{ background: tab === k ? "#fff" : "transparent", color: tab === k ? "#678722" : "#9E9E9E", boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "comms" && canManage && <CommPlanTab templates={templates} templateVars={templateVars} />}
      {tab === "campaigns" && <CampaignsTab campaigns={campaigns} projects={projects} canManage={canManage} initialProjectId={initialProjectId} commPlanNames={[...new Set(templates.map((t) => t.name).filter(Boolean))]} templates={templates} crops={crops} />}
    </div>
  );
}
