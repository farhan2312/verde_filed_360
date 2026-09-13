"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "@/components/icons";

/** Server-pagination controls — preserves ?q= and ?segment=, rewrites ?page=. */
export function FarmerPagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goto(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <div className="text-[12px] text-[#9E9E9E]">
        Showing <span className="font-semibold text-[#616161]">{from}</span>–
        <span className="font-semibold text-[#616161]">{to}</span> of{" "}
        <span className="font-semibold text-[#616161]">
          {total.toLocaleString("en-IN")}
        </span>{" "}
        farmers
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goto(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 rounded-lg border border-[#E0E0E0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#FAFAFA]"
        >
          <ChevronLeft />
          Prev
        </button>
        <span className="text-[12px] font-semibold text-[#616161]">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => goto(page + 1)}
          disabled={page >= pageCount}
          className="flex items-center gap-1 rounded-lg border border-[#E0E0E0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#FAFAFA]"
        >
          Next
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
