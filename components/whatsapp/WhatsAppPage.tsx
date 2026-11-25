"use client";

// WhatsApp page: the two-way Inbox and the Opt-in analysis, as tabs.
import { useState } from "react";
import { WhatsAppInbox } from "./WhatsAppInbox";
import { OptInAnalyticsTab } from "./OptInAnalytics";
import type { InboxData } from "@/app/actions/whatsapp-inbox";

export function WhatsAppPage({ initial }: { initial: InboxData | null }) {
  const [tab, setTab] = useState<"inbox" | "optins">("inbox");
  return (
    <div>
      <div className="mb-3 flex border-b border-[#E6E6E6]">
        {([["inbox", "💬 Inbox"], ["optins", "📈 Opt-in analysis"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className="-mb-px border-b-2 px-4 py-2 text-[13.5px] font-semibold transition-colors"
            style={{ borderColor: tab === k ? "#7DA02E" : "transparent", color: tab === k ? "#7DA02E" : "#9E9E9E" }}>
            {label}
          </button>
        ))}
      </div>
      {/* Keep the inbox mounted so its open thread survives a tab switch. */}
      <div className={tab === "inbox" ? "" : "hidden"}><WhatsAppInbox initial={initial} /></div>
      {tab === "optins" && <OptInAnalyticsTab />}
    </div>
  );
}
