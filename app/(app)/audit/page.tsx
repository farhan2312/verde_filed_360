import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { type AuditRowData } from "@/components/audit/AuditTable";
import { AuditScreen } from "@/components/audit/AuditScreen";

export const dynamic = "force-dynamic";

async function getAuditRows(): Promise<AuditRowData[]> {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return logs.map((l) => ({
      id: l.id,
      // Fall back to the real createdAt when no display string was stored (newer entries).
      displayTs: l.displayTs || l.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }),
      actor: l.actor ?? "",
      action: l.action,
      detail: l.detail ?? "",
      ip: l.ip ?? "",
    }));
  } catch {
    // DB not configured / seeded yet — render the empty table layout.
    return [];
  }
}

export default async function AuditPage() {
  // Sysadmin-only: enforce the gate at the route level, not just the nav link.
  if ((await getRole()) !== "sysadmin") notFound();

  const rows = await getAuditRows();
  return <AuditScreen auditRows={rows} />;
}
