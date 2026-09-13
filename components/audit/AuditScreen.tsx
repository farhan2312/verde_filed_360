"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuditTable, type AuditRowData } from "./AuditTable";
import { EmployeeActivity } from "./EmployeeActivity";
import { OverallDashboard } from "./OverallDashboard";

type Tab = "overall" | "activity" | "log";
const TABS: [Tab, string][] = [["overall", "📊 Overall"], ["activity", "👥 Employee Activity"], ["log", "📋 Audit Log"]];

/** Audit page shell: overall usage dashboard + employee activity analytics + the raw audit log. */
export function AuditScreen({ auditRows }: { auditRows: AuditRowData[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlTab = sp.get("tab");
  const [tab, setTab] = useState<Tab>(TABS.some(([t]) => t === urlTab) ? (urlTab as Tab) : "overall");

  const switchTab = (t: Tab) => {
    setTab(t);
    // Keep the tab in the URL so the view is linkable; preserve the Overall tab's filter params.
    const p = new URLSearchParams(sp.toString());
    if (t === "overall") p.delete("tab"); else p.set("tab", t);
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
  };

  return (
    <div className="animate-fadeUp">
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, l]) => {
          const on = tab === k;
          return (
            <button key={k} type="button" onClick={() => switchTab(k)}
              className="relative px-4 py-2.5 text-[13px] font-semibold transition-colors"
              style={{ color: on ? "#678722" : "#9E9E9E" }}>
              {l}
              {on && <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-brand-600" />}
            </button>
          );
        })}
      </div>
      {tab === "overall" ? <OverallDashboard /> : tab === "activity" ? <EmployeeActivity /> : <AuditTable rows={auditRows} />}
    </div>
  );
}
