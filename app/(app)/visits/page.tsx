import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, visitScopeWhere, storeScopeWhere } from "@/lib/scope";
import { EmptyState } from "@/components/ui";
import { shortStoreName } from "@/lib/store-utils";
import { avatarColor } from "@/lib/format";
import { VisitKpiStrip } from "@/components/visits-repo/VisitKpiStrip";
import { VisitFilterBar } from "@/components/visits-repo/VisitFilterBar";
import { VisitRow } from "@/components/visits-repo/VisitRow";
import { VisitPagination } from "@/components/visits-repo/VisitPagination";
import type { VisitRecord } from "@/components/visits-repo/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  officer?: string;
  store?: string;
  rm?: string;
  type?: string;
  review?: string;
  period?: string;
  q?: string;
  page?: string;
};

const PAGE_SIZE = 50;

const PERIOD_DAYS: Record<string, number | null> = {
  today: 1,
  week: 8,
  month: 32,
  all: null,
};

function periodCutoff(period: string): Date | null {
  const days = PERIOD_DAYS[period] ?? PERIOD_DAYS.month;
  if (days === null || days === undefined) return null;
  // "now" anchored to the live date; window keeps visits newer than (now - days).
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export default async function VisitRepoPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = searchParams ?? {};
  const officer = sp.officer ?? "all";
  const store = sp.store ?? "all";
  const rm = sp.rm ?? "all";
  const type = sp.type ?? "all";
  const review = sp.review === "reviewed" || sp.review === "pending" ? sp.review : "all";
  const period = sp.period && sp.period in PERIOD_DAYS ? sp.period : "month";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let rows: VisitRecord[] = [];
  let officerOptions: string[] = [];
  let storeOptions: string[] = [];
  let rmOptions: string[] = [];
  let typeOptions: string[] = [];
  let total = 0, followup = 0, officers = 0, farmers = 0;

  // RBAC: officers see only their store's visits, RMs only their region's.
  const scope = await getScope();
  const scopeWhere = visitScopeWhere(scope);
  const storeWhere = storeScopeWhere(scope);
  if (scopeWhere === "none") {
    return (
      <div className="animate-[fadeUp_0.4s_ease-out] rounded-[14px] border border-[#F5CE8E] bg-[#FEF6E9] px-4 py-10 text-center text-[13px] text-[#8D6E00]">
        No store or region is assigned to your account yet, so there are no visits to show. Ask an admin to map you to a store.
      </div>
    );
  }

  try {
    // Filter option lists (independent of active filters, but never wider than scope).
    // DISTINCT queries so these read only the unique officer/purpose values.
    const [officerRows, typeRows, allStores] = await Promise.all([
      prisma.visit.findMany({
        where: scopeWhere ? { AND: [{ officerName: { not: null } }, scopeWhere] } : { officerName: { not: null } },
        select: { officerName: true },
        distinct: ["officerName"],
        orderBy: { officerName: "asc" },
      }),
      prisma.visit.findMany({
        where: scopeWhere ? { AND: [{ purpose: { not: null } }, scopeWhere] } : { purpose: { not: null } },
        select: { purpose: true },
        distinct: ["purpose"],
        orderBy: { purpose: "asc" },
      }),
      prisma.store.findMany({
        where: storeWhere && storeWhere !== "none" ? storeWhere : undefined,
        select: { id: true, name: true, regionalManager: true },
      }),
    ]);

    officerOptions = officerRows
      .map((v) => v.officerName)
      .filter((n): n is string => !!n);
    typeOptions = typeRows
      .map((v) => v.purpose)
      .filter((p): p is string => !!p);
    storeOptions = Array.from(
      new Set(allStores.map((s) => shortStoreName(s.name)).filter(Boolean)),
    ).sort();
    rmOptions = Array.from(
      new Set(allStores.map((s) => (s.regionalManager ?? "").trim()).filter(Boolean)),
    ).sort();

    // Re-query visits with the active filters applied server-side.
    const where: Prisma.VisitWhereInput = {};
    if (officer !== "all") where.officerName = officer;
    if (type !== "all") where.purpose = type;
    if (review === "reviewed") where.reviewedAt = { not: null };
    else if (review === "pending") where.reviewedAt = null;
    const cutoff = periodCutoff(period);
    if (cutoff) where.visitedAt = { gte: cutoff };
    // Store filter is a SHORT name (may cover several stores); RM filter is a manager name (covers their
    // stores). Both map to store-id sets — intersect when both are set — and run in the DB.
    const storeIds = store !== "all" ? allStores.filter((s) => shortStoreName(s.name) === store).map((s) => s.id) : null;
    const rmIds = rm !== "all" ? allStores.filter((s) => (s.regionalManager ?? "").trim() === rm).map((s) => s.id) : null;
    let allowedStoreIds: number[] | null = null;
    if (storeIds && rmIds) allowedStoreIds = storeIds.filter((id) => rmIds.includes(id));
    else allowedStoreIds = storeIds ?? rmIds;
    if (allowedStoreIds) where.storeId = { in: allowedStoreIds.length ? allowedStoreIds : [-1] };
    // Free-text search across farmer name / mobile / village + officer name.
    if (q) {
      const digits = q.replace(/\D/g, "");
      where.OR = [
        { officerName: { contains: q, mode: "insensitive" } },
        { farmer: { is: { name: { contains: q, mode: "insensitive" } } } },
        { farmer: { is: { village: { contains: q, mode: "insensitive" } } } },
        ...(digits ? [{ farmer: { is: { mobile: { contains: digits } } } }] as Prisma.VisitWhereInput[] : []),
      ];
    }
    // Scope goes on LAST so no query-string filter can widen it.
    const scopedWhere: Prisma.VisitWhereInput = scopeWhere ? { AND: [where, scopeWhere] } : where;

    // KPIs are COUNTs over the FULL filtered set — never the capped table rows (that's the bug that
    // pinned "Total Visits" at 500 and made it disagree with the analytics Visits tab).
    const [totalCount, followupCount, officerDistinct, farmerDistinct] = await Promise.all([
      prisma.visit.count({ where: scopedWhere }),
      prisma.visit.count({ where: { AND: [scopedWhere, { followUpDate: { not: null } }] } }),
      prisma.visit.findMany({ where: { AND: [scopedWhere, { officerName: { not: null } }] }, select: { officerName: true }, distinct: ["officerName"] }),
      prisma.visit.findMany({ where: { AND: [scopedWhere, { farmerId: { not: null } }] }, select: { farmerId: true }, distinct: ["farmerId"] }),
    ]);
    total = totalCount;
    followup = followupCount;
    officers = officerDistinct.length;
    farmers = farmerDistinct.length;

    const visits = await prisma.visit.findMany({
      where: scopedWhere,
      orderBy: [{ visitedAt: "desc" }, { id: "desc" }],
      include: {
        farmer: {
          select: {
            id: true,
            name: true,
            village: true,
            district: true,
            crop: true,
          },
        },
        store: { select: { id: true, name: true, regionalManager: true } },
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });

    rows = visits
      .map((v, i): VisitRecord => {
        const storeFullName = v.store?.name ?? null;
        const storeShort = shortStoreName(storeFullName);
        return {
          id: v.id,
          date: v.date ?? "—",
          farmerName: v.farmer?.name ?? "Unknown farmer",
          village: v.farmer?.village ?? "",
          district: v.farmer?.district ?? "",
          crop: v.mainCrop || v.farmer?.crop || "—",
          land: v.landHoldingUnit ?? "",
          officer: v.officerName ?? "—",
          purpose: v.purpose ?? "—",
          storeName: storeShort || "—",
          storeId: v.store?.id ?? null,
          rm: v.store?.regionalManager?.trim() || "",
          avBg: avatarColor(i),
          reviewed: v.reviewedAt != null,
          needsFollowup: !!v.followUpDate,
          followUp: v.followUpDate
            ? (() => { const d = new Date(`${v.followUpDate}T00:00:00`); return Number.isNaN(d.getTime()) ? v.followUpDate! : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); })()
            : "",
        };
      });
  } catch {
    rows = [];
    officerOptions = [];
    storeOptions = [];
    rmOptions = [];
    typeOptions = [];
    total = followup = officers = farmers = 0;
  }

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <VisitKpiStrip
        total={total}
        followup={followup}
        officers={officers}
        farmers={farmers}
      />

      <VisitFilterBar
        filter={{ officer, store, rm, type, review, period, q }}
        options={{ officers: officerOptions, stores: storeOptions, rms: rmOptions, types: typeOptions }}
        total={total}
      />

      <div className="rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[960px] lg:min-w-0">
        <div className="grid grid-cols-[0.5fr_1.4fr_0.8fr_0.8fr_0.8fr_0.6fr_0.6fr_0.7fr_0.5fr] px-[22px] py-[13px] bg-[#FAFAFA] border-b border-[#F0F0F0] text-[10.5px] font-semibold text-[#9E9E9E] uppercase tracking-[0.5px]">
          <div>Date</div>
          <div>Farmer</div>
          <div>Visit Type</div>
          <div>Officer</div>
          <div>Store</div>
          <div>Crop</div>
          <div>Land</div>
          <div>Follow-up</div>
          <div />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No visits found"
            hint="No field visits match the current filters."
          />
        ) : (
          rows.map((r) => (
            <Link key={r.id} href={`/visits/${r.id}`} className="block">
              <VisitRow row={r} />
            </Link>
          ))
        )}
        </div>
        </div>
      </div>

      <VisitPagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} shown={rows.length} />
    </div>
  );
}
