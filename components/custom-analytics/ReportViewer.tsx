"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copyReport, deleteReport, pinReport, type ReportFull } from "@/app/actions/custom-analytics";
import type { CrossFilter, PageFilters } from "@/lib/custom-analytics/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { GridCanvas } from "./GridCanvas";
import { PageFiltersBar } from "./PageFiltersBar";
import { ShareModal } from "./ShareModal";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * A saved report, read-only: page tabs, page filters (viewers can change them — not saved), click-to-filter,
 * and the owner / viewer actions. `embedded` = shown inside an Analytics tab (pinned report).
 */
export function ReportViewer({ report, embedded }: { report: ReportFull; embedded?: boolean }) {
  const router = useRouter();
  const pages = report.doc.pages;
  const [pageIdx, setPageIdx] = useState(0);
  const [filters, setFilters] = useState<Record<string, PageFilters>>(() => Object.fromEntries(pages.map((p) => [p.id, p.filters ?? {}])));
  const [cf, setCf] = useState<CrossFilter | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shares, setShares] = useState(report.shares);
  const [pinned, setPinned] = useState(report.pinned);
  const [busy, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const page = pages[Math.min(pageIdx, pages.length - 1)];

  const togglePin = () => start(async () => { const r = await pinReport(pinned ? null : report.id); if (r.ok) { setPinned(!pinned); router.refresh(); } });
  const copy = () => start(async () => { const r = await copyReport(report.id); if (r.ok && r.id) router.push(`/analytics/custom/${r.id}/edit`); else alert(r.error); });
  const remove = async () => {
    if (!(await confirm({ title: "Delete this report?", message: <><b>{report.title}</b> will be removed for you and everyone it's shared with. This can't be undone.</>, confirmLabel: "Delete report" }))) return;
    start(async () => { const r = await deleteReport(report.id); if (r.ok) { router.push("/analytics?tab=mine"); router.refresh(); } else alert(r.error); });
  };

  const btn = "rounded-[10px] border border-[#E0E0E0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#424242] hover:bg-[#F5F7F5] disabled:opacity-50";
  return (
    <div className="animate-[fadeUp_0.3s_ease-out]">
      {dialog}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {!embedded && <Link href={report.isOwner ? "/analytics?tab=mine" : "/analytics?tab=shared"} className="text-[12px] font-semibold text-[#7DA02E] hover:underline">← Back to Analytics</Link>}
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[18px] font-bold text-[#1A1C1A]">{embedded && "📌 "}{report.title}</h1>
            {!report.isOwner && <span className="rounded-full bg-[#E3F2FD] px-2 py-0.5 text-[10.5px] font-semibold text-[#1565C0]">Shared by {report.ownerName}</span>}
          </div>
          <div className="text-[11.5px] text-[#9E9E9E]">{report.description ? `${report.description} · ` : ""}Updated {fmtDate(report.updatedAt)} · numbers are limited to what you can see</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.isOwner && <Link href={`/analytics/custom/${report.id}/edit`} className={`${btn} border-[#7DA02E] text-[#7DA02E]`}>✎ Edit</Link>}
          {report.isOwner && <button type="button" onClick={() => setSharing(true)} className={btn}>👥 Share{shares.length ? ` · ${shares.length}` : ""}</button>}
          {!report.isOwner && <button type="button" onClick={copy} disabled={busy} className={btn}>⧉ Make a copy</button>}
          <button type="button" onClick={togglePin} disabled={busy} className={btn} title="Open Analytics on this report">{pinned ? "📌 Unpin" : "📌 Pin to Analytics"}</button>
          {report.isOwner && !embedded && <button type="button" onClick={remove} disabled={busy} className={`${btn} text-[#C62828]`}>Delete</button>}
        </div>
      </div>

      {pages.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1 border-b border-[#E8E8E4]">
          {pages.map((p, i) => (
            <button key={p.id} type="button" onClick={() => { setPageIdx(i); setCf(null); }}
              className={`-mb-px rounded-t-[8px] border-b-2 px-4 py-2 text-[12.5px] font-semibold ${i === pageIdx ? "border-[#7DA02E] text-[#7DA02E]" : "border-transparent text-[#757575] hover:text-[#1A1C1A]"}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3"><PageFiltersBar filters={filters[page.id] ?? {}} onChange={(f) => setFilters((m) => ({ ...m, [page.id]: f }))} cf={cf} onClearCf={() => setCf(null)} /></div>

      {page.visuals.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[#D0D0CC] bg-white px-4 py-12 text-center text-[13px] text-[#9E9E9E]">This page has no visuals yet.</div>
      ) : (
        <GridCanvas visuals={page.visuals} filters={filters[page.id] ?? {}} cf={cf} onCrossFilter={setCf} />
      )}

      {sharing && <ShareModal reportId={report.id} title={report.title} initial={shares.map((s) => s.userId)} onClose={() => setSharing(false)}
        onSaved={(ids) => { setShares(ids.map((userId) => shares.find((s) => s.userId === userId) ?? { userId, name: "", role: "" })); setSharing(false); router.refresh(); }} />}
    </div>
  );
}
