"use client";

import { useState, type ReactNode } from "react";

export interface SettingsTab { key: string; label: string; icon?: string; content: ReactNode }

/** Tabbed shell for the Settings page — one logical group per tab. */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="animate-fadeUp">
      <div className="mb-5 flex flex-wrap gap-1 border-b border-[#ECECEC]">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button key={t.key} type="button" onClick={() => setActive(t.key)}
              className="relative px-4 py-2.5 text-[13px] font-semibold transition-colors"
              style={{ color: on ? "#7DA02E" : "#9E9E9E" }}>
              {t.icon ? `${t.icon} ` : ""}{t.label}
              {on && <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-[#7DA02E]" />}
            </button>
          );
        })}
      </div>
      {/* key by active tab: remount the content on every switch so tabs never share state
          (e.g. the SMS and WhatsApp test benches stay fully separate — no number carry-over). */}
      <div key={active}>{cur?.content}</div>
    </div>
  );
}
