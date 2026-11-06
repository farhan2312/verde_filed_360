import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { getScope, visitScopeWhere, storeScopeWhere } from "@/lib/scope";
import { shortStoreName } from "@/lib/store-utils";
import { getReviewSlaHours } from "@/lib/review-settings";
import { allRmStores, unassignedStoreIds } from "@/lib/rm-stores";
import { istDate, istDateTime } from "@/lib/visit-review-state";
import { ReviewQueue } from "@/components/visit-reviews/ReviewQueue";
import type { QueueCounts, QueueFilters, QueueRow, QueueSort, QueueStatus, SlaState } from "@/components/visit-reviews/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATUSES: QueueStatus[] = ["all", "pending", "overdue", "reviewed", "flagged"];
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);

type SP = { status?: string; officer?: string; store?: string; rm?: string; q?: string; from?: string; to?: string; sort?: string; page?: string };

/** Filter-option lists change rarely — cache per scope for 10 minutes (same approach as the Visit Repo). */
const loadOptions = unstable_cache(
  async (_key: string, sw: Prisma.VisitWhereInput | null, stw: Prisma.StoreWhereInput | null) => {
    const [officerRows, stores, rms] = await Promise.all([
      prisma.visit.findMany({
        where: sw ? { AND: [{ officerName: { not: null } }, sw] } : { officerName: { not: null } },
        select: { officerName: true }, distinct: ["officerName"], orderBy: { officerName: "asc" },
      }),
      prisma.store.findMany({ where: stw ?? undefined, select: { id: true, name: true, regionalManager: true, rmUserIds: true } }),
      allRmStores(),
    ]);
    // A Verde store can have several RMs, so the filter lists RM ACCOUNTS (value = user id) and
    // resolves their stores through rmUserIds — never by splitting the comma-joined display label.
    const inScope = new Set(stores.map((s) => s.id));
    const rmOptions = rms
      .map((r) => ({ value: String(r.userId), label: r.name, storeIds: r.storeIds.filter((id) => inScope.has(id)) }))
      .filter((r) => r.storeIds.length);
    const unassigned = await unassignedStoreIds(stores);
    return { officers: officerRows.map((r) => r.officerName!).filter(Boolean), stores, rmOptions, unassigned };
  },
  ["visit-review-queue-options"],
  { revalidate: 600 },
);

/** "2d 5h" / "6h" / "40m" */
function dur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export default async function VisitReviewsPage({ searchParams }: { searchParams?: SP }) {
  const role = await getRole();
  if (!canAccess("visitReviews", role)) notFound();

  const sp = searchParams ?? {};
  const filters: QueueFilters = {
    status: STATUSES.includes(sp.status as QueueStatus) ? (sp.status as QueueStatus) : "all",
    officer: sp.officer || "all",
    store: sp.store || "all",
    rm: sp.rm || "all",
    q: (sp.q ?? "").trim(),
    from: isYmd(sp.from) ? sp.from : "",
    to: isYmd(sp.to) ? sp.to : "",
    sort: (sp.sort === "oldest" ? "oldest" : "newest") as QueueSort,
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const scope = await getScope();
  const scopeWhere = visitScopeWhere(scope);
  const storeWhere = storeScopeWhere(scope);
  if (scopeWhere === "none" || storeWhere === "none") {
    return (
      <div className="rounded-[14px] border border-[#F5CE8E] bg-[#FFF8E1] px-4 py-10 text-center text-[13px] text-[#8D6E00]">
        No stores are mapped to you yet, so there are no visits to review. Ask an admin to assign your stores.
      </div>
    );
  }
  const isRm = scope.role === "regional";
  const slaHours = await getReviewSlaHours();
  const slaMs = slaHours * 3_600_000;
  const now = Date.now();

  let rows: QueueRow[] = [];
  let counts: QueueCounts = { all: 0, pending: 0, overdue: 0, reviewed: 0, flagged: 0 };
  let total = 0;
  let officers: string[] = [];
  let storeOpts: string[] = [];
  let rmOpts: { value: string; label: string }[] | null = null;

  try {
    const opts = await loadOptions(`${scope.role}:${scope.userId ?? ""}`, scopeWhere ?? null, storeWhere ?? null);
    officers = opts.officers;
    storeOpts = [...new Set(opts.stores.map((s) => shortStoreName(s.name)).filter(Boolean))].sort();
    if (!isRm) rmOpts = opts.rmOptions.map((r) => ({ value: r.value, label: r.label }));

    // Base filters (everything except the status pill) — the pill counts are computed over these.
    const and: Prisma.VisitWhereInput[] = [];
    if (filters.officer !== "all") and.push({ officerName: filters.officer });
    if (filters.from || filters.to)
      and.push({ visitedAt: { ...(filters.from ? { gte: istStart(filters.from) } : {}), ...(filters.to ? { lte: istEnd(filters.to) } : {}) } });
    if (filters.store !== "all") {
      const ids = opts.stores.filter((s) => shortStoreName(s.name) === filters.store).map((s) => s.id);
      and.push({ storeId: { in: ids.length ? ids : [-1] } });
    }
    if (!isRm && filters.rm !== "all") {
      if (filters.rm === "__none") {
        // Unassigned: stores nobody manages, plus visits that never got a store.
        const ids = opts.unassigned;
        and.push({ OR: [{ storeId: { in: ids.length ? ids : [-1] } }, { storeId: null, OR: [{ farmerId: null }, { farmer: { storeId: null } }] }] });
      } else {
        const ids = opts.rmOptions.find((r) => r.value === filters.rm)?.storeIds ?? [];
        and.push({ storeId: { in: ids.length ? ids : [-1] } });
      }
    }
    if (filters.q) {
      const digits = filters.q.replace(/\D/g, "");
      and.push({ OR: [
        { officerName: { contains: filters.q, mode: "insensitive" } },
        { farmer: { is: { name: { contains: filters.q, mode: "insensitive" } } } },
        { farmer: { is: { village: { contains: filters.q, mode: "insensitive" } } } },
        ...(digits.length >= 4 ? [{ farmer: { is: { mobile: { contains: digits } } } }] : []),
      ] });
    }
    if (scopeWhere) and.push(scopeWhere); // scope LAST — no query-string filter can widen it
    const base: Prisma.VisitWhereInput = and.length ? { AND: and } : {};

    const overdueCut = new Date(now - slaMs);
    const statusWhere: Record<QueueStatus, Prisma.VisitWhereInput> = {
      all: {},
      pending: { reviewedAt: null },
      overdue: { reviewedAt: null, createdAt: { lt: overdueCut } },
      reviewed: { reviewedAt: { not: null } },
      flagged: { reviewFlagged: true },
    };
    const w = (s: QueueStatus): Prisma.VisitWhereInput => ({ AND: [base, statusWhere[s]] });
    const dir = filters.sort === "oldest" ? "asc" : "desc";
    // Default "All": pending first (reviewedAt NULLS FIRST), then by logged time.
    const orderBy: Prisma.VisitOrderByWithRelationInput[] = filters.status === "all"
      ? [{ reviewedAt: { sort: "desc", nulls: "first" } }, { createdAt: dir }, { id: dir }]
      : [{ createdAt: dir }, { id: dir }];

    const [cAll, cPending, cOverdue, cReviewed, cFlagged, list] = await Promise.all([
      prisma.visit.count({ where: w("all") }),
      prisma.visit.count({ where: w("pending") }),
      prisma.visit.count({ where: w("overdue") }),
      prisma.visit.count({ where: w("reviewed") }),
      prisma.visit.count({ where: w("flagged") }),
      prisma.visit.findMany({
        where: w(filters.status),
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, date: true, visitedAt: true, createdAt: true, officerName: true, purpose: true, mainCrop: true,
          reviewedAt: true, firstReviewedAt: true, reviewRating: true, reviewFlagged: true, reviewedByName: true,
          farmer: { select: { name: true, village: true } },
          store: { select: { name: true, regionalManager: true } },
        },
      }),
    ]);
    counts = { all: cAll, pending: cPending, overdue: cOverdue, reviewed: cReviewed, flagged: cFlagged };
    total = counts[filters.status];

    rows = list.map((v) => {
      const logged = v.createdAt.getTime();
      let sla: SlaState, age: string;
      if (v.reviewedAt) {
        const turn = (v.firstReviewedAt ?? v.reviewedAt).getTime() - logged;
        sla = turn <= slaMs ? "met" : "late";
        age = dur(turn);
      } else {
        const waited = now - logged;
        sla = waited > slaMs ? "overdue" : waited > slaMs * 0.75 ? "due-soon" : "ok";
        age = dur(waited);
      }
      return {
        id: v.id,
        visitDate: v.date?.trim() || (v.visitedAt ? istDate(v.visitedAt) : "—"),
        loggedAt: istDateTime(v.createdAt),
        farmer: v.farmer?.name ?? "Store visit",
        village: v.farmer?.village ?? "",
        officer: v.officerName ?? "—",
        store: shortStoreName(v.store?.name) || "—",
        rm: (v.store?.regionalManager ?? "").trim(),
        purpose: v.purpose ?? "",
        crop: v.mainCrop ?? "",
        reviewed: v.reviewedAt != null,
        flagged: v.reviewFlagged,
        rating: v.reviewRating,
        reviewedBy: v.reviewedByName ?? "",
        age,
        sla,
      };
    });
  } catch {
    rows = [];
  }

  return (
    <ReviewQueue
      rows={rows}
      counts={counts}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      filters={filters}
      options={{ officers, stores: storeOpts, rms: rmOpts }}
      slaHours={slaHours}
    />
  );
}
