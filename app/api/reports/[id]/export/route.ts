import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { buildReportXlsx } from "@/lib/report-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One weekly report as .xlsx. Same access as the report page: the RM it belongs to, or Central / admin (R4). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [session, role] = await Promise.all([getSession(), getRole()]);
  const id = Number(params.id);
  if (!session || !canAccess("weeklyReports", role) || !Number.isInteger(id)) return new NextResponse("Not found", { status: 404 });
  const row = await prisma.weeklyReport.findUnique({ where: { id }, select: { rmUserId: true, rmName: true } });
  if (!row || (role === "regional" && row.rmUserId !== session.userId)) return new NextResponse("Not found", { status: 404 });
  const file = await buildReportXlsx(id);
  if (!file) return new NextResponse("This report isn't ready yet.", { status: 409 });
  await logAudit("WeeklyReport", "EXPORT", `Exported weekly report #${id} (${row.rmName})`, session.name);
  return new NextResponse(file.buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
