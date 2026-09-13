"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { PERIOD_PILLS } from "@/lib/demo-metrics";

/**
 * Period selector pills (lines 434–438). Default '30d'.
 * Selection is visual-only in the original design (no data is filtered); we keep
 * the same behaviour but persist the choice in the URL (?period=) so the server
 * could refetch in future without changing the inert chart numbers.
 */
export function PeriodFilter({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState(initial);

  function select(key: string) {
    setPeriod(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex gap-2 mb-[22px]">
      {PERIOD_PILLS.map((p) => {
        const selected = period === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => select(p.key)}
            className="px-[18px] py-[7px] rounded-[20px] text-xs font-semibold cursor-pointer hover:opacity-85"
            style={{
              background: selected ? "#7DA02E" : "white",
              color: selected ? "white" : "#616161",
              border: `1.5px solid ${selected ? "#7DA02E" : "#E0E0E0"}`,
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
