"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routeToView } from "@/lib/nav";
import { viewTitle, type RoleKey } from "@/lib/roles";
import { grouped } from "@/lib/format";
import { canAccess } from "@/lib/roles";
import { SyncBadge } from "../ui";
import { PlusIcon, ShieldIcon } from "../icons";
import { ReportBugButton } from "./ReportBugButton";

export interface HeaderCounts {
  farmers: number;
  activeUsers: number;
  projects: number;
  activeProjects: number;
}

export function Header({ role, counts }: { role: RoleKey; counts: HeaderCounts }) {
  const pathname = usePathname();
  const view = routeToView(pathname);
  let [title, subtitle] = viewTitle(view, role, {
    projectCount: counts.projects,
    activeCount: counts.activeProjects,
  });

  // Subtitles that depend on live counts
  if (view === "farmers")
    subtitle = `${grouped(counts.farmers)} registered farmers · Segmented view`;
  if (view === "users")
    subtitle = `${counts.activeUsers} active users · Role-based access`;
  if (view === "newVisit") subtitle = "Field visit entry · 5 steps";

  // New Visit is a quick-action shortcut — only surface it on the home page (Analytics).
  const showNewVisit = view === "analytics" && canAccess("newVisit", role);
  const isAdmin = role === "sysadmin";

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-line-warm bg-white px-4 lg:px-8">
      <div className="min-w-0">
        <div className="truncate text-lg font-bold text-ink lg:text-xl">{title}</div>
        {subtitle && <div className="mt-px truncate text-[11.5px] text-ink-muted">{subtitle}</div>}
      </div>

      <div className="flex flex-none items-center gap-2 lg:gap-3">
        <span className="hidden sm:inline-flex">
          <SyncBadge />
        </span>

        <Link
          href="/training"
          title="Training documents & videos"
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 py-[7px] text-[12px] font-semibold text-ink-600 transition-colors hover:border-brand-400 hover:text-brand-700"
        >
          <span aria-hidden>🎓</span>
          <span className="hidden sm:inline">Training</span>
        </Link>

        <ReportBugButton />

        {isAdmin && (
          <span className="inline-flex items-center gap-1.5 rounded-[20px] border border-gold-200 bg-orange-50 px-2.5 py-1.5 text-[11px] font-semibold text-orange lg:px-3.5">
            <ShieldIcon className="text-orange" />
            <span className="hidden sm:inline">Admin Mode</span>
          </span>
        )}

        {showNewVisit && (
          <Link
            href="/visits/new"
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 py-[9px] text-[13px] font-semibold tracking-[0.2px] text-white transition-colors hover:bg-brand-700 active:scale-[0.97]"
          >
            <PlusIcon />
            New Visit
          </Link>
        )}
      </div>
    </header>
  );
}
