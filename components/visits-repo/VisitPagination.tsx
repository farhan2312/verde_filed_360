"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Prev / page-of / Next pager for the Visit Repository. Preserves all active filters + search. */
export function VisitPagination({ page, pageCount, total, pageSize, shown }: {
  page: number; pageCount: number; total: number; pageSize: number; shown: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const go = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page"); else params.set("page", String(p));
    const qs = params.toString();
    router.push(qs ? `/visits?${qs}` : "/visits");
    router.refresh();
  };

  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + shown;
  const btn = "rounded-lg border-[1.5px] border-[#E0E0E0] px-3 py-1.5 text-xs font-semibold text-[#616161] hover:border-[#678722] hover:text-[#678722] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E0E0E0] disabled:hover:text-[#616161]";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-[#9E9E9E]">
        Showing <b className="text-[#616161]">{from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")}</b> of <b className="text-[#616161]">{total.toLocaleString("en-IN")}</b> visits
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => go(page - 1)}>← Prev</button>
        <span className="text-xs font-semibold text-[#616161]">Page {page} of {pageCount}</span>
        <button type="button" className={btn} disabled={page >= pageCount} onClick={() => go(page + 1)}>Next →</button>
      </div>
    </div>
  );
}
