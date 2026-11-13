import { notFound } from "next/navigation";
import { getReport } from "@/app/actions/custom-analytics";
import { ReportViewer } from "@/components/custom-analytics/ReportViewer";

export const dynamic = "force-dynamic";

/** A saved custom report (owner or shared-with user), read-only, in the viewer's own scope. */
export default async function CustomReportPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const report = await getReport(id);
  if (!report) notFound();
  return <ReportViewer report={report} />;
}
