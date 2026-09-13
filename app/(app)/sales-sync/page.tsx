import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salesApiConfig } from "@/lib/sales-api";
import { addDays, getSyncSettings, todayIst } from "@/lib/sales-sync";
import { getActiveSalesSync } from "@/app/actions/sales-sync";
import { SalesSyncScreen, type CoverageDay, type DayBar, type RunRow, type SyncStats } from "@/components/sales-sync/SalesSyncScreen";
import type { LastRunVM } from "@/components/sales-sync/SalesSyncRunCard";

export const dynamic = "force-dynamic";

const IST = "Asia/Kolkata";
const fmtWhen = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: IST });
const dayKey = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function SalesSyncPage() {
  const role = await getRole();
  if (role !== "sysadmin" && role !== "central") notFound();
  const isSysadmin = role === "sysadmin";

  const today = todayIst();
  const since30 = new Date(`${addDays(today, -29)}T00:00:00+05:30`);
  const since60 = new Date(`${addDays(today, -59)}T00:00:00Z`);

  let runs: RunRow[] = [];
  let days: DayBar[] = [];
  let coverage: CoverageDay[] = [];
  let stats: SyncStats = { runs30: 0, success30: 0, failed30: 0, records30: 0, bills30: 0, newCustomers30: 0, avgDurationMs: null, totalBills: 0, totalLines: 0, totalFarmers: 0, lastBillDate: null };
  let lastRun: LastRunVM | null = null;
  let active = null;
  let settings = { lookbackDays: 1, enabled: true };

  try {
    const [rows, totalBills, totalLines, totalFarmers, lastSale, cov] = await Promise.all([
      prisma.salesImport.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.sale.count({ where: { source: "REAL" } }),
      prisma.saleLine.count({ where: { source: "REAL" } }),
      prisma.farmer.count({ where: { source: "REAL" } }),
      prisma.sale.findFirst({ where: { source: "REAL", soldAt: { not: null } }, orderBy: { soldAt: "desc" }, select: { soldAt: true } }),
      prisma.$queryRaw<{ day: string; lines: number }[]>`
        SELECT to_char("soldAt", 'YYYY-MM-DD') AS day, COUNT(*)::int AS lines
        FROM "SaleLine" WHERE "source" = 'REAL' AND "soldAt" >= ${since60}
        GROUP BY 1 ORDER BY 1`,
    ]);
    [active, settings] = await Promise.all([getActiveSalesSync(), getSyncSettings()]);

    runs = rows.map((r) => ({
      id: r.id, label: r.filename, kind: r.kind, trigger: r.trigger, status: r.status, by: r.uploadedBy ?? "",
      fromDate: r.fromDate, toDate: r.toDate, rangeStart: r.rangeStart, rangeEnd: r.rangeEnd,
      apiRecords: r.apiRecords ?? r.lineItems, bills: r.bills, salesInserted: r.salesInserted, linesInserted: r.linesInserted, newCustomers: r.newCustomers, skipped: r.skipped,
      durationMs: r.durationMs, error: r.error, when: fmtWhen(r.createdAt), dayKey: dayKey(r.createdAt),
    }));

    // 30-day activity by run day (IST).
    const byDay = new Map<string, DayBar>();
    for (let i = 29; i >= 0; i--) { const d = addDays(today, -i); byDay.set(d, { day: d, label: shortDay(d), bills: 0, records: 0, runs: 0, failed: 0 }); }
    const recent = rows.filter((r) => r.createdAt >= since30);
    for (const r of recent) {
      const b = byDay.get(dayKey(r.createdAt)); if (!b) continue;
      b.runs += 1; b.bills += r.salesInserted ?? 0; b.records += r.apiRecords ?? r.lineItems ?? 0; if (r.status === "FAILED") b.failed += 1;
    }
    days = [...byDay.values()];
    const done = recent.filter((r) => r.status !== "RUNNING");
    const durations = done.map((r) => r.durationMs).filter((x): x is number => x != null);
    stats = {
      runs30: done.length, success30: done.filter((r) => r.status === "SUCCESS").length, failed30: done.filter((r) => r.status === "FAILED").length,
      records30: done.reduce((a, r) => a + (r.apiRecords ?? r.lineItems ?? 0), 0), bills30: done.reduce((a, r) => a + (r.salesInserted ?? 0), 0),
      newCustomers30: done.reduce((a, r) => a + (r.newCustomers ?? 0), 0), avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      totalBills, totalLines, totalFarmers, lastBillDate: lastSale?.soldAt ? shortDay(lastSale.soldAt.toISOString().slice(0, 10)) : null,
    };
    const covMap = new Map(cov.map((c) => [c.day, c.lines]));
    for (let i = 59; i >= 0; i--) { const d = addDays(today, -i); coverage.push({ day: d, label: shortDay(d), lines: covMap.get(d) ?? 0 }); }
    const last = rows.find((r) => r.status !== "RUNNING");
    if (last) lastRun = { when: fmtWhen(last.createdAt), status: last.status, label: last.filename, trigger: last.trigger, bills: last.salesInserted, newCustomers: last.newCustomers, apiRecords: last.apiRecords, error: last.error };
  } catch {
    // DB unreachable — render the empty layout.
  }

  return <SalesSyncScreen runs={runs} days={days} coverage={coverage} stats={stats} apiReady={salesApiConfig().ready} settings={settings} initialActive={active} lastRun={lastRun} isSysadmin={isSysadmin} />;
}
