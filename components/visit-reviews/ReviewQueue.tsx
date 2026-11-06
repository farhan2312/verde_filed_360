"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VisitPagination } from "@/components/visits-repo/VisitPagination";
import { ReviewDrawer } from "./ReviewDrawer";
import type { QueueCounts, QueueFilters, QueueOptions, QueueRow, QueueStatus, SlaState } from "./types";

const PILLS: { key: QueueStatus; label: string; tone: string }[] = [
  { key: "all", label: "All", tone: "#455A64" },
  { key: "pending", label: "Pending", tone: "#E65100" },
  { key: "overdue", label: "Overdue", tone: "#C62828" },
  { key: "flagged", label: "Needs follow-up", tone: "#EF6C00" },
  { key: "reviewed", label: "Reviewed", tone: "#7DA02E" },
];
const n = (x: number) => x.toLocaleString("en-IN");
const sel = "rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-2 text-[12.5px] text-[#1A1C1A] outline-none focus:border-[#7DA02E]";

/**
 * Visit Reviews queue (R1): pending-first list of the reviewer's in-scope visits with status pills,
 * filters (URL-driven, server-rendered), SLA markers, and a side drawer to review without leaving.
 */
export function ReviewQueue({ rows, counts, total, page, pageSize, filters, options, slaHours }: {
  rows: QueueRow[]; counts: QueueCounts; total: number; page: number; pageSize: number;
  filters: QueueFilters; options: QueueOptions; slaHours: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<number | null>(() => Number(searchParams.get("open")) || null);
  const [q, setQ] = useState(filters.q);
  useEffect(() => setQ(filters.q), [filters.q]);

  const setParam = useCallback((patch: Partial<Record<keyof QueueFilters, string>>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "all" || (k === "sort" && v === "newest")) p.delete(k); else p.set(k, v);
    }
    p.delete("page");
    p.delete("open");
    const qs = p.toString();
    router.push(qs ? `/visit-reviews?${qs}` : "/visit-reviews");
  }, [router, searchParams]);

  const anyFilter = filters.officer !== "all" || filters.store !== "all" || filters.rm !== "all" || !!filters.q || !!filters.from || !!filters.to;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {/* Status pills */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PILLS.map((p) => {
          const on = filters.status === p.key;
          return (
            <button key={p.key} type="button" onClick={() => setParam({ status: p.key })}
              className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{ borderColor: on ? p.tone : "#E0E0E0", background: on ? `${p.tone}14` : "#fff", color: on ? p.tone : "#616161" }}>
              {p.label}
              <span className="rounded-full px-1.5 text-[11px] font-bold" style={{ background: on ? p.tone : "#F0F0F0", color: on ? "#fff" : "#757575" }}>{n(counts[p.key])}</span>
            </button>
          );
        })}
        <span className="ml-auto text-[11.5px] text-[#9E9E9E]">SLA: review within <b className="text-[#616161]">{slaHours}h</b> of the visit being logged</span>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-[14px] border border-black/[0.04] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <form className="min-w-[200px] flex-1" onSubmit={(e) => { e.preventDefault(); setParam({ q: q.trim() }); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search farmer, village, mobile or officer… (Enter)"
            className={`${sel} w-full`} />
        </form>
        <select className={sel} value={filters.officer} onChange={(e) => setParam({ officer: e.target.value })} aria-label="Officer">
          <option value="all">All officers</option>
          {options.officers.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className={sel} value={filters.store} onChange={(e) => setParam({ store: e.target.value })} aria-label="Store">
          <option value="all">All stores</option>
          {options.stores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {options.rms && (
          <select className={sel} value={filters.rm} onChange={(e) => setParam({ rm: e.target.value })} aria-label="Regional Manager">
            <option value="all">All RMs</option>
            {options.rms.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            <option value="__none">Unassigned (no RM)</option>
          </select>
        )}
        <label className="flex flex-col text-[10px] font-semibold uppercase text-[#9E9E9E]">Visit from
          <input type="date" className={sel} value={filters.from} onChange={(e) => setParam({ from: e.target.value })} />
        </label>
        <label className="flex flex-col text-[10px] font-semibold uppercase text-[#9E9E9E]">to
          <input type="date" className={sel} value={filters.to} onChange={(e) => setParam({ to: e.target.value })} />
        </label>
        <select className={sel} value={filters.sort} onChange={(e) => setParam({ sort: e.target.value })} aria-label="Sort">
          <option value="newest">Newest logged first</option>
          <option value="oldest">Oldest logged first</option>
        </select>
        {anyFilter && (
          <button type="button" onClick={() => setParam({ officer: "", store: "", rm: "", q: "", from: "", to: "" })}
            className="rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#C62828] hover:bg-[#FDECEA]">Clear filters</button>
        )}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="hidden grid-cols-[150px_1fr_1.3fr_1.1fr_1fr_120px] gap-3 border-b border-[#F0F0F0] bg-[#FAFAFA] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E] md:grid">
          <div>Status</div><div>Visit</div><div>Farmer</div><div>Officer · Store</div><div>Type · Crop</div><div className="text-right">Waiting / took</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-[#9E9E9E]">
            {filters.status === "pending" || filters.status === "overdue" ? "Nothing waiting — all caught up. 🎉" : "No visits match these filters."}
          </div>
        ) : rows.map((r) => (
          <button key={r.id} type="button" onClick={() => setOpenId(r.id)}
            className={`grid w-full grid-cols-1 gap-1.5 border-b border-[#F5F5F5] px-4 py-3 text-left transition-colors hover:bg-[#F7FAF7] md:grid-cols-[150px_1fr_1.3fr_1.1fr_1fr_120px] md:items-center md:gap-3 ${openId === r.id ? "bg-[#EEF6EE]" : ""}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip reviewed={r.reviewed} />
              {r.flagged && <span className="rounded-full bg-[#F5CE8E] px-1.5 py-0.5 text-[10px] font-bold text-[#E65100]" title="Needs follow-up">🚩</span>}
              {r.rating != null && <span className="text-[11px] font-semibold text-[#EDA942]" title={`${r.rating}/5`}>★{r.rating}</span>}
            </div>
            <div className="text-[12.5px]">
              <div className="font-semibold text-[#1A1C1A]">{r.visitDate}</div>
              <div className="text-[11px] text-[#9E9E9E]">logged {r.loggedAt}</div>
            </div>
            <div className="min-w-0 text-[12.5px]">
              <div className="truncate font-semibold text-[#1A1C1A]">{r.farmer}</div>
              {r.village && <div className="truncate text-[11px] text-[#9E9E9E]">{r.village}</div>}
            </div>
            <div className="min-w-0 text-[12.5px]">
              <div className="truncate text-[#424242]">{r.officer}</div>
              <div className="truncate text-[11px] text-[#1565C0]">{r.store}{r.rm && options.rms ? ` · ${r.rm}` : ""}</div>
            </div>
            <div className="min-w-0 text-[12px] text-[#616161]">
              <div className="truncate">{r.purpose || "—"}</div>
              {r.crop && <div className="truncate text-[11px] text-[#9E9E9E]">{r.crop}</div>}
            </div>
            <div className="md:text-right"><SlaBadge sla={r.sla} age={r.age} /></div>
          </button>
        ))}
      </div>

      <VisitPagination basePath="/visit-reviews" page={page} pageCount={pageCount} total={total} pageSize={pageSize} shown={rows.length} />

      {openId != null && (
        <ReviewDrawer visitId={openId} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}

function StatusChip({ reviewed }: { reviewed: boolean }) {
  return reviewed
    ? <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[10.5px] font-bold text-[#7DA02E]">✓ Reviewed</span>
    : <span className="rounded-full bg-[#FFF3E0] px-2 py-0.5 text-[10.5px] font-bold text-[#E65100]">Pending</span>;
}

const SLA_STYLE: Record<SlaState, { bg: string; color: string; label: (a: string) => string; title: string }> = {
  ok: { bg: "#F5F5F5", color: "#616161", label: (a) => `${a} waiting`, title: "Within SLA" },
  "due-soon": { bg: "#FFF8E1", color: "#8D6E00", label: (a) => `Due soon · ${a}`, title: "Approaching the review SLA" },
  overdue: { bg: "#FDECEA", color: "#C62828", label: (a) => `Overdue · ${a}`, title: "Past the review SLA" },
  met: { bg: "#F5F9EA", color: "#7DA02E", label: (a) => `✓ in ${a}`, title: "Reviewed within SLA" },
  late: { bg: "#FFF3E0", color: "#E65100", label: (a) => `Late · ${a}`, title: "Reviewed after the SLA" },
};

function SlaBadge({ sla, age }: { sla: SlaState; age: string }) {
  const s = SLA_STYLE[sla];
  return <span title={s.title} className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.color }}>{s.label(age)}</span>;
}
