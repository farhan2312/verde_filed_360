import { notFound, redirect } from "next/navigation";
import { getReport } from "@/app/actions/custom-analytics";
import { ReportBuilder } from "@/components/custom-analytics/ReportBuilder";

export const dynamic = "force-dynamic";

/** Edit a custom report in the builder — owner only (others are sent to the read-only view). */
export default async function EditCustomReportPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const report = await getReport(id);
  if (!report) notFound();
  if (!report.isOwner) redirect(`/analytics/custom/${id}`);
  return <ReportBuilder initial={report} />;
}
