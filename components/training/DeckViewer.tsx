"use client";

import { useEffect, useState } from "react";
import type { TrainingDeck } from "@/lib/training";

const DL_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/** Windowed deck viewer: embeds the real deck (PDF) in a frame, with fullscreen + download. */
export function DeckViewer({ deck, title }: { deck: TrainingDeck; title: string }) {
  const [full, setFull] = useState(false);
  const src = `${deck.pdf}#view=FitH`;

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [full]);

  return (
    <div>
      {/* Inline window */}
      <div className="overflow-hidden rounded-[14px] border border-[#E1E9DD] bg-[#525659] shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        <iframe src={src} title={title} className="block h-[68vh] min-h-[440px] w-full" />
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFull(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#678722] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#516A1B]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          Open fullscreen
        </button>
        <a href={deck.file} download
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#678722] px-4 py-2 text-[12.5px] font-semibold text-[#678722] hover:bg-[#F3F8E6]">
          {DL_ICON}{deck.fileLabel}
        </a>
      </div>

      {/* Fullscreen window */}
      {full && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/85 p-3 sm:p-6" onClick={() => setFull(false)}>
          <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 rounded-t-[12px] bg-[#14401B] px-4 py-2.5 text-white">
              <div className="min-w-0 truncate text-[13px] font-semibold">{title}</div>
              <div className="flex items-center gap-2">
                <a href={deck.file} download
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25">
                  {DL_ICON}Download
                </a>
                <button type="button" onClick={() => setFull(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white/15 text-[18px] leading-none text-white hover:bg-white/25" aria-label="Close">×</button>
              </div>
            </div>
            <iframe src={src} title={title} className="flex-1 rounded-b-[12px] bg-[#525659]" />
          </div>
        </div>
      )}
    </div>
  );
}
