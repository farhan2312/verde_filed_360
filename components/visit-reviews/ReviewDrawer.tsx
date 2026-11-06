"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getReviewDrawer, getVisitMedia } from "@/app/actions/visit-review-queue";
import { VisitReviewSection } from "@/components/visit-detail/VisitReviewSection";
import type { DrawerData } from "./types";

/**
 * Side drawer for reviewing one visit from the queue: key visit facts, on-demand photos/voice notes
 * (heavy base64 — never loaded with the list), and the shared review panel. Esc / ✕ closes.
 */
export function ReviewDrawer({ visitId, onClose, onChanged }: { visitId: number; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<DrawerData | null | undefined>(undefined); // undefined = loading, null = unavailable
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setData((d) => (d && d.summary.id === visitId ? d : undefined)); // keep content on a same-visit refresh
    getReviewDrawer(visitId).then((r) => { if (live) setData(r); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [visitId, version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = data?.summary;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-black/[0.06] bg-[#FCFDFC] shadow-[-8px_0_24px_rgba(0,0,0,0.08)] sm:w-[540px]" role="dialog" aria-label="Review visit">
        <div className="flex items-start gap-3 border-b border-[#EEE] bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-[#7DA02E]">Review visit · VIS-{String(visitId).padStart(4, "0")}</div>
            <div className="truncate text-[16px] font-bold text-[#1A1C1A]">{s ? s.farmer : "Loading…"}</div>
            {s && <div className="truncate text-[12px] text-[#757575]">{[s.village, s.store, s.officer].filter(Boolean).join(" · ")}</div>}
          </div>
          <Link href={`/visits/${visitId}`} prefetch={false} className="mt-1 whitespace-nowrap rounded-lg border border-[#E0E0E0] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#7DA02E] hover:bg-[#F5F9EA]">Full visit →</Link>
          <button type="button" onClick={onClose} aria-label="Close" className="mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[#757575] hover:bg-[#F0F0F0]">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {data === undefined && <div className="py-16 text-center text-[13px] text-[#9E9E9E]">Loading visit…</div>}
          {data === null && <div className="py-16 text-center text-[13px] text-[#C62828]">This visit couldn’t be loaded, or it’s outside your stores.</div>}
          {data && s && (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[14px] border border-black/[0.05] bg-white p-4 text-[12.5px]">
                <Fact label="Visit date" value={s.visitDate} />
                <Fact label="Logged" value={s.loggedAt} />
                <Fact label="Visit type" value={s.purpose} />
                <Fact label="Mode" value={s.mode} />
                <Fact label="Main crop" value={[s.mainCrop, s.season].filter(Boolean).join(" · ")} />
                <Fact label="Mobile" value={s.mobile} />
                {s.recordedBy && s.recordedBy !== s.officer && <Fact label="Recorded by" value={s.recordedBy} />}
                {s.followUp && <Fact label="Officer’s follow-up" value={s.followUp} wide />}
                {s.crops.length > 0 && <Chips label="Crops" items={s.crops} />}
                {s.problems.length > 0 && <Chips label="Current problems" items={s.problems} tone="#C62828" />}
                {s.pests.length > 0 && <Chips label="Pests / diseases" items={s.pests} tone="#E65100" />}
                {s.cropRisk.length > 0 && <Chips label="Crop risk" items={s.cropRisk} tone="#8D6E00" />}
                {s.productRequired.length > 0 && <Chips label="Products required" items={s.productRequired} tone="#1565C0" />}
                {s.productsUsed.length > 0 && <Chips label="Products used" items={s.productsUsed} />}
                {s.notes && <Fact label="Officer notes" value={s.notes} wide />}
              </dl>

              {(s.photoCount > 0 || s.voiceNoteCount > 0) && <Media visitId={visitId} photos={s.photoCount} voice={s.voiceNoteCount} />}

              <VisitReviewSection key={`${visitId}-${version}`} visitId={visitId} review={data.review}
                onSaved={() => { setVersion((v) => v + 1); onChanged(); }} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]">{label}</dt>
      <dd className="whitespace-pre-wrap text-[#1A1C1A]">{value}</dd>
    </div>
  );
}

function Chips({ label, items, tone = "#7DA02E" }: { label: string; items: string[]; tone?: string }) {
  return (
    <div className="col-span-2">
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {items.map((x) => <span key={x} className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: `${tone}14`, color: tone }}>{x}</span>)}
      </dd>
    </div>
  );
}

function Media({ visitId, photos, voice }: { visitId: number; photos: number; voice: number }) {
  const [media, setMedia] = useState<{ photos: string[]; voiceNotes: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  useEffect(() => { setMedia(null); setBig(null); }, [visitId]);

  if (!media)
    return (
      <button type="button" disabled={loading}
        onClick={async () => { setLoading(true); setMedia(await getVisitMedia(visitId) ?? { photos: [], voiceNotes: [] }); setLoading(false); }}
        className="rounded-[12px] border border-dashed border-[#E9F2CF] bg-white px-4 py-3 text-[12.5px] font-semibold text-[#7DA02E] hover:bg-[#F1F8F1] disabled:opacity-60">
        {loading ? "Loading media…" : `📷 Show ${[photos ? `${photos} photo${photos > 1 ? "s" : ""}` : "", voice ? `${voice} voice note${voice > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ")}`}
      </button>
    );
  return (
    <div className="rounded-[14px] border border-black/[0.05] bg-white p-3">
      {media.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p} alt={`Visit photo ${i + 1}`} onClick={() => setBig(p)} className="aspect-square w-full cursor-zoom-in rounded-lg object-cover ring-1 ring-black/5" />
          ))}
        </div>
      )}
      {media.voiceNotes.map((a, i) => <audio key={i} controls src={a} className="mt-2 w-full" />)}
      {big && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="Visit photo" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
