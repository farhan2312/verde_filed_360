"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { segMeta } from "@/lib/campaign-segments";
import { markCampaignMember, type CampaignListItem, type CampaignMemberVM } from "@/app/actions/campaigns";
import {
  APPROACH_TILES, UNREACHABLE_TILE, statusOf, rank, digits10, OutreachProgress,
  ScriptPanel, ResponsePicker, ResponseBadge, useOutreach, type CommTemplateVM, type CropOption,
} from "@/components/campaigns/CampaignsScreen";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => x.toLocaleString("en-IN");
const PAGE = 50;

/** Shared row grid — farmer | phone | outcome (response + channel) | note | save. */
const GRID = "grid grid-cols-[1.3fr_0.8fr_auto_1.2fr_auto] items-center gap-3";

/**
 * Full-page outreach matrix: every farmer on ONE line — outcome tiles, note and save together.
 * Reached/unreachable rows sink to the bottom; un-contacted stay on top.
 */
export function OutreachMatrix({ campaign, initial, scripts = [], crops = [] }: { campaign: CampaignListItem; initial: CampaignMemberVM[]; scripts?: CommTemplateVM[]; crops?: CropOption[] }) {
  const [members, setMembers] = useState(initial);
  const [page, setPage] = useState(0);
  const patch = (u: CampaignMemberVM) => setMembers((list) => list.map((x) => (x.id === u.id ? u : x)));

  const sorted = [...members].sort((a, b) => rank(a) - rank(b));
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const p = Math.min(page, pages - 1);
  const slice = sorted.slice(p * PAGE, p * PAGE + PAGE);

  // Windowed page numbers: always show first & last, current ±1, and collapse the rest to "…".
  const pageNums: (number | "…")[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || (i >= p - 1 && i <= p + 1)) pageNums.push(i);
    else if (pageNums[pageNums.length - 1] !== "…") pageNums.push("…");
  }

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {/* Back + campaign header */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href="/campaigns" className="rounded-[10px] border border-[#E0E0E0] bg-white px-4 py-2 text-[13px] font-semibold text-[#616161] hover:bg-[#F5F7F5]">← Back to campaigns</Link>
        <div>
          <div className="text-[15px] font-bold text-[#1A1C1A]">{campaign.name} — outreach matrix</div>
          <div className="text-[11.5px] text-[#9E9E9E]">{campaign.startDate} → {campaign.endDate} · {campaign.target}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {/* Left: the campaign's tagged call scripts (sticky so they stay visible while the matrix scrolls) */}
        {scripts.length > 0 && (
          <div className={`${CARD} shrink-0 p-3.5 lg:sticky lg:top-4 lg:w-[330px] lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`}>
            <ScriptPanel scripts={scripts} />
          </div>
        )}

        {/* Right: progress + matrix */}
        <div className="min-w-0 flex-1">
          <div className={`${CARD} p-4`}>
            <OutreachProgress members={members} />
          </div>

          <div className={`${CARD} mt-3 overflow-hidden`}>
            <div className="overflow-x-auto">
              <div className="min-w-[1180px]">
                <div className={`${GRID} border-b border-[#F0F0F0] bg-[#FAFAFA] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]`}>
                  <div>Farmer</div>
                  <div>Phone</div>
                  <div>Response &amp; how reached</div>
                  <div>Note</div>
                  <div className="text-right">Save</div>
                </div>
                {slice.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[13px] text-[#9E9E9E]">No farmers to contact here.</div>
                ) : (
                  slice.map((m) => <MatrixRow key={m.id} member={m} crops={crops} onChange={patch} />)
                )}
              </div>
            </div>
            {pages > 1 && (
              <div className="flex flex-col items-center gap-2 border-t border-[#F5F5F5] px-4 py-3">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button type="button" onClick={() => setPage(0)} disabled={p === 0}
                    className="rounded-[8px] border border-[#E0E0E0] px-2.5 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40 hover:bg-[#F5F5F5]" aria-label="First page">« First</button>
                  <button type="button" onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0}
                    className="rounded-[8px] border border-[#E0E0E0] px-2.5 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40 hover:bg-[#F5F5F5]">← Prev</button>
                  {pageNums.map((it, i) =>
                    it === "…" ? (
                      <span key={`e${i}`} className="px-1.5 text-[12px] text-[#BDBDBD]">…</span>
                    ) : (
                      <button key={it} type="button" onClick={() => setPage(it)}
                        aria-current={it === p ? "page" : undefined}
                        className="min-w-[32px] rounded-[8px] border px-2 py-1.5 text-[12px] font-semibold"
                        style={it === p
                          ? { background: "#6A1B9A", borderColor: "#6A1B9A", color: "#fff" }
                          : { background: "#fff", borderColor: "#E0E0E0", color: "#616161" }}>
                        {it + 1}
                      </button>
                    ),
                  )}
                  <button type="button" onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1}
                    className="rounded-[8px] border border-[#E0E0E0] px-2.5 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40 hover:bg-[#F5F5F5]">Next →</button>
                  <button type="button" onClick={() => setPage(pages - 1)} disabled={p >= pages - 1}
                    className="rounded-[8px] border border-[#E0E0E0] px-2.5 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40 hover:bg-[#F5F5F5]" aria-label="Last page">Last »</button>
                </div>
                <span className="text-[11.5px] text-[#757575]">Page {p + 1} of {n(pages)} · showing {p * PAGE + 1}–{Math.min((p + 1) * PAGE, sorted.length)} of {n(sorted.length)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatrixRow({ member, crops, onChange }: { member: CampaignMemberVM; crops: CropOption[]; onChange: (m: CampaignMemberVM) => void }) {
  const o = useOutreach(member);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d10 = digits10(member.mobile);
  const st = statusOf(member);
  const unreachable = o.mediums.includes("UNREACHABLE");

  const save = () => {
    if (o.cropMissing) { setErr("Pick a crop"); return; }
    setErr(null); setSaved(false);
    start(async () => {
      const res = await markCampaignMember(member.id, o.patch);
      if (res.ok) { onChange(o.optimistic()); setSaved(true); }
      else setErr(res.error ?? "Failed");
    });
  };

  return (
    <div className={`${GRID} border-b border-[#F8F8F8] px-4 py-2.5`}
      style={{ background: st === "reached" ? "#F6FFF4" : st === "unreachable" ? "#FEF6F5" : "#fff" }}>
      {/* Farmer */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold text-[#1A1C1A]">{member.name}</span>
          <span className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold" style={{ background: segMeta(member.segment).bg, color: segMeta(member.segment).color }}>{segMeta(member.segment).label}</span>
        </div>
        <div className="truncate text-[10.5px] text-[#9E9E9E]">{member.village ?? "—"}{member.store ? ` · ${member.store}` : ""}</div>
        <div className="mt-0.5"><ResponseBadge member={member} /></div>
      </div>
      {/* Phone */}
      <div className="min-w-0">
        {d10 ? (
          <a href={`tel:+91${d10}`} className="text-[14px] font-bold tracking-wide text-[#0D47A1] hover:underline">{member.mobile}</a>
        ) : (
          <span className="text-[11px] text-[#BDBDBD]">no number</span>
        )}
      </div>
      {/* Outcome — interest response (row 1) + how reached (row 2) */}
      <div className="flex flex-col gap-1.5" title={member.reachedBy ? `Recorded by ${member.reachedBy}${member.reachedByCode ? ` (${member.reachedByCode})` : ""}${member.reachedAt ? ` on ${member.reachedAt}` : ""}` : undefined}>
        <ResponsePicker value={o.response} crop={o.crop} crops={crops} onPick={o.pickResponse} onCrop={o.setCrop} disabled={pending} compact />
        <div className="flex items-center gap-1">
          {APPROACH_TILES.map((t) => { const on = o.mediums.includes(t.key); return (
            <button key={t.key} type="button" disabled={pending} onClick={() => o.toggleChannel(t.key)}
              className="rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
              style={{ background: on ? t.bg : "#fff", color: on ? t.color : "#757575", borderColor: on ? t.color : "#E0E0E0" }}>
              <span className="inline-block w-[10px]">{on ? "✓" : ""}</span>{t.label}
            </button>
          ); })}
          <button type="button" disabled={pending} onClick={() => o.toggleChannel("UNREACHABLE")}
            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
            style={{ background: unreachable ? UNREACHABLE_TILE.bg : "#fff", color: unreachable ? UNREACHABLE_TILE.color : "#9E9E9E", borderColor: unreachable ? UNREACHABLE_TILE.color : "#E0E0E0" }}>
            Unreachable
          </button>
        </div>
      </div>
      {/* Note */}
      <input value={o.comment} onChange={(e) => o.setComment(e.target.value)} placeholder="Note (optional)…"
        className="w-full min-w-0 rounded-lg border border-[#E0E0E0] px-2.5 py-1.5 text-[12px]" />
      {/* Save */}
      <div className="flex items-center justify-end gap-1.5">
        {err && <span className="text-[10.5px] font-semibold text-[#C62828]" title={err}>!</span>}
        <button type="button" onClick={save} disabled={pending || !o.dirty}
          className="rounded-[8px] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
          style={{ background: unreachable ? "#C62828" : "#7DA02E" }}>
          {pending ? "…" : saved && !o.dirty ? "✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
