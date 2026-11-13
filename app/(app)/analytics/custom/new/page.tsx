import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { ReportBuilder } from "@/components/custom-analytics/ReportBuilder";

export const dynamic = "force-dynamic";

/** Custom analytics — a blank report in the builder (saved on first Save). */
export default async function NewCustomReportPage() {
  const role = await getRole();
  if (role === "campaigner" || !canAccess("analytics", role)) notFound();
  return <ReportBuilder initial={null} />;
}
