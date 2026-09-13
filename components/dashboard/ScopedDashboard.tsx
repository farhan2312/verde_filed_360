export interface ScopedKpi { farmers: number; hni: number; potentialHni: number; revenue12m: number; visits: number; leadsConverted: number }
export interface ScopedSegBar { key: string; label: string; count: number; color: string; bg: string }
export interface ScopedRecentVisit { id: number; farmer: string; village: string; officer: string; date: string; status: string }
export interface ScopedDashboardData {
  kind: "store" | "zone" | "global";
  label: string; // store name, region name, or "All regions"
  sub: string; // secondary line
  kpi: ScopedKpi;
  segments: ScopedSegBar[];
  recent: ScopedRecentVisit[];
}

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

/** Scope header — the greeting + role-scoped context banner (officer→store, RM→region, central→org-wide). */
export function ScopedDashboard({ data, name }: { data: ScopedDashboardData; name: string }) {
  const scopeChip = data.kind === "store" ? "My store only" : data.kind === "zone" ? "My district only" : "Organization-wide";
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#516A1B] to-[#678722] px-5 py-4">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-white/70">Namaste, {name}</div>
          <div className="truncate text-[18px] font-bold text-white">{data.label}</div>
          <div className="mt-0.5 text-[12px] text-white/80">{data.sub}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white" title="Leads (registered before any purchase) who have since bought — cumulative">
            🌱 {data.kpi.leadsConverted.toLocaleString("en-IN")} leads converted
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white">{scopeChip}</span>
        </div>
      </div>
    </div>
  );
}

/** Shown when a scoped user has no store/region assigned — they must not fall through to global data. */
export function UnassignedDashboard({ name, kind }: { name: string; kind: "store" | "region" }) {
  return (
    <div className={`${CARD} p-8 text-center`}>
      <div className="text-[15px] font-bold text-[#1A1C1A]">Namaste, {name}</div>
      <div className="mx-auto mt-2 max-w-[420px] text-[13px] text-[#757575]">
        No {kind} is assigned to your account yet, so there's no data to show. Ask a System Admin to link your account to a {kind} on the Users page.
      </div>
    </div>
  );
}
