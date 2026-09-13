/** Live analytics — every widget computed from real farmer/sale/segment data. */
import { prisma } from "@/lib/prisma";
import type { HeatmapData } from "@/components/analytics/ProblemHeatmap";
import type { Asr } from "@/components/analytics/AsrLeaderboard";
import type { Region } from "@/components/analytics/RegionalPerformance";
import type { FunnelStep } from "@/components/analytics/ConversionFunnel";
import type { LandSegment } from "@/components/analytics/LandSegmentation";
import type { QualityRow } from "@/components/analytics/DataQualityScore";

export interface KpiCell { label: string; value: string; sub: string }
export interface Insight { title: string; text: string; accent: string }

export interface AnalyticsData {
  kpis: KpiCell[];
  heatmap: HeatmapData;
  asrs: Asr[];
  regions: Region[];
  funnel: FunnelStep[];
  land: LandSegment[];
  quality: QualityRow[];
  insights: Insight[];
}

const rupees = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
const grouped = (n: number) => n.toLocaleString("en-IN");

function sinceFor(period: string): Date {
  const d = new Date();
  if (period === "7d") d.setDate(d.getDate() - 7);
  else if (period === "90d") d.setDate(d.getDate() - 90);
  else if (period === "ytd") return new Date(d.getFullYear(), 0, 1);
  else d.setDate(d.getDate() - 30);
  return d;
}
const raw1 = <T,>(rows: T[]): T | undefined => rows[0];

export async function getAnalytics(period: string): Promise<AnalyticsData> {
  const since = sinceFor(period);
  const P6 = new Date(); P6.setMonth(P6.getMonth() - 6);

  const [
    totalFarmers, revAgg, billsInPeriod, activePeriodRows,
    visits, asrGroups, zoneGroups, activeZoneRows,
    segCounts, activeP12Rows, spendRows, quality,
  ] = await Promise.all([
    prisma.farmer.count(),
    prisma.sale.aggregate({ _sum: { amountNum: true }, where: { soldAt: { gte: since } } }),
    prisma.sale.count({ where: { soldAt: { gte: since } } }),
    prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(DISTINCT "farmerId")::int AS n FROM "Sale" WHERE "soldAt" >= ${since}`,
    prisma.visit.findMany({ where: { mainCrop: { not: null } }, select: { mainCrop: true, currentProblem: true }, take: 20000 }),
    prisma.visit.groupBy({ by: ["officerName"], where: { officerName: { not: null } }, _count: { _all: true }, orderBy: { _count: { officerName: "desc" } }, take: 6 }),
    prisma.farmer.groupBy({ by: ["zone"], where: { zone: { not: null } }, _count: { _all: true }, orderBy: { _count: { zone: "desc" } }, take: 6 }),
    prisma.$queryRaw<{ zone: string; n: number }[]>`SELECT "zone", COUNT(*)::int AS n FROM "Farmer" WHERE "p12mSpend" > 0 AND "zone" IS NOT NULL GROUP BY "zone"`,
    prisma.farmer.groupBy({ by: ["campaignSegment"], where: { campaignSegment: { not: null } }, _count: { _all: true } }),
    prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Farmer" WHERE "p12mSpend" > 0`,
    prisma.$queryRaw<{ bucket: string; n: number }[]>`
      SELECT CASE
        WHEN COALESCE("p12mSpend",0) = 0 THEN '0 · none'
        WHEN "p12mSpend" < 2500 THEN '< ₹2.5K'
        WHEN "p12mSpend" < 5000 THEN '₹2.5–5K'
        WHEN "p12mSpend" < 10000 THEN '₹5–10K'
        WHEN "p12mSpend" < 12000 THEN '₹10–12K (Potential)'
        ELSE '₹12K+ (HNI)' END AS bucket,
        COUNT(*)::int AS n
      FROM "Farmer" GROUP BY 1`,
    (async () => {
      const total = await prisma.farmer.count();
      const one = async (where: object) => (total ? Math.round(((await prisma.farmer.count({ where })) / total) * 100) : 0);
      return {
        mobile: await one({ mobile: { not: null } }),
        village: await one({ village: { not: null } }),
        store: await one({ storeId: { not: null } }),
        segment: await one({ campaignSegment: { not: null } }),
        crop: await one({ cropTags: { isEmpty: false } }),
        gps: await one({ lat: { not: null } }),
      };
    })(),
  ]);

  // ── KPIs ──
  const revenue = revAgg._sum.amountNum ?? 0;
  const activePeriod = raw1(activePeriodRows)?.n ?? 0;
  const avgBill = billsInPeriod ? revenue / billsInPeriod : 0;
  const kpis: KpiCell[] = [
    { label: "Revenue (period)", value: rupees(revenue), sub: `${grouped(billsInPeriod)} bills` },
    { label: "Active Customers", value: grouped(activePeriod), sub: "bought in period" },
    { label: "Avg Bill Value", value: rupees(avgBill), sub: "per invoice" },
    { label: "Total Farmers", value: grouped(totalFarmers), sub: "in the book" },
  ];

  // ── Heatmap: crop × problem (from field visits) ──
  const cropProblem = new Map<string, Map<string, number>>();
  const cropTot = new Map<string, number>(), probTot = new Map<string, number>();
  for (const v of visits) {
    const crop = (v.mainCrop ?? "").trim();
    if (!crop) continue;
    for (const p of v.currentProblem ?? []) {
      const prob = p.replace(/^Other:.*/, "Other").trim();
      if (!prob) continue;
      if (!cropProblem.has(crop)) cropProblem.set(crop, new Map());
      const m = cropProblem.get(crop)!;
      m.set(prob, (m.get(prob) ?? 0) + 1);
      cropTot.set(crop, (cropTot.get(crop) ?? 0) + 1);
      probTot.set(prob, (probTot.get(prob) ?? 0) + 1);
    }
  }
  const topCrops = [...cropTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]);
  const topProbs = [...probTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]);
  const heatmap: HeatmapData = {
    crops: topCrops,
    problems: topProbs,
    data: topCrops.map((c) => topProbs.map((p) => cropProblem.get(c)?.get(p) ?? 0)),
  };

  // ── ASR leaderboard (visits per officer) ──
  const officerNames = asrGroups.map((g) => g.officerName).filter(Boolean) as string[];
  const officers = officerNames.length
    ? await prisma.user.findMany({ where: { name: { in: officerNames } }, select: { name: true, territory: true } })
    : [];
  const terrByName = new Map(officers.map((o) => [o.name, o.territory ?? ""]));
  const topVisits = asrGroups[0]?._count._all ?? 1;
  const asrs: Asr[] = asrGroups.map((g) => ({
    name: g.officerName ?? "—",
    store: terrByName.get(g.officerName ?? "") || "Field",
    visits: g._count._all,
    score: Math.max(20, Math.round((g._count._all / topVisits) * 100)),
  }));

  // ── Regional performance (by zone, revenue/active) ──
  const activeByZone = new Map(activeZoneRows.map((r) => [r.zone, r.n]));
  const maxZone = zoneGroups[0]?._count._all ?? 1;
  const regions: Region[] = zoneGroups.map((z) => {
    const total = z._count._all;
    const active = activeByZone.get(z.zone as string) ?? 0;
    return { name: z.zone as string, visits: total, conv: Math.round((active / Math.max(1, total)) * 100), visitPct: Math.round((total / maxZone) * 100) };
  });

  // ── Value funnel (segment lifecycle) ──
  const segMap = new Map(segCounts.map((s) => [s.campaignSegment as string, s._count._all]));
  const cnt = (s: string) => segMap.get(s) ?? 0;
  const activeP12 = raw1(activeP12Rows)?.n ?? 0;
  const regularish = cnt("REGULAR");
  const highValue = cnt("HNI") + cnt("POTENTIAL_HNI");
  const funnelRaw = [
    { label: "All Customers", count: totalFarmers, color: "#678722" },
    { label: "Active (12M)", count: activeP12, color: "#8CB337" },
    { label: "Regular", count: regularish, color: "#B3D170" },
    { label: "High-value", count: highValue, color: "#EDA942" },
    { label: "HNI", count: cnt("HNI"), color: "#FF8F00" },
  ];
  const funnel: FunnelStep[] = funnelRaw.map((f) => ({ ...f, pct: totalFarmers ? Math.round((f.count / totalFarmers) * 100) : 0 }));

  // ── Segmentation by spend ──
  const spendOrder = ["₹12K+ (HNI)", "₹10–12K (Potential)", "₹5–10K", "₹2.5–5K", "< ₹2.5K", "0 · none"];
  const spendColor: Record<string, string> = { "₹12K+ (HNI)": "#516A1B", "₹10–12K (Potential)": "#678722", "₹5–10K": "#8CB337", "₹2.5–5K": "#B3D170", "< ₹2.5K": "#D3E4AB", "0 · none": "#E0E0E0" };
  const spendMap = new Map(spendRows.map((r) => [r.bucket, r.n]));
  const land: LandSegment[] = spendOrder.filter((b) => spendMap.has(b)).map((b) => ({
    label: b, count: spendMap.get(b) ?? 0, pct: totalFarmers ? Math.round(((spendMap.get(b) ?? 0) / totalFarmers) * 100) : 0, color: spendColor[b],
  }));

  // ── Data quality (profile completeness) ──
  const qColor = (p: number) => (p >= 90 ? "#678722" : p >= 75 ? "#8CB337" : p >= 50 ? "#EDA942" : "#E65100");
  const qualityRows: QualityRow[] = [
    { label: "Mobile Number", pct: quality.mobile, color: qColor(quality.mobile) },
    { label: "Village", pct: quality.village, color: qColor(quality.village) },
    { label: "Store Mapped", pct: quality.store, color: qColor(quality.store) },
    { label: "Segmented", pct: quality.segment, color: qColor(quality.segment) },
    { label: "Crop Tagged", pct: quality.crop, color: qColor(quality.crop) },
    { label: "GPS Location", pct: quality.gps, color: qColor(quality.gps) },
  ];

  // ── Insights (computed from real numbers) ──
  const lapsed = cnt("LAPSED"), hni = cnt("HNI"), newc = cnt("NEW"), atRisk = cnt("AT_RISK");
  const topZone = regions[0];
  const insights: Insight[] = [
    { title: "Win-back opportunity", text: `${grouped(lapsed)} customers are Lapsed (no purchase in 12 months) — the biggest single re-engagement pool.`, accent: "#C62828" },
    { title: "At-risk revenue", text: `${grouped(atRisk)} customers bought 7–12 months ago but not recently. Prioritise before the season.`, accent: "#E65100" },
    { title: "High-value base", text: `${grouped(hni)} HNI customers (₹12K+ in 12 months) anchor revenue — protect with 1:1 outreach.`, accent: "#678722" },
    { title: topZone ? `Top region: ${topZone.name}` : "Growth", text: topZone ? `${topZone.name} leads with ${grouped(topZone.visits)} farmers, ${topZone.conv}% active. ${grouped(newc)} new customers added org-wide in 12M.` : `${grouped(newc)} new customers added in the last 12 months.`, accent: "#1565C0" },
  ];

  return { kpis, heatmap, asrs, regions, funnel, land, quality: qualityRows, insights };
}
