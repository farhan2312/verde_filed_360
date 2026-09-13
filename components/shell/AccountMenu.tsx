"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PERSONAS, ROLE_ORDER, type RoleKey } from "@/lib/roles";
import { setRoleAction, clearRoleAction } from "@/app/actions/session";
import { logoutAction } from "@/app/actions/auth";
import { CaretUpDown } from "../icons";

interface PersonaVM {
  name: string;
  role: string;
  init: string;
  color: string;
}

export function AccountMenu({
  persona,
  isAdmin,
  impersonating,
}: {
  persona: PersonaVM;
  isAdmin: boolean;
  impersonating: RoleKey | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const viewAs = (key: RoleKey) => {
    setOpen(false);
    start(() => void setRoleAction(key));
  };
  const stopViewing = () => {
    setOpen(false);
    start(() => void clearRoleAction());
  };
  const signOut = () => {
    setOpen(false);
    start(async () => {
      await logoutAction();
      router.replace("/login");
      router.refresh();
    });
  };

  return (
    <div className="relative border-t border-white/[0.08]">
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 rounded-xl border border-white/[0.12] bg-brand-900 p-2 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          {isAdmin && (
            <>
              <div className="px-2 pt-1.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[1px] text-white/30">
                View as role
              </div>
              {ROLE_ORDER.filter((key) => key !== "campaigner").map((key) => {
                const p = PERSONAS[key];
                const active = impersonating ? key === impersonating : key === "sysadmin";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => viewAs(key)}
                    className="mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-white/[0.08]"
                    style={{ background: active ? "rgba(255,255,255,0.12)" : "transparent" }}
                  >
                    <span
                      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: p.color }}
                    >
                      {p.init}
                    </span>
                    <span>
                      <span className="block text-[12px] font-semibold text-white">{p.name}</span>
                      <span className="block text-[10px] text-white/45">{p.role}</span>
                    </span>
                  </button>
                );
              })}
              {impersonating && (
                <button
                  type="button"
                  onClick={stopViewing}
                  className="mb-0.5 w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-gold hover:bg-white/[0.08]"
                >
                  ← Back to my role (Admin)
                </button>
              )}
              <div className="my-1 border-t border-white/[0.08]" />
            </>
          )}
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[12px] font-semibold text-white hover:bg-white/[0.08] disabled:opacity-60"
          >
            <LogoutIcon />
            Sign out
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-[18px] py-4 text-left hover:bg-white/[0.04]"
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-white"
          style={{ background: persona.color }}
        >
          {persona.init}
        </span>
        <span className="flex-1 overflow-hidden">
          <span className="block truncate text-[13px] font-semibold">{persona.name}</span>
          <span className="block text-[10px] text-white/50">
            {persona.role}
            {impersonating ? " · viewing" : ""}
          </span>
        </span>
        <CaretUpDown className="text-white/40" />
      </button>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M7 15H4a1 1 0 01-1-1V4a1 1 0 011-1h3" />
      <path d="M11 12l3-3-3-3M14 9H7" />
    </svg>
  );
}
