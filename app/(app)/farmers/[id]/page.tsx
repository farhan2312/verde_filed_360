import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { getScope, farmerScopeWhere } from "@/lib/scope";
import { LEAD_ENUM_TO_LABEL } from "@/lib/segments";
import { segMeta } from "@/lib/campaign-segments";
import { inr } from "@/lib/format";
import { storeColor } from "@/lib/store-utils";
import { BackLink } from "@/components/farmer-detail/BackLink";
import { FarmerProfileCard } from "@/components/farmer-detail/FarmerProfileCard";
import { StoreAssignmentCard } from "@/components/farmer-detail/StoreAssignmentCard";
import { KpiMini } from "@/components/farmer-detail/KpiMini";
import { SalesHistoryCard } from "@/components/farmer-detail/SalesHistoryCard";
import { VisitReportsCard } from "@/components/farmer-detail/VisitReportsCard";
import { CropHistoryCard } from "@/components/farmer-detail/CropHistoryCard";
import { ConcernsCard } from "@/components/farmer-detail/ConcernsCard";
import type { FarmerDetail } from "@/components/farmer-detail/types";

export const dynamic = "force-dynamic";

const FALLBACK_SEG_BG = "#F5F5F5";
const FALLBACK_SEG_COLOR = "#757575";

/** ISO "YYYY-MM-DD" → "12 Aug 2026" for display (empty string when unset). */
function fmtFollowUp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function buildDetail(
  farmer: NonNullable<Awaited<ReturnType<typeof loadFarmer>>>,
  baseBySale: Map<number, number>,
  storeOfficers: { name: string }[],
): FarmerDetail {
  const vMeta = farmer.valueSegment ? segMeta(farmer.valueSegment) : null;
  const lMeta = farmer.lifecycleSegment ? segMeta(farmer.lifecycleSegment) : null;
  const statusLabel = farmer.leadStatus
    ? LEAD_ENUM_TO_LABEL[farmer.leadStatus] ?? ""
    : farmer.status ?? "";

  const sales = farmer.sales.map((s) => ({
    id: s.id,
    invoice: s.invoice ?? "",
    date: s.date ?? "",
    items: s.items ?? "",
    base: inr(baseBySale.get(s.id) ?? 0),        // base / pre-tax (used everywhere)
    amount: s.amount ?? "",                        // GST-inclusive final (display only)
    store: s.store ?? "",
  }));

  const visitLog = farmer.visits.map((v) => ({
    id: v.id,
    purpose: v.purpose ?? v.type ?? "Field Visit",
    date: v.date ?? "",
    notes: v.notes ?? "",
    by: v.officerName ?? "",
    followUp: fmtFollowUp(v.followUpDate),
  }));

  // Crop history from visits — one entry per visit that recorded a crop, newest first, flagging
  // where the primary crop changed from the previous (older) visit (e.g. Potato → Paddy).
  const cropEntries = farmer.visits
    .map((v) => {
      const primary = (v.mainCrop || v.crops?.[0] || "").trim();
      const others = (v.crops ?? []).filter((c) => c && c.trim() && c !== primary);
      return { id: v.id, date: v.date ?? "", primary, others, season: v.season ?? "", by: v.officerName ?? "", sortKey: v.visitedAt ? v.visitedAt.getTime() : v.id };
    })
    .filter((e) => e.primary || e.others.length)
    .sort((a, b) => b.sortKey - a.sortKey);
  const cropHistory = cropEntries.map((e, i) => {
    const older = cropEntries[i + 1];
    const changedFrom = older && older.primary && older.primary !== e.primary ? older.primary : null;
    return { id: e.id, date: e.date, primary: e.primary, others: e.others, season: e.season, by: e.by, changedFrom };
  });

  // Land + Soil sync from the most recent visit that recorded them (the visit form is the source of
  // truth; the Farmer row is blank for sales/visit-created farmers). Falls back to the Farmer record.
  const landVisit = farmer.visits.find((v) => v.landHoldingUnit);
  const soilVisit = farmer.visits.find((v) => v.soilType);
  const landStr = landVisit?.landHoldingUnit || (farmer.land != null ? `${farmer.land} acres` : "");
  const soilStr = soilVisit?.soilType || "";

  // Lifetime value on BASE price (used everywhere) + the GST-inclusive total (display only).
  const ltvBaseNum = farmer.sales.reduce((sum, s) => sum + (baseBySale.get(s.id) ?? 0), 0);
  const ltvGstNum = farmer.sales.reduce((sum, s) => sum + (s.amountNum ?? 0), 0);

  const store = farmer.store
    ? {
        name: farmer.store.name,
        code: farmer.store.code,
        color: storeColor(farmer.store.id),
        address: farmer.store.address ?? "",
        // Relationship officers come from the LIVE User↔store mapping (managed on /users); the legacy
        // Employee table is only a fallback (it's blank for most stores).
        officers: storeOfficers.length ? storeOfficers : farmer.store.employees.map((e) => ({ name: e.name })),
      }
    : null;

  return {
    id: farmer.id,
    name: farmer.name,
    village: farmer.village ?? "",
    district: farmer.district ?? "",
    mobile: farmer.mobile ?? "",
    land: landStr,
    crop: farmer.crop ?? "",
    season: "",
    soil: soilStr,
    status: statusLabel,
    segment: vMeta?.label ?? "",
    segBg: vMeta?.bg ?? FALLBACK_SEG_BG,
    segColor: vMeta?.color ?? FALLBACK_SEG_COLOR,
    lifecycle: lMeta?.label ?? "",
    lifeBg: lMeta?.bg ?? FALLBACK_SEG_BG,
    lifeColor: lMeta?.color ?? FALLBACK_SEG_COLOR,
    attendedGhoshti: farmer.attendedGhoshti ?? false,
    salesCrops: farmer.salesCropTags ?? [],
    visitCrops: farmer.visitCropTags ?? [],
    ltv: inr(ltvBaseNum),
    ltvGst: inr(ltvGstNum),
    saleCount: sales.length,
    visitCount: visitLog.length,
    lastPurchaseAmt: sales[0]?.base || "—",
    lastPurchaseDate: sales[0]?.date || "No purchases",
    store,
    sales,
    visitLog,
    cropHistory,
    concerns: farmer.concerns ?? "",
    issues: farmer.issues ?? [],
  };
}

/** RBAC: the id lookup is AND-ed with the caller's scope, so an out-of-store /
 *  out-of-region farmer 404s instead of opening by direct URL. */
async function loadFarmer(id: number, scopeWhere: Prisma.FarmerWhereInput | null) {
  return prisma.farmer.findFirst({
    where: scopeWhere ? { AND: [{ id }, scopeWhere] } : { id },
    include: {
      store: { include: { employees: { take: 2, orderBy: { id: "asc" } } } },
      sales: { orderBy: [{ soldAt: "desc" }, { id: "desc" }], take: 60 },
      visits: { orderBy: { id: "desc" } },
    },
  });
}

export default async function FarmerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const isAdmin = (await getRole()) === "sysadmin";
  const scopeWhere = farmerScopeWhere(await getScope());
  if (scopeWhere === "none") notFound(); // scoped user with no store/region — fail closed

  let farmer: Awaited<ReturnType<typeof loadFarmer>> = null;
  try {
    farmer = await loadFarmer(id, scopeWhere);
  } catch {
    farmer = null; // DB unavailable pre-seed — fall through to not-found shell.
  }

  if (!farmer) notFound();

  // Base (pre-tax) total per shown invoice — from its SaleLine rows.
  const shownSaleIds = farmer.sales.map((s) => s.id);
  let baseBySale = new Map<number, number>();
  try {
    if (shownSaleIds.length) {
      const lines = await prisma.saleLine.groupBy({
        by: ["saleId"],
        where: { saleId: { in: shownSaleIds }, source: "REAL" },
        _sum: { basic: true },
      });
      baseBySale = new Map(lines.map((l) => [l.saleId as number, Math.round(l._sum.basic ?? 0)]));
    }
  } catch {
    baseBySale = new Map();
  }

  // Relationship officers = the agri officers/managers mapped to this farmer's store on /users.
  let storeOfficers: { name: string }[] = [];
  if (farmer.storeId) {
    try {
      const us = await prisma.user.findMany({
        where: { storeId: farmer.storeId, role: { in: ["ASR", "STORE_MANAGER"] }, active: true },
        select: { name: true },
        orderBy: { id: "asc" },
        take: 2,
      });
      storeOfficers = us.map((u) => ({ name: u.name }));
    } catch {
      storeOfficers = [];
    }
  }

  const detail = buildDetail(farmer, baseBySale, storeOfficers);

  // Accurate lifetime value across ALL bills (list above is capped): base LTV from SaleLine.basic,
  // GST-inclusive total from Sale.amountNum (display only), invoice count from Sale.
  try {
    const [baseAgg, gstAgg] = await Promise.all([
      prisma.saleLine.aggregate({ where: { farmerId: id, source: "REAL" }, _sum: { basic: true } }),
      prisma.sale.aggregate({ where: { farmerId: id }, _sum: { amountNum: true }, _count: { _all: true } }),
    ]);
    if (gstAgg._count._all > 0) {
      detail.ltv = inr(Math.round(baseAgg._sum.basic ?? 0));
      detail.ltvGst = inr(gstAgg._sum.amountNum ?? 0);
      detail.saleCount = gstAgg._count._all;
    }
  } catch {
    // keep the from-list computation on error
  }

  return (
    <div className="animate-fadeUp">
      <BackLink />

      {/* Top grid — Profile + Store + KPI minis (LTV on base price · GST-inclusive total · last purchase) */}
      <div className="grid grid-cols-1 gap-4 mb-[18px] sm:grid-cols-2 lg:grid-cols-4">
        <FarmerProfileCard farmer={detail} />
        {detail.store && <StoreAssignmentCard store={detail.store} />}
        <KpiMini
          label="Lifetime Value (base)"
          value={detail.ltv}
          valueColor="#7DA02E"
          sub={`${detail.saleCount} invoices`}
        />
        <KpiMini
          label="Lifetime incl. GST"
          value={detail.ltvGst}
          valueColor="#1565C0"
          sub="final price paid (not used in analytics)"
        />
        <KpiMini
          label="Last Purchase (base)"
          value={detail.lastPurchaseAmt}
          valueColor="#1A1C1A"
          sub={detail.lastPurchaseDate}
        />
      </div>

      {/* Middle grid — Sales History + Visit Log */}
      <div className="grid grid-cols-1 gap-[18px] mb-[18px] lg:grid-cols-[1.2fr_1fr]">
        <SalesHistoryCard sales={detail.sales} />
        <VisitReportsCard visits={detail.visitLog} count={detail.visitCount} />
      </div>

      {detail.cropHistory.length > 0 && (
        <div className="mb-[18px]">
          <CropHistoryCard history={detail.cropHistory} />
        </div>
      )}

      {(detail.concerns || detail.issues.length > 0 || isAdmin) && (
        <ConcernsCard concerns={detail.concerns} issues={detail.issues} />
      )}
    </div>
  );
}
