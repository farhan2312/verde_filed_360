import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { getSession } from "@/lib/auth";
import { canAccess } from "@/lib/roles";
import { istYmd, weekFromStart } from "@/lib/weekly-report";
import type { ReportStats, ReportSummary } from "@/lib/report-types";
import { ReportView } from "@/components/reports/ReportView";
import { PrintButton, RegenerateButton } from "@/components/reports/ReportAdminButtons";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // "Regenerate" builds inline

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const role = await getRole();
  if (!canAccess("weeklyReports", role)) notFound();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const session = await getSession();
  const row = await prisma.weeklyReport.findUnique({ where: { id } }).catch(() => null);
  if (!row || !session) notFound();
  // R4: an RM sees only their own report; Central / sysadmin see every region's.
  if (role === "regional" && row.rmUserId !== session.userId) notFound();

  const week = weekFromStart(istYmd(row.weekStart));
  const generatedAt = row.generatedAt
    ? row.generatedAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    : "";

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <Link href={role === "regional" ? "/reports" : `/reports?week=${week.startYmd}`} prefetch={false} className="no-print mb-3 inline-flex items-center gap-1.5 text-[13px] text-[#757575] hover:text-[#7DA02E]">← All reports</Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#7DA02E]">Weekly visit review report</div>
          <div className="text-[20px] font-bold text-[#1A1C1A]">{row.rmName}</div>
          <div className="text-[12.5px] text-[#757575]">{week.label}{row.stats ? ` · ${(row.stats as unknown as ReportStats).storeCount} stores` : ""}</div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {row.status === "DONE" && (
            <>
              <a href={`/api/reports/${row.id}/export`} className="rounded-[10px] bg-[#66852A] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#7DA02E]">⬇ Excel</a>
              <PrintButton />
            </>
          )}
          {session.isAdmin && <RegenerateButton id={row.id} />}
        </div>
      </div>

      {row.status === "DONE" && row.stats ? (
        <ReportView stats={row.stats as unknown as ReportStats} summary={(row.summary as unknown as ReportSummary) ?? null} generatedAt={generatedAt} />
      ) : row.status === "PENDING" ? (
        <div className="rounded-[14px] border border-[#F5CE8E] bg-[#FFF8E1] px-4 py-10 text-center text-[13px] text-[#8D6E00]">This report is being generated — check back shortly.</div>
      ) : (
        <div className="rounded-[14px] border border-[#FFCDD2] bg-[#FDECEA] px-4 py-10 text-center text-[13px] text-[#C62828]">
          This report couldn’t be generated{row.error ? `: ${row.error}` : "."} {row.attempts < 3 ? "It will be retried automatically." : session.isAdmin ? "Use Regenerate to try again." : "Ask a system admin to regenerate it."}
        </div>
      )}
    </div>
  );
}
