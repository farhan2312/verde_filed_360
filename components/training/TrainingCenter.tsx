"use client";

import { useMemo, useState } from "react";
import {
  TRAINING_SECTIONS, ROLE_LABEL, topicsForRole,
  type TrainingTopic, type TrainingRole, type ViewerRole, type TrainingStep,
} from "@/lib/training";
import { DeckViewer } from "./DeckViewer";
import { VideoPlayer } from "./VideoPlayer";

const ROLE_COLORS: Record<TrainingRole, string> = {
  officer: "#1565C0", regional: "#7DA02E", central: "#7B1FA2", sysadmin: "#E65100", campaigner: "#00838F",
};

/** Screenshot with a graceful placeholder until the real image is added under /public/training. */
function StepImage({ file }: { file: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="mt-2 flex max-w-[520px] items-center gap-2 rounded-[10px] border border-dashed border-[#C5CAD3] bg-[#F4F6FA] px-4 py-6 text-[12px] text-[#7A8699]">
        <span className="text-[18px]">📷</span>
        <span>Screenshot to be added <span className="text-[#AEB6C4]">({file})</span></span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/training/${file}`} alt="" onError={() => setFailed(true)}
      className="mt-2 h-auto max-h-[440px] w-auto max-w-[520px] rounded-[10px] border border-[#E8E8E8] object-contain object-left shadow-[0_1px_4px_rgba(0,0,0,0.06)]" />
  );
}

function Callout({ kind, text }: { kind: "tip" | "warn"; text: string }) {
  const s = kind === "tip"
    ? { bg: "#F5F9EA", bd: "#E9F2CF", c: "#66852A", icon: "💡", label: "Tip" }
    : { bg: "#FEF6E9", bd: "#F5CE8E", c: "#8D6E00", icon: "⚠️", label: "Heads up" };
  return (
    <div className="mt-2 rounded-[10px] border px-3 py-2 text-[12.5px] leading-snug" style={{ background: s.bg, borderColor: s.bd, color: s.c }}>
      <span className="font-bold">{s.icon} {s.label}: </span>{text}
    </div>
  );
}

function Step({ n, step }: { n: number; step: TrainingStep }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#7DA02E] text-[12px] font-bold text-white">{n}</div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="text-[13.5px] leading-relaxed text-[#1A1C1A]">{step.text}</div>
        {step.tip && <Callout kind="tip" text={step.tip} />}
        {step.warn && <Callout kind="warn" text={step.warn} />}
        {step.image && <StepImage file={step.image} />}
      </div>
    </div>
  );
}

export function TrainingCenter({ role, topics }: { role: ViewerRole; topics: TrainingTopic[] }) {
  const isAdmin = role === "sysadmin";
  const [preview, setPreview] = useState<TrainingRole | "all">(isAdmin ? "all" : role);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string>(topics[0]?.id ?? "");

  // Which topics this viewer can see (sysadmin can preview any role, or All).
  const visible = useMemo(() => {
    if (!isAdmin) return topicsForRole(role);
    return preview === "all" ? topics : topics.filter((t) => t.roles.includes(preview));
  }, [isAdmin, role, preview, topics]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? visible.filter((x) => `${x.title} ${x.summary} ${x.section}`.toLowerCase().includes(t)) : visible;
  }, [visible, q]);

  const bySection = useMemo(() => {
    const m = new Map<string, TrainingTopic[]>();
    for (const s of TRAINING_SECTIONS) m.set(s, []);
    for (const t of filtered) (m.get(t.section) ?? m.set(t.section, []).get(t.section)!).push(t);
    return [...m.entries()].filter(([, ts]) => ts.length);
  }, [filtered]);

  const open = useMemo(() => topics.find((t) => t.id === openId) ?? filtered[0] ?? visible[0] ?? null, [topics, openId, filtered, visible]);
  const flatIds = filtered.map((t) => t.id);
  const idx = open ? flatIds.indexOf(open.id) : -1;
  const nextId = idx >= 0 && idx < flatIds.length - 1 ? flatIds[idx + 1] : null;
  const go = (id: string) => setOpenId(id);
  const byId = (id: string) => topics.find((t) => t.id === id);

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {isAdmin && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]">View as</span>
          {(["all", "officer", "regional", "central", "sysadmin", "campaigner"] as const).map((r) => {
            const on = preview === r;
            const label = r === "all" ? "All roles" : ROLE_LABEL[r];
            const color = r === "all" ? "#424242" : ROLE_COLORS[r];
            return (
              <button key={r} type="button" onClick={() => setPreview(r)}
                className="rounded-full border-[1.5px] px-3 py-[5px] text-[11.5px] font-semibold"
                style={{ background: on ? color : "#fff", color: on ? "#fff" : color, borderColor: on ? "transparent" : "#E0E0E0" }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Left rail */}
        <div className="rounded-[14px] border border-black/[0.03] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics…"
            className="mb-2 w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[#7DA02E]" />
          {bySection.length === 0 ? (
            <div className="px-2 py-6 text-center text-[12px] text-[#9E9E9E]">No topics match.</div>
          ) : bySection.map(([section, ts]) => (
            <div key={section} className="mb-2">
              <div className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">{section}</div>
              {ts.map((t) => {
                const on = open?.id === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => go(t.id)}
                    className={`block w-full rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${on ? "bg-[#F5F9EA] font-semibold text-[#66852A]" : "text-[#424242] hover:bg-[#F5F7F5]"}`}>
                    {t.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Topic viewer */}
        <div className="rounded-[14px] border border-black/[0.03] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {!open ? (
            <div className="py-16 text-center text-[13px] text-[#9E9E9E]">Select a topic to begin.</div>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {open.roles.map((r) => (
                  <span key={r} className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${ROLE_COLORS[r]}18`, color: ROLE_COLORS[r] }}>{ROLE_LABEL[r]}</span>
                ))}
                {open.minutes && <span className="text-[11px] text-[#9E9E9E]">· {open.minutes} min read</span>}
              </div>
              <h1 className="text-[22px] font-bold text-[#1A1C1A]">{open.title}</h1>
              <p className="mt-1 text-[13.5px] text-[#616161]">{open.summary}</p>

              <div className="mt-5 border-t border-[#F0F0F0] pt-5">
                {open.video && <VideoPlayer video={open.video} title={open.title} />}
                {open.deck
                  ? <DeckViewer deck={open.deck} title={open.title} />
                  : open.steps.map((s, i) => <Step key={i} n={i + 1} step={s} />)}
              </div>

              {open.outcome && (
                <div className="mt-2 rounded-[12px] border border-[#E9F2CF] bg-[#F1F8F1] px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#7DA02E]">What happens next</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-[#66852A]">{open.outcome}</div>
                </div>
              )}

              {(open.related?.length || idx >= 0) && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0F0F0] pt-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {open.related?.filter((rid) => rid !== nextId).map((rid) => { const rt = byId(rid); if (!rt) return null;
                      // ← for a topic earlier in the catalog (a back-reference), → for a later one.
                      const back = topics.findIndex((t) => t.id === rid) < topics.findIndex((t) => t.id === open.id);
                      return (
                      <button key={rid} type="button" onClick={() => go(rid)}
                        className="rounded-full border border-[#E0E0E0] bg-white px-3 py-1 text-[11.5px] font-semibold text-[#616161] hover:border-[#7DA02E] hover:text-[#7DA02E]">
                        {back ? `← ${rt.title}` : `${rt.title} →`}
                      </button>); })}
                  </div>
                  {idx >= 0 && idx < flatIds.length - 1 && (
                    <button type="button" onClick={() => go(flatIds[idx + 1])}
                      className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A]">
                      Next: {byId(flatIds[idx + 1])?.title} →
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
