import { prisma } from "@/lib/prisma";
import { valueSegmentOf, lifecycleSegmentOf, VALUE_HNI_MIN, VALUE_POTENTIAL_MIN } from "@/lib/campaign-segments";

/**
 * CRM segmentation engine — the single source of truth for Farmer value/lifecycle/campaign segments,
 * base-price LTV + P12M spend, seed crop rollups, and lead→customer conversion.
 *
 * Runs in two modes:
 *   • FULL  — recomputeSegments()               → every REAL farmer (the monthly job).
 *   • SCOPED — recomputeSegments({ farmerIds }) → only those farmers (wired into a sales upload so the
 *              people it touched get fresh segments immediately, without the full 141k-farmer sweep).
 * Logic is identical to the long-standing monthly script; only the WHERE scope narrows.
 */

const HNI_MIN = VALUE_HNI_MIN;         // ₹12k
const POTENTIAL_MIN = VALUE_POTENTIAL_MIN; // ₹8k
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;
const TAKE = 50_000;
const minusM = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() - n); return x; };

// SQL literal helpers (values cast per-row so VALUES column types are unambiguous).
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const txt = (s: string | null) => (s == null ? "NULL::text" : `${q(s)}::text`);
const txtArr = (a: string[]) => (a.length ? `ARRAY[${a.map(q).join(",")}]::text[]` : "ARRAY[]::text[]");
const int = (n: number | null) => (n == null ? "NULL::int" : `${Math.round(n)}::int`);
const ts = (d: Date | null) => (d == null ? "NULL::timestamptz" : `'${d.toISOString()}'::timestamptz`);

interface Agg {
  p6: boolean; p712: boolean; p1324: boolean;
  earliest: Date | null; latest: Date | null;
  maizeItem: string | null; maizeAt: Date | null;
  potatoItem: string | null; potatoAt: Date | null;
}

export interface RecomputeResult {
  farmers: number;                       // farmers with dated sales that were updated
  value: Record<string, number>;
  lifecycle: Record<string, number>;
  leads: number;                         // farmers with no purchase → LEAD / NO_SPEND
  converted: number;                     // lead → customer conversions this run
}
export interface RecomputeOpts {
  farmerIds?: number[];                  // scope (omit = every REAL farmer)
  asof?: Date;                           // anchor for recency windows (default: now)
  onProgress?: (msg: string) => void;
}

export async function recomputeSegments(opts: RecomputeOpts = {}): Promise<RecomputeResult> {
  const ASOF = opts.asof ?? new Date();
  const P6 = minusM(ASOF, 6), P12 = minusM(ASOF, 12), P24 = minusM(ASOF, 24);
  const scoped = opts.farmerIds && opts.farmerIds.length ? [...new Set(opts.farmerIds)] : null;
  const farmerFilter = scoped ? { farmerId: { in: scoped } } : {};
  const log = opts.onProgress ?? (() => {});

  const agg = new Map<number, Agg>();
  const getA = (id: number): Agg => {
    let a = agg.get(id);
    if (!a) { a = { p6: false, p712: false, p1324: false, earliest: null, latest: null, maizeItem: null, maizeAt: null, potatoItem: null, potatoAt: null }; agg.set(id, a); }
    return a;
  };

  const baseAll = new Map<number, number>();
  const base12 = new Map<number, number>();
  type SaleRow = { farmerId: number; soldAt: Date | null; items: string | null; category: string | null };
  type LineRow = { farmerId: number | null; soldAt: Date | null; basic: number | null };

  const aggSale = (s: SaleRow) => {
    const dt = s.soldAt as Date;
    const a = getA(s.farmerId);
    if (!a.earliest || dt < a.earliest) a.earliest = dt;
    if (!a.latest || dt > a.latest) a.latest = dt;
    if (dt > P6) a.p6 = true; else if (dt > P12) a.p712 = true; else if (dt > P24) a.p1324 = true;
    const it = (s.items ?? "").toUpperCase();
    const cat = (s.category ?? "").toUpperCase();
    if (cat.includes("SEED") || it.includes("SEED")) {
      if (/MAIZE|MAKKA/.test(it)) { if (!a.maizeAt || dt > a.maizeAt) { a.maizeAt = dt; a.maizeItem = s.items ?? null; } }
      if (/POTATO|ALOO/.test(it)) { if (!a.potatoAt || dt > a.potatoAt) { a.potatoAt = dt; a.potatoItem = s.items ?? null; } }
    }
  };
  const aggLine = (l: LineRow) => {
    if (l.farmerId == null) return;
    const v = l.basic ?? 0;
    baseAll.set(l.farmerId, (baseAll.get(l.farmerId) ?? 0) + v);
    if ((l.soldAt as Date) > P12) base12.set(l.farmerId, (base12.get(l.farmerId) ?? 0) + v);
  };

  if (scoped) {
    // Fetch only the scoped farmers' rows via the farmerId index (no full-table scan).
    for (let i = 0; i < scoped.length; i += 1000) {
      const chunk = scoped.slice(i, i + 1000);
      const [sales, lines] = await Promise.all([
        prisma.sale.findMany({ where: { farmerId: { in: chunk }, soldAt: { not: null } }, select: { farmerId: true, soldAt: true, items: true, category: true } }),
        prisma.saleLine.findMany({ where: { farmerId: { in: chunk }, source: "REAL", soldAt: { not: null } }, select: { farmerId: true, soldAt: true, basic: true } }),
      ]);
      for (const s of sales) aggSale(s);
      for (const l of lines) aggLine(l);
    }
  } else {
    // Full run: memory-bounded id-cursor stream over everything.
    let cursor = 0, processed = 0;
    for (;;) {
      const sales = await prisma.sale.findMany({ where: { id: { gt: cursor }, soldAt: { not: null } }, orderBy: { id: "asc" }, take: TAKE, select: { id: true, farmerId: true, soldAt: true, items: true, category: true } });
      if (!sales.length) break;
      for (const s of sales) { cursor = s.id; aggSale(s); processed++; }
      log(`\r  sales scanned: ${processed}`);
      if (sales.length < TAKE) break;
    }
    log("\n");
    let lcursor = 0, lprocessed = 0;
    for (;;) {
      const lines = await prisma.saleLine.findMany({ where: { id: { gt: lcursor }, source: "REAL", farmerId: { not: null }, soldAt: { not: null } }, orderBy: { id: "asc" }, take: TAKE, select: { id: true, farmerId: true, soldAt: true, basic: true } });
      if (!lines.length) break;
      for (const l of lines) { lcursor = l.id; aggLine(l); lprocessed++; }
      log(`\r  sale-lines scanned: ${lprocessed}`);
      if (lines.length < TAKE) break;
    }
    log("\n");
  }

  // ── Compute + build bulk-update rows ──
  const value: Record<string, number> = {};
  const lifecycle: Record<string, number> = {};
  const rows: string[] = [];
  for (const [id, a] of agg) {
    const ltv = baseAll.get(id) ?? 0;
    const spend12 = base12.get(id) ?? 0;
    const regular = a.p6 && a.p712;
    const loyal = regular && a.p1324;
    const atRisk = a.p712 && !a.p6;
    const isNew = a.earliest != null && a.earliest > P12;
    const lapsed = !a.p6 && !a.p712;
    const hni = ltv >= HNI_MIN;
    const potential = !hni && ltv >= POTENTIAL_MIN;

    const tags: string[] = [];
    if (regular) tags.push("regular");
    if (loyal) tags.push("loyal");
    if (atRisk) tags.push("at_risk");
    if (lapsed) tags.push("lapsed");
    if (isNew) tags.push("new");
    if (hni) tags.push("hni");
    if (potential) tags.push("potential_hni");

    let seg = "OTHER";
    if (hni) seg = "HNI";
    else if (potential) seg = "POTENTIAL_HNI";
    else if (regular) seg = "REGULAR";
    else if (atRisk) seg = "AT_RISK";
    else if (isNew) seg = "NEW";
    else if (lapsed) seg = "LAPSED";

    const valueSeg = valueSegmentOf(ltv);
    const monthsSinceLast = a.latest ? Math.floor((ASOF.getTime() - a.latest.getTime()) / MS_PER_MONTH) : null;
    const monthsSinceFirst = a.earliest ? Math.floor((ASOF.getTime() - a.earliest.getTime()) / MS_PER_MONTH) : null;
    const lifecycleSeg = lifecycleSegmentOf(monthsSinceLast, monthsSinceFirst);
    value[valueSeg] = (value[valueSeg] ?? 0) + 1;
    lifecycle[lifecycleSeg] = (lifecycle[lifecycleSeg] ?? 0) + 1;

    const gap = valueSeg === "POTENTIAL_HNI" ? HNI_MIN - ltv : null;
    rows.push(
      `(${id}::int, ${txtArr(tags)}, ${q(seg)}::text, ${q(valueSeg)}::text, ${q(lifecycleSeg)}::text, ${ts(a.latest)}, ${int(spend12)}, ${int(ltv)}, ${int(gap)}, ` +
      `${txt(a.maizeItem)}, ${ts(a.maizeAt)}, ${txt(a.potatoItem)}, ${ts(a.potatoAt)})`,
    );
  }

  // Who is a LEAD right now (before we overwrite) — scoped to the target set when scoping.
  const priorLeadRows = scoped
    ? await prisma.$queryRawUnsafe<{ id: number }[]>(`SELECT id FROM "Farmer" WHERE source='REAL' AND "lifecycleSegment"='LEAD' AND id = ANY($1::int[])`, scoped)
    : await prisma.$queryRawUnsafe<{ id: number }[]>(`SELECT id FROM "Farmer" WHERE source='REAL' AND "lifecycleSegment"='LEAD'`);
  const priorLeadIds = priorLeadRows.map((r) => r.id);

  // ── Bulk UPDATE ... FROM (VALUES ...) in chunks ──
  const CHUNK = 2000;
  let updated = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    updated += await prisma.$executeRawUnsafe(
      `UPDATE "Farmer" AS f SET ` +
      `"segmentTags"=v.tags, "campaignSegment"=v.seg, "valueSegment"=v.vseg, "lifecycleSegment"=v.lseg, "lastPurchaseAt"=v.lastat, ` +
      `"p12mSpend"=v.spend, "lifetimeSpend"=v.ltv, "hniGap"=v.gap, ` +
      `"lastMaizeItem"=v.mitem, "lastMaizeAt"=v.mat, "lastPotatoItem"=v.pitem, "lastPotatoAt"=v.pat, ` +
      `"segmentComputedAt"=now() ` +
      `FROM (VALUES ${slice.join(",")}) AS v(id, tags, seg, vseg, lseg, lastat, spend, ltv, gap, mitem, mat, pitem, pat) ` +
      `WHERE f.id = v.id;`,
    );
    log(`\r  farmers updated: ${updated}/${rows.length}`);
  }
  log("\n");

  // REAL farmers with NO purchase at all → LEAD / NO_SPEND.
  // Scoped mode only needs to check scoped farmers that produced no dated sale here (not in `agg`);
  // restricting the anti-joins to that small set avoids a full-table scan (upload-touched farmers all
  // have a sale, so this set is usually empty — the step then costs nothing).
  let leads = 0;
  if (scoped) {
    const candidates = scoped.filter((id) => !agg.has(id));
    if (candidates.length) {
      leads = await prisma.$executeRawUnsafe(
        `UPDATE "Farmer" f SET "lifecycleSegment"='LEAD', "valueSegment"='NO_SPEND'
         WHERE f."source"='REAL' AND f.id = ANY($1::int[])
           AND NOT EXISTS (SELECT 1 FROM "SaleLine" sl WHERE sl."farmerId" = f.id)
           AND NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s."farmerId" = f.id)`,
        candidates,
      );
    }
  } else {
    leads = await prisma.$executeRawUnsafe(
      `UPDATE "Farmer" f SET "lifecycleSegment"='LEAD', "valueSegment"='NO_SPEND'
       WHERE f."source"='REAL'
         AND NOT EXISTS (SELECT 1 FROM "SaleLine" sl WHERE sl."farmerId" = f.id)
         AND NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s."farmerId" = f.id)`,
    );
  }

  // Lead → customer conversions (sticky).
  const converted = priorLeadIds.length
    ? await prisma.$executeRawUnsafe(
        `UPDATE "Farmer" SET "wasLead"=true, "leadConvertedAt"=COALESCE("leadConvertedAt","lastPurchaseAt")
         WHERE source='REAL' AND "wasLead"=false AND "lastPurchaseAt" IS NOT NULL AND id = ANY($1::int[])`,
        priorLeadIds,
      )
    : 0;

  return { farmers: rows.length, value, lifecycle, leads, converted };
}
