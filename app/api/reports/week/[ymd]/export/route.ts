import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { buildWeekXlsx } from "@/lib/report-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every region's numbers for one week as .xlsx — Central / admin only. */
export async function GET(_req: Request, { params }: { params: { ymd: string } }) {
  const [session, role] = await Promise.all([getSession(), getRole()]);
  if (!session || !(role === "central" || role === "sysadmin") || !/^\d{4}-\d{2}-\d{2}$/.test(params.ymd)) return new NextResponse("Not found", { status: 404 });
  const file = await buildWeekXlsx(params.ymd);
  if (!file) return new NextResponse("No reports for that week.", { status: 404 });
  await logAudit("WeeklyReport", "EXPORT", `Exported all-region weekly reports for ${params.ymd}`, session.name);
  return new NextResponse(file.buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
