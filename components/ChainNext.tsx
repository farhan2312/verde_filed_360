"use client";

import { useRouter } from "next/navigation";

/**
 * Post-save success box that chains the Cluster → Project → Campaign pipeline:
 * shown right after creating a step, with a one-click hop to the next step (pre-filled).
 */
export function ChainNext({ message, nextLabel, nextHref, onDone, doneLabel = "Done" }: {
  message: string;
  nextLabel: string;
  nextHref: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const router = useRouter();
  return (
    <div className="rounded-[12px] border border-[#DBE9B4] bg-[#F3FBF2] p-4">
      <div className="text-[13.5px] font-semibold text-[#66852A]">✓ {message}</div>
      <div className="mt-1 text-[12px] text-[#616161]">Keep the chain going — the next step opens pre-filled.</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => router.push(nextHref)}
          className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[13px] font-bold text-white">{nextLabel}</button>
        <button type="button" onClick={onDone}
          className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">{doneLabel}</button>
      </div>
    </div>
  );
}
