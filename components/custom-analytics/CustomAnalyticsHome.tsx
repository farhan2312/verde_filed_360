"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listMyReports, listSharedReports, createFromTemplate, deleteReport, copyReport, type ReportCard } from "@/app/actions/custom-analytics";
import { TEMPLATES } from "@/lib/custom-analytics/templates";
import { useConfirm } from "@/components/ConfirmDialog";

const CARD = "rounded-[14px] border border-black/[0.05] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Analytics → "My analytics" (own reports + templates) or "Shared with me". */
export function CustomAnalyticsHome({ kind }: { kind: "mine" | "shared" }) {
  const router = useRouter();
  const [list, setList] = useState<ReportCard[] | null>(null);
  const [busy, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  useEffect(() => { setList(null); (kind === "mine" ? listMyReports() : listSharedReports()).then(setList); }, [kind]);

  const fromTemplate = (id: string) => start(async () => { const r = await createFromTemplate(id); if (r.ok && r.id) router.push(`/analytics/custom/${r.id}/edit`); else alert(r.error); });
  const copy = (id: number) => start(async () => { const r = await copyReport(id); if (r.ok && r.id) router.push(`/analytics/custom/${r.id}/edit`); else alert(r.error); });
  const remove = async (c: ReportCard) => {
    if (!(await confirm({ title: "Delete this report?", message: <><b>{c.title}</b> will be removed for you and everyone it's shared with. This can't be undone.</>, confirmLabel: "Delete report" }))) return;
    start(async () => { const r = await deleteReport(c.id); if (r.ok) setList((l) => l?.filter((x) => x.id !== c.id) ?? null); else alert(r.error); });
  };

  return (
    <div className="animate-[fadeUp_0.3s_ease-out]">
      {dialog}
      {kind === "mine" && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] text-[#757575]">Build your own dashboards from sales, farmers, visits, campaigns, follow-ups, Ghoshti and stores. Numbers always respect what each viewer is allowed to see.</div>
            <Link href="/analytics/custom/new" className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[13px] font-semibold text-white">+ New report</Link>
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">Start from a template</div>
          <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" disabled={busy} onClick={() => fromTemplate(t.id)}
                className={`${CARD} p-3.5 text-left transition-colors hover:border-[#7DA02E]/40 hover:bg-[#F5F9EA] disabled:opacity-60`}>
                <div className="text-[14px] font-bold text-[#1A1C1A]">{t.icon} {t.title}</div>
                <div className="mt-1 text-[11.5px] leading-snug text-[#757575]">{t.description}</div>
                <div className="mt-2 text-[11.5px] font-semibold text-[#7DA02E]">Use template →</div>
              </button>
            ))}
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">Your reports</div>
        </>
      )}

      {!list ? (
        <div className={`${CARD} px-4 py-10 text-center text-[13px] text-[#9E9E9E]`}>Loading…</div>
      ) : list.length === 0 ? (
        <div className={`${CARD} px-4 py-10 text-center text-[13px] text-[#9E9E9E]`}>
          {kind === "mine" ? "No reports yet — start from a template above, or press '+ New report'." : "Nobody has shared a report with you yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className={`${CARD} flex flex-col p-4`}>
              <Link href={`/analytics/custom/${c.id}`} className="text-[14.5px] font-bold text-[#1A1C1A] hover:text-[#7DA02E]">{c.title}</Link>
              {c.description && <div className="mt-0.5 line-clamp-2 text-[12px] text-[#757575]">{c.description}</div>}
              <div className="mt-2 text-[11px] text-[#9E9E9E]">
                {c.pages} page{c.pages === 1 ? "" : "s"} · {c.visuals} visual{c.visuals === 1 ? "" : "s"} · updated {fmtDate(c.updatedAt)}
                {kind === "mine" ? (c.shares ? ` · shared with ${c.shares}` : "") : ` · by ${c.ownerName}`}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/analytics/custom/${c.id}`} className="rounded-[8px] bg-[#F5F9EA] px-3 py-1.5 text-[12px] font-semibold text-[#7DA02E]">Open</Link>
                {kind === "mine" && <Link href={`/analytics/custom/${c.id}/edit`} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#455A64]">✎ Edit</Link>}
                {kind === "shared" && <button type="button" disabled={busy} onClick={() => copy(c.id)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#455A64]">⧉ Make a copy</button>}
                {kind === "mine" && <button type="button" disabled={busy} onClick={() => remove(c)} className="ml-auto rounded-[8px] px-2 py-1.5 text-[12px] font-semibold text-[#C62828] hover:bg-[#FDECEA]">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
