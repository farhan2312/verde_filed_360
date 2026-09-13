"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { getPhaseOutreach, type PhaseOutreach, type PhaseOutreachMember } from "@/app/actions/campaign-phases";
import { channelLabel } from "@/lib/campaign-phases";

const CHIP = "rounded-full px-2 py-0.5 text-[10.5px] font-bold";

/** Current-round, target-routed contact list for the campaign (scoped to the caller's farmers). */
export function PhaseOutreachPanel({ campaignId, campaignName, onClose }: { campaignId: number; campaignName: string; onClose: () => void }) {
  const [data, setData] = useState<PhaseOutreach | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getPhaseOutreach(campaignId).then((d) => { setData(d); setLoading(false); }); }, [campaignId]);

  return (
    <Modal open onClose={onClose} className="max-w-[1040px]">
      <ModalHeader eyebrow="Campaign · round outreach" eyebrowColor="#1565C0" title={campaignName}
        subtitle="Who to contact right now — routed by the campaign's current round" onClose={onClose} />
      <div className="px-5 py-4">
        {loading ? <div className="py-10 text-center text-[13px] text-[#9E9E9E]">Loading…</div>
          : data == null ? <div className="py-10 text-center text-[13px] text-[#9E9E9E]">No rounds set up for this campaign yet, or nothing in your scope.</div>
          : <PhaseList data={data} />}
      </div>
    </Modal>
  );
}

function PhaseList({ data }: { data: PhaseOutreach }) {
  const groups = useMemo(() => {
    const m = new Map<string, PhaseOutreachMember[]>();
    for (const x of data.members) { const a = m.get(x.groupLabel) ?? []; a.push(x); m.set(x.groupLabel, a); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#F3F8E6] px-2.5 py-1 text-[11.5px] font-bold text-[#678722]">Round {data.ordinal}: {data.roundName || "(unnamed)"}</span>
        <span className="text-[12px] text-[#757575]">{data.members.length} to contact{data.purchaseSplit ? " · split by purchase" : ""}</span>
        {data.coupons.length > 0 && (
          <span className="ml-auto flex flex-wrap gap-1.5">
            {data.coupons.map((c) => <span key={c.code} className="rounded-md bg-[#FFF3E0] px-2 py-0.5 text-[11px] font-semibold text-[#E65100]" title={c.minSpend ? `min ₹${c.minSpend}` : undefined}>{c.label}: <b>{c.code}</b></span>)}
          </span>
        )}
      </div>

      {data.members.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#E4EFC9] bg-[#F1F8F1] px-5 py-10 text-center text-[13px] text-[#66857A]">Nobody to contact in this round in your scope.</div>
      ) : groups.map(([label, rows]) => (
        <div key={label} className="mb-4">
          <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">{label} · {rows.length}</div>
          <div className="flex flex-col gap-2">
            {rows.map((m) => <OutreachRow key={m.memberId} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function OutreachRow({ m }: { m: PhaseOutreachMember }) {
  const digits = (m.mobile ?? "").replace(/\D/g, "").slice(-10);
  const wa = digits ? `https://wa.me/91${digits}` : null;
  const tel = digits ? `tel:${digits}` : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#EEE] bg-white px-3 py-2.5">
      <div className="min-w-[150px] flex-1">
        <div className="text-[13px] font-semibold text-[#1A1C1A]">{m.name}
          <span className={`${CHIP} ml-2 bg-[#ECEFF1] text-[#546E7A]`}>{m.segmentLabel}</span>
        </div>
        <div className="text-[11px] text-[#9E9E9E]">{[m.village, m.store].filter(Boolean).join(" · ")}{m.mobile ? ` · ${m.mobile}` : ""}</div>
      </div>
      <div className="text-[11px]">
        {m.recChannel ? <span className={`${CHIP} bg-[#E3F2FD] text-[#1565C0]`}>→ {channelLabel(m.recChannel)}</span> : <span className="text-[#BDBDBD]">no channel</span>}
        {m.recCommPlan && <span className="ml-1.5 text-[#757575]">{m.recCommPlan}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {tel && <a href={tel} className="rounded-md bg-[#F3F8E6] px-2 py-1 text-[11px] font-semibold text-[#678722]">Call</a>}
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-md bg-[#F3F8E6] px-2 py-1 text-[11px] font-semibold text-[#0B8A3D]">WhatsApp</a>}
      </div>
    </div>
  );
}
