import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { AuditScreen } from "@/components/audit/AuditScreen";
import { getAuditLog, getAuditActionTypes, type AuditPage } from "@/app/actions/audit";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  // Sysadmin-only: enforce the gate at the route level, not just the nav link.
  if ((await getRole()) !== "sysadmin") notFound();

  let auditInitial: AuditPage = { rows: [], nextCursor: null };
  try { auditInitial = await getAuditLog({ limit: 100 }); } catch { /* DB not ready - render empty */ }
  const actionTypes = await getAuditActionTypes();
  return <AuditScreen auditInitial={auditInitial} actionTypes={actionTypes} />;
}
