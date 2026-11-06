import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { getSession } from "@/lib/auth";
import { canAccess } from "@/lib/roles";
import { getReviewTrend, type TrendData } from "@/lib/review-trend";
import { ReportsTabs } from "@/components/reports/ReportsTabs";
import { TrendCharts } from "@/components/reports/TrendCharts";

export const dynamic = "force-dynamic";

/** Review-completion trend (P1): RM → their own stores; Central / admin → all regions + RM heatmap. */
export default async function ReportTrendPage() {
  const role = await getRole();
  if (!canAccess("weeklyReports", role)) notFound();
  const session = await getSession();
  const isRm = role === "regional";
  let data: TrendData | null = null;
  try {
    data = await getReviewTrend({ weeks: 12, ...(isRm ? { onlyUserId: session?.userId ?? -1 } : {}) });
  } catch { /* DB unavailable */ }

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <ReportsTabs active="trend" showCompare={!isRm} />
      {!data ? (
        <div className="rounded-[14px] bg-white px-4 py-12 text-center text-[13px] text-[#9E9E9E]">Trend data is unavailable right now.</div>
      ) : isRm && !data.rows.length ? (
        <div className="rounded-[14px] bg-white px-4 py-12 text-center text-[13px] text-[#9E9E9E]">No stores are mapped to you yet, so there’s no trend to show.</div>
      ) : (
        <TrendCharts data={data} showHeatmap={!isRm} />
      )}
    </div>
  );
}
