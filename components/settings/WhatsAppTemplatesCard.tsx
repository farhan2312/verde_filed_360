"use client";

import { useState, useTransition } from "react";
import { listTemplates, createTemplate, deleteTemplate, saveTemplateVarLabels, type WaTemplate } from "@/app/actions/whatsapp-templates";
import { useConfirm } from "@/components/ConfirmDialog";
import { WA_PRESETS, fillPreview, countVars, guessVarLabels, type PresetLang } from "@/lib/wa-template-presets";

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const LANGS = ["en", "en_US", "hi", "en_GB"];
const LANG_LABEL: Record<string, string> = { en: "English", en_US: "English (US)", en_GB: "English (UK)", hi: "Hindi" };

const STATUS_STYLE: Record<string, { bg: string; c: string }> = {
  APPROVED: { bg: "#F3F8E6", c: "#678722" },
  PENDING: { bg: "#FEF6E9", c: "#8D6E00" },
  IN_APPEAL: { bg: "#FEF6E9", c: "#8D6E00" },
  REJECTED: { bg: "#FDECEA", c: "#C62828" },
  PAUSED: { bg: "#FDECEA", c: "#C62828" },
  DISABLED: { bg: "#F5F5F5", c: "#616161" },
};

/**
 * Settings → WhatsApp templates. Create + submit templates to Meta via the Business Management API
 * and watch their approval status — no WhatsApp Manager UI. Approved marketing templates are what
 * you send to your opted-in list. Admin-only.
 */
export function WhatsAppTemplatesCard({ initial }: {
  initial: { ready: boolean; missing: string[]; templates: WaTemplate[] };
}) {
  const [rows, setRows] = useState(initial.templates);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [category, setCategory] = useState("MARKETING");
  const [body, setBody] = useState("");
  const [examples, setExamples] = useState("");
  const [varNames, setVarNames] = useState<string[]>([]); // friendly names for {{1}},{{2}}… (portal-only)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const { confirm, dialog } = useConfirm();

  const varCount = countVars(body);
  const exampleArr = examples.split(",").map((s) => s.trim());
  const preview = fillPreview(body, exampleArr);

  // Apply a bilingual preset in the chosen language: fills body + examples + category + a suggested name.
  const applyPreset = (key: string, lang: PresetLang) => {
    const preset = WA_PRESETS.find((x) => x.key === key);
    if (!preset) return;
    const b = preset[lang];
    setBody(b.body);
    setExamples(b.examples.join(", "));
    setCategory(preset.category);
    setLanguage(lang === "hi" ? "hi" : "en");
    setName(`${preset.key}_${lang}`);
    setVarNames(preset.vars); // prefill the friendly variable names from the preset
    setMsg(null);
  };

  // Insert the next {{n}} variable at the end of the body.
  const insertVar = () => setBody((b) => `${b}${b.endsWith(" ") || b === "" ? "" : " "}{{${countVars(b) + 1}}}`);

  const refresh = () => start(async () => { const r = await listTemplates(); if (r.ok && r.templates) setRows(r.templates); });

  const submit = () => {
    setMsg(null);
    start(async () => {
      const r = await createTemplate({
        name, language, category, body,
        examples: examples.split(",").map((s) => s.trim()).filter(Boolean),
        varLabels: Array.from({ length: varCount }, (_, i) => (varNames[i] ?? "").trim()),
      });
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "Failed." }); return; }
      setMsg({ ok: true, text: `Submitted “${name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_")}” — status ${r.status ?? "PENDING"}. Meta reviews it (usually minutes–hours).` });
      setName(""); setBody(""); setExamples(""); setVarNames([]);
      const l = await listTemplates(); if (l.ok && l.templates) setRows(l.templates);
    });
  };

  const remove = async (t: WaTemplate) => {
    if (!(await confirm({ title: "Delete this template?", confirmLabel: "Delete template", message: <><b>{t.name}</b> will be removed from your WhatsApp account. This can’t be undone.</> }))) return;
    start(async () => { const r = await deleteTemplate(t.name); if (r.ok) setRows((rs) => rs.filter((x) => !(x.name === t.name && x.language === t.language))); else setMsg({ ok: false, text: r.error ?? "Delete failed." }); });
  };

  const inputCls = "w-full rounded-[10px] border border-[#E0E0E0] px-3 py-2.5 text-[13px] outline-none focus:border-[#0B8A3D]";

  return (
    <div className="rounded-2xl border border-black/[0.03] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {dialog}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px] font-bold text-[#1A1C1A]">WhatsApp templates</span>
        <span className="rounded-full bg-[#F3F8E6] px-2 py-0.5 text-[10.5px] font-bold text-[#0B8A3D]">Meta Cloud API</span>
      </div>
      <p className="mb-4 text-[12px] text-[#9E9E9E]">Create &amp; submit templates for approval without leaving the portal. Approved <b>marketing</b> templates are what you send to your opted-in list. Admin-only.</p>

      {!initial.ready ? (
        <div className="rounded-[10px] bg-[#FEF6E9] px-3 py-2 text-[12px] text-[#8D6E00]">
          Not available yet — set {initial.missing.join(", ")} in the environment (WHATSAPP_WABA_ID is your WhatsApp Business Account id), then restart.
        </div>
      ) : (
        <>
          {/* Preset library — pick a ready-made English/Hindi starter */}
          <div className="mb-3 rounded-[12px] border border-[#E3F2FD] bg-[#F5FBFF] p-3">
            <div className="mb-2 text-[12px] font-bold text-[#1565C0]">✨ Start from a template</div>
            <div className="flex flex-col gap-1.5">
              {WA_PRESETS.map((pr) => (
                <div key={pr.key} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[170px] text-[12px] font-semibold text-[#1A1C1A]">{pr.label}</span>
                  <span className="rounded-full bg-[#F5F7F5] px-2 py-0.5 text-[9.5px] font-bold text-[#616161]">{pr.category}</span>
                  <button type="button" onClick={() => applyPreset(pr.key, "en")} className="rounded-md border border-[#CFE3D4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0B8A3D] hover:bg-[#F3F8E6]">English</button>
                  <button type="button" onClick={() => applyPreset(pr.key, "hi")} className="rounded-md border border-[#CFE3D4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0B8A3D] hover:bg-[#F3F8E6]">हिंदी</button>
                  <span className="text-[10.5px] text-[#9E9E9E]">{pr.vars.map((v, i) => `{{${i + 1}}} ${v}`).join(" · ")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Create form */}
          <div className="rounded-[12px] border border-[#ECEFEC] bg-[#FAFBFA] p-4">
            <div className="mb-2.5 text-[12px] font-bold text-[#3A3A3A]">New template</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Name</label>
                <input className={`${inputCls} mt-1`} placeholder="hni_offer_v1" value={name}
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Language</label>
                <select className={`${inputCls} mt-1 bg-white`} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l] ?? l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Category</label>
                <select className={`${inputCls} mt-1 bg-white`} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase text-[#9E9E9E]">Body — use {"{{1}}"}, {"{{2}}"} for variables</label>
              <button type="button" onClick={insertVar} className="rounded-md border border-[#E0E0E0] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#0B8A3D] hover:bg-[#F3F8E6]">+ Insert {`{{${varCount + 1}}}`}</button>
            </div>
            <textarea className={`${inputCls} mt-1 resize-y`} rows={3} value={body} onChange={(e) => setBody(e.target.value)} dir="auto"
              placeholder={"Namaste {{1}}! Verde Agrotech has a special offer on {{2}} this week. Visit your nearest store."} />
            {varCount > 0 && (
              <>
                <label className="mt-2 block text-[10px] font-bold uppercase text-[#9E9E9E]">Example values for {"{{1}}"}…{`{{${varCount}}}`} (comma-separated) — Meta needs these to review</label>
                <input className={`${inputCls} mt-1`} placeholder="Ramesh, Wheat" value={examples} onChange={(e) => setExamples(e.target.value)} />
                <label className="mt-3 block text-[10px] font-bold uppercase text-[#9E9E9E]">Variable names <span className="normal-case text-[#BDBDBD]">— what each slot means; shown in the send screens, not sent to Meta</span></label>
                <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {Array.from({ length: varCount }).map((_, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-9 shrink-0 font-mono text-[11px] font-bold text-[#616161]">{`{{${i + 1}}}`}</span>
                      <input className={inputCls} placeholder={`e.g. Farmer name`} value={varNames[i] ?? ""}
                        onChange={(e) => setVarNames((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* Live preview with the example values filled in */}
            {body.trim() && (
              <div className="mt-2.5">
                <div className="text-[10px] font-bold uppercase text-[#9E9E9E]">Preview</div>
                <div className="mt-1 rounded-[10px] rounded-tl-[3px] bg-[#DCF8C6] px-3 py-2 text-[12.5px] leading-relaxed text-[#1A1C1A] shadow-[0_1px_1px_rgba(0,0,0,0.08)]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>
                  {preview}
                </div>
                {varCount > 0 && exampleArr.filter(Boolean).length < varCount && (
                  <div className="mt-1 text-[10.5px] text-[#E65100]">Fill an example for each {"{{n}}"} so Meta can review it.</div>
                )}
              </div>
            )}
            {msg && <div className={`mt-2 rounded-[8px] px-3 py-2 text-[12px] font-medium ${msg.ok ? "bg-[#F3F8E6] text-[#678722]" : "bg-[#FDECEA] text-[#C62828]"}`}>{msg.text}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={submit} disabled={busy || !name.trim() || !body.trim()}
                className="rounded-[10px] bg-[#0B8A3D] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#0A6E31] disabled:opacity-50">
                {busy ? "Submitting…" : "Submit for approval"}</button>
              <button type="button" onClick={refresh} disabled={busy}
                className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161] hover:bg-[#F5F5F5] disabled:opacity-50">Refresh status</button>
            </div>
          </div>

          {/* Template list */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-[12px] font-bold text-[#3A3A3A]">Your templates ({rows.length})</div>
          </div>
          {rows.length === 0 ? (
            <div className="mt-2 rounded-[10px] bg-[#FAFBFA] px-3 py-6 text-center text-[12.5px] text-[#9E9E9E]">No templates yet — submit one above.</div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {rows.map((t) => <TemplateRow key={`${t.name}-${t.language}`} t={t} onRemove={remove} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One template row — shows status/body plus the friendly variable names, with an inline rename editor. */
function TemplateRow({ t, onRemove }: { t: WaTemplate; onRemove: (t: WaTemplate) => void }) {
  const st = STATUS_STYLE[t.status] ?? { bg: "#F5F5F5", c: "#616161" };
  const varCount = countVars(t.body);
  const seed = () => Array.from({ length: varCount }, (_, i) => (t.varLabels?.[i]?.trim() || guessVarLabels(t.name, t.body)[i] || ""));
  const [editing, setEditing] = useState(false);
  const [labels, setLabels] = useState<string[]>(seed);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();

  const save = () => start(async () => {
    const r = await saveTemplateVarLabels({ name: t.name, language: t.language, labels });
    if (r.ok) { setSaved(true); setEditing(false); }
  });

  return (
    <div className="rounded-[10px] border border-[#F0F0F0] px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12.5px] font-bold text-[#1A1C1A]">{t.name}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: st.bg, color: st.c }}>{t.status}</span>
        <span className="rounded-full bg-[#F5F7F5] px-2 py-0.5 text-[10px] font-semibold text-[#616161]">{t.category}</span>
        <span className="text-[10.5px] text-[#9E9E9E]">{t.language}</span>
        <button type="button" onClick={() => onRemove(t)} className="ml-auto text-[11.5px] font-semibold text-[#C62828] hover:underline">Delete</button>
      </div>
      {t.body && <div className="mt-1 text-[11.5px] text-[#757575]">{t.body}</div>}
      {t.rejectedReason && <div className="mt-1 text-[11px] font-semibold text-[#C62828]">Rejected: {t.rejectedReason}</div>}

      {varCount > 0 && (
        <div className="mt-1.5">
          {!editing ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: varCount }).map((_, i) => (
                <span key={i} className="rounded-full bg-[#F1F8F1] px-2 py-0.5 text-[10px] font-semibold text-[#678722]">
                  <span className="font-mono text-[#9E9E9E]">{`{{${i + 1}}}`}</span> {labels[i]?.trim() || `Variable ${i + 1}`}
                </span>
              ))}
              <button type="button" onClick={() => { setSaved(false); setEditing(true); }} className="text-[11px] font-semibold text-[#0B8A3D] hover:underline">✎ Rename variables</button>
              {saved && <span className="text-[10.5px] font-semibold text-[#678722]">Saved ✓</span>}
            </div>
          ) : (
            <div className="rounded-[8px] border border-[#ECEFEC] bg-[#FAFBFA] p-2">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {Array.from({ length: varCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-9 shrink-0 font-mono text-[11px] font-bold text-[#616161]">{`{{${i + 1}}}`}</span>
                    <input className="w-full rounded-[8px] border border-[#E0E0E0] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#0B8A3D]"
                      placeholder={`Variable ${i + 1}`} value={labels[i] ?? ""}
                      onChange={(e) => setLabels((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={save} disabled={busy} className="rounded-[8px] bg-[#0B8A3D] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save names"}</button>
                <button type="button" onClick={() => { setLabels(seed()); setEditing(false); }} className="rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-semibold text-[#616161]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
