import { redirect } from "next/navigation";
import { getRole, getPersona } from "@/lib/session";
import { getSession } from "@/lib/auth";
import { getHeaderCounts } from "@/lib/stats";
import { countOverdueActions } from "@/app/actions/action-registry";
import { pendingReviewCount } from "@/app/actions/visit-review";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileNav } from "@/components/shell/MobileNav";
import { Header } from "@/components/shell/Header";
import { Heartbeat } from "@/components/shell/Heartbeat";
import type { RoleKey } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login"); // belt-and-suspenders (middleware also guards)

  const [role, persona, counts, overdueActions, pendingReviews] = await Promise.all([
    getRole(),
    getPersona(),
    getHeaderCounts(),
    countOverdueActions(),
    pendingReviewCount(),
  ]);

  const isAdmin = session.isAdmin;
  const impersonating: RoleKey | null =
    isAdmin && role !== session.roleKey ? role : null;

  return (
    <div className="flex min-h-screen bg-canvas">
      <Heartbeat />
      <Sidebar
        role={role}
        persona={persona}
        isAdmin={isAdmin}
        impersonating={impersonating}
        overdueActions={overdueActions}
        pendingReviews={pendingReviews}
      />
      {/*
        min-w-0 is load-bearing: flex items default to min-width:auto, so without it this
        column refuses to shrink below its widest child and any element wider than the phone
        (a min-w-[Npx] table wrapper, a non-wrapping stepper, a long unbreakable token) balloons
        the whole page — mobile browsers then render it zoomed out. overflow-x-clip on <main> is
        the safety net. Wide content must scroll inside its own overflow-x-auto wrapper.
      */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-64">
        <Header role={role} counts={counts} />
        <main className="flex-1 overflow-x-clip px-4 py-5 pb-24 lg:px-8 lg:py-7 lg:pb-7">{children}</main>
      </div>
      <MobileNav
        role={role}
        persona={persona}
        isAdmin={isAdmin}
        impersonating={impersonating}
      />
    </div>
  );
}
