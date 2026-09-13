"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { activeNavHref, visibleNav, type NavId, type NavItem } from "@/lib/nav";
import type { RoleKey } from "@/lib/roles";
import { NavIcons } from "../icons";
import { AccountMenu } from "./AccountMenu";

interface PersonaVM {
  name: string;
  role: string;
  init: string;
  color: string;
}

/** Compact labels for the bottom tab bar. */
const SHORT: Record<NavId, string> = {
  dashboard: "Home",
  newVisit: "New",
  visitRepo: "Visits",
  actionRegistry: "Actions",
  farmers: "Farmers",
  mapView: "Map",
  farmerCluster: "Clusters",
  analytics: "Home",
  actions: "Actions",
  campaigns: "Campaign",
  ghoshti: "Ghoshti",
  projects: "Projects",
  products: "Catalog",
  movement: "Stock",
  users: "Users",
  whatsappInbox: "WhatsApp",
  salesImport: "Import",
  settings: "Settings",
  audit: "Audit",
  bugs: "Bugs",
};

const TAB_COUNT = 4;

/**
 * Mobile navigation (<lg). The desktop sidebar is hidden and replaced by a fixed
 * bottom bar of the 4 most-relevant nav items for the role, plus a "More"
 * hamburger (bottom-right) that opens a slide-up sheet with the remaining items
 * and the account / role-switch / logout menu.
 */
export function MobileNav({
  role,
  persona,
  isAdmin,
  impersonating,
}: {
  role: RoleKey;
  persona: PersonaVM;
  isAdmin: boolean;
  impersonating: RoleKey | null;
}) {
  const pathname = usePathname();
  const active = activeNavHref(pathname);
  const { main, sales, admin } = visibleNav(role);
  const all: NavItem[] = [...main, ...sales, ...admin];
  const tabs = all.slice(0, TAB_COUNT);
  const rest = all.slice(TAB_COUNT);
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Full-nav slide-up sheet */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col overflow-hidden rounded-t-2xl bg-gradient-to-b from-brand-900 to-brand-950 text-white shadow-modal animate-[fadeUp_0.22s_ease-out]">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <div className="text-[11px] font-bold uppercase tracking-[1px] text-white/50">Menu</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 overflow-y-auto px-4 py-3">
              {rest.map((item) => {
                const Icon = NavIcons[item.id];
                const on = active === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[10px] px-3 py-3 text-[13.5px]",
                      on ? "bg-white/[0.14] font-semibold text-white" : "text-white/70 hover:bg-white/[0.08]",
                    )}
                  >
                    <Icon className="opacity-85" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <AccountMenu persona={persona} isAdmin={isAdmin} impersonating={impersonating} />
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-white shadow-[0_-1px_10px_rgba(0,0,0,0.06)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((item) => {
          const on = active === item.href;
          const Icon = NavIcons[item.id];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[9.5px] font-semibold",
                on ? "text-[#678722]" : "text-[#9E9E9E]",
              )}
            >
              <Icon className="h-[21px] w-[21px]" />
              <span className="max-w-full truncate px-1">{SHORT[item.id]}</span>
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="More menu"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[9.5px] font-semibold",
              open ? "text-[#678722]" : "text-[#9E9E9E]",
            )}
          >
            <svg className="h-[21px] w-[21px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <span>More</span>
          </button>
        )}
      </nav>
    </>
  );
}
