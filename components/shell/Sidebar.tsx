"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { activeNavHref, visibleNav, type NavItem } from "@/lib/nav";
import type { RoleKey } from "@/lib/roles";
import { NavIcons } from "../icons";
import { AccountMenu } from "./AccountMenu";

interface PersonaVM {
  name: string;
  role: string;
  init: string;
  color: string;
}

function NavLink({ item, active, badge, badgeTitle }: { item: NavItem; active: boolean; badge?: number; badgeTitle?: string }) {
  const Icon = NavIcons[item.id];
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3.5 py-[11px] text-[13.5px] transition-all duration-150",
        active
          ? "bg-white/[0.12] font-semibold text-white"
          : "font-normal text-white/60 hover:bg-white/[0.08]",
      )}
    >
      <Icon className="opacity-85" />
      {item.label}
      {badge ? (
        <span
          className="ml-auto rounded-full bg-[#E53935] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
          title={`${badge} ${badgeTitle ?? "overdue"}`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({
  role,
  persona,
  isAdmin,
  impersonating,
  overdueActions = 0,
  pendingReviews = 0,
}: {
  role: RoleKey;
  persona: PersonaVM;
  isAdmin: boolean;
  impersonating: RoleKey | null;
  overdueActions?: number;
  pendingReviews?: number;
}) {
  const pathname = usePathname();
  const active = activeNavHref(pathname);
  const { main, sales, admin, showSalesGroup, showAdminGroup } = visibleNav(role);

  return (
    <nav className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col text-white shadow-sidebar bg-gradient-to-b from-brand-900 to-brand-950 lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-3.5 border-b border-white/[0.08] px-[22px] pt-6 pb-5">
        <img
          src="/logo-mark.svg"
          alt="Verde Field Intel"
          className="box-border h-[46px] w-[46px] rounded-full bg-white p-0.5"
        />
        <div>
          <div className="text-[15px] font-bold tracking-[0.3px]">Verde Field Intel</div>
          <div className="mt-0.5 text-[10px] tracking-[0.5px] opacity-50">VERDE AGROTECH</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        {main.map((item) => (
          <NavLink key={item.id} item={item} active={active === item.href}
            badge={item.id === "actionRegistry" ? overdueActions : item.id === "visitRepo" ? pendingReviews : undefined}
            badgeTitle={item.id === "visitRepo" ? "awaiting review" : "overdue"} />
        ))}

        {showSalesGroup && (
          <>
            <div className="mt-3 px-3.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[1px] text-white/25">
              Sales
            </div>
            {sales.map((item) => (
              <NavLink key={item.id} item={item} active={active === item.href} />
            ))}
          </>
        )}

        {showAdminGroup && (
          <>
            <div className="mt-3 px-3.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[1px] text-white/25">
              Administration
            </div>
            {admin.map((item) => (
              <NavLink key={item.id} item={item} active={active === item.href} />
            ))}
          </>
        )}
      </div>

      {/* Account / role switcher */}
      <AccountMenu persona={persona} isAdmin={isAdmin} impersonating={impersonating} />
    </nav>
  );
}
