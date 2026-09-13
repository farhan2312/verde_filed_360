"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { UsersTab } from "./UsersTab";
import { StoresTab } from "./StoresTab";
import type { UserRow, StoreMgmtData } from "./types";

type SubTab = "users" | "stores";

const TABS: { id: SubTab; label: string }[] = [
  { id: "users", label: "👤 Users" },
  { id: "stores", label: "🏪 Store Management" },
];

export function UserManagementScreen({
  users,
  storeAdmin,
  canEdit,
}: {
  users: UserRow[];
  storeAdmin: StoreMgmtData;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<SubTab>("users");

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {/* Sub-tab switcher */}
      <div className="mb-[22px] flex w-fit gap-0 rounded-xl border border-[#F0F0F0] bg-white p-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "cursor-pointer rounded-lg px-[22px] py-2 text-[13px] font-semibold transition-all duration-150",
                active ? "bg-[#262250] text-white" : "bg-transparent text-[#757575]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "users" ? (
        <UsersTab rows={users} canEdit={canEdit} />
      ) : (
        <StoresTab data={storeAdmin} canEdit={canEdit} />
      )}
    </div>
  );
}
