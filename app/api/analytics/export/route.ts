import type { NextRequest } from "next/server";
import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, type Scope } from "@/lib/scope";
import { SPEND_TIERS } from "@/lib/spend-tiers";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS, LIFECYCLE_RECENT_MONTHS, LIFECYCLE_LAPSED_MIN_MONTHS } from "@/lib/campaign-segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE streaming Excel export of the analytics dataset. The `type` query param picks what goes in the
 * workbook — "sales" (matrix + every sale line), "visits" (every visit attribute), or "both" (all of
 * them, in the same file). A single "Filters applied" sheet always lists every active filter + counts.
 * Uses exceljs' streaming WorkbookWriter piped through a Node PassThrough so rows flush as written:
 * bounded memory, no size cap. NOT a server action, so the 12 MB action-response limit does not apply.
 * RBAC enforced from the session. Filters arrive base64 in `?f=`.
 */
interface ExportFilters {
  storeIds?: number[]; storeStatus?: string[]; zones?: string[]; villages?: string[]; crops?: string[]; pests?: string[];
  valueSegments?: string[]; lifecycleSegments?: string[]; spendTiers?: number[]; fyStarts?: number[];
  problems?: string[]; // visit lens — Current Problem
  visitFrom?: string; visitTo?: string; // visit lens — visitedAt range (ISO YYYY-MM-DD)
  salesFrom?: string; salesTo?: string; // sales lens — soldAt range on the sale-lines sheet (ISO YYYY-MM-DD)
}
const ymd = (s: string | undefined, endOfDay = false): Date | null =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}Z`) : null;
type ExportType = "sales" | "visits" | "both";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const list = <T,>(arr: T[] | undefined, fn: (x: T) => string, none: string) => (arr?.length ? arr.map(fn).join(", ") : none);
const segLabelSafe = (x: unknown) => { const k = x == null ? "" : String(x); if (!k) return ""; try { return segMeta(k).label; } catch { return k; } };
/** Farmer crop-tag array → readable "Mustard; Wheat" label string. */
const cropsJoin = (a: unknown) => (Array.isArray(a) ? (a as string[]).map(cropLabel).join("; ") : "");

function fyWindow(fyStarts?: number[]): Prisma.Sql | null {
  if (!fyStarts?.length) return null;
  const ors = fyStarts.map((y) => Prisma.sql`(sl."soldAt" >= ${new Date(Date.UTC(y, 3, 1))} AND sl."soldAt" < ${new Date(Date.UTC(y + 1, 3, 1))})`);
  return Prisma.sql`(${Prisma.join(ors, " OR ")})`;
}

/** Farmer-level conditions shared by the matrix and the sale-lines query (alias f, store alias st). */
function farmerConds(f: ExportFilters, storeIds?: number[], zones?: string[]): Prisma.Sql[] {
  const c: Prisma.Sql[] = [Prisma.sql`f.source = 'REAL'`];
  if (storeIds?.length) c.push(Prisma.sql`f."storeId" = ANY(${storeIds})`);
  if (f.storeStatus?.length) c.push(Prisma.sql`st."status" = ANY(${f.storeStatus})`);
  if (zones?.length) c.push(Prisma.sql`st."zone" = ANY(${zones})`);
  if (f.villages?.length) c.push(Prisma.sql`upper(btrim(f."village")) = ANY(${f.villages})`);
  if (f.pests?.length) c.push(Prisma.sql`f."pestTags" && ${f.pests}::text[]`);
  if (f.valueSegments?.length) c.push(Prisma.sql`f."valueSegment" = ANY(${f.valueSegments})`);
  if (f.lifecycleSegments?.length) c.push(Prisma.sql`f."lifecycleSegment" = ANY(${f.lifecycleSegments})`);
  if (f.crops?.length) c.push(Prisma.sql`f."salesCropTags" && ${f.crops}::text[]`);
  if (f.spendTiers?.length) {
    const ors = f.spendTiers.map((i) => SPEND_TIERS[i]).filter(Boolean).map((t) => {
      if (t.max === 0 && t.min == null) return Prisma.sql`(f."lifetimeSpend" IS NULL OR f."lifetimeSpend" <= 0)`;
      const p: Prisma.Sql[] = [];
      if (t.min != null) p.push(Prisma.sql`f."lifetimeSpend" >= ${t.min}`);
      if (t.max != null) p.push(Prisma.sql`f."lifetimeSpend" < ${t.max}`);
      return p.length ? Prisma.sql`(${Prisma.join(p, " AND ")})` : Prisma.sql`TRUE`;
    });
    if (ors.length) c.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }
  return c;
}

/** Sales sheets: Value×Lifecycle×Store matrix + every matching sale line. Returns the counts. */
async function writeSalesSheets(
  wb: ExcelJS.stream.xlsx.WorkbookWriter, f: ExportFilters,
  storeIds: number[] | undefined, zones: string[] | undefined, nameById: Map<number, string>, rmById: Map<number, string>,
): Promise<{ grandTotal: number; lineCount: number }> {
  const fWhere = Prisma.join(farmerConds(f, storeIds, zones), " AND ");
  const cropLine = f.crops?.length ? Prisma.sql`AND sl."cropTag" = ANY(${f.crops}::text[])` : Prisma.empty;
  const fyw = fyWindow(f.fyStarts);
  const fyLine = fyw ? Prisma.sql`AND ${fyw}` : Prisma.empty;
  // Optional soldAt date window — bounds the sale-lines dump so it isn't "everything since day 0".
  const sFrom = ymd(f.salesFrom), sTo = ymd(f.salesTo, true);
  const dateParts = [
    ...(sFrom ? [Prisma.sql`AND sl."soldAt" >= ${sFrom}`] : []),
    ...(sTo ? [Prisma.sql`AND sl."soldAt" <= ${sTo}`] : []),
  ];
  // Prisma.join throws on an empty array - fall back to no extra condition when no date range is set.
  const dateLine = dateParts.length ? Prisma.join(dateParts, " ") : Prisma.empty;
  const V = [...VALUE_SEGMENTS], L = [...LIFECYCLE_SEGMENTS];
  const combos = V.flatMap((v) => L.map((l) => [v, l] as const));

  // ── FY-relative lifecycle: a sale line's "Lifecycle" is the stage the farmer was in AS OF that line's
  // financial year (end-of-FY as-of), exactly like the on-screen analytics — NOT the farmer's stored
  // current stage. Otherwise a farmer who was "New" in an old FY reads as "Lapsed" today. Built once as
  // a (farmerId|fyStartYear → stage) map over ALL the farmer's sales (recency uses every sale). ──
  const RM = Prisma.raw(String(LIFECYCLE_RECENT_MONTHS)), LM = Prisma.raw(String(LIFECYCLE_LAPSED_MIN_MONTHS));
  const years = (await prisma.$queryRaw<Array<{ y: number }>>(Prisma.sql`
    SELECT DISTINCT floor(EXTRACT(YEAR FROM (sl."soldAt" - interval '3 months')))::int y
    FROM "SaleLine" sl JOIN "Farmer" f ON f.id = sl."farmerId" LEFT JOIN "Store" st ON st.id = f."storeId"
    WHERE sl.source = 'REAL' AND sl."farmerId" IS NOT NULL AND ${fWhere} ${cropLine} ${fyLine} ${dateLine} AND sl."soldAt" IS NOT NULL`))
    .map((r) => Number(r.y)).filter(Number.isFinite);
  const lsegByFarmerFy = new Map<string, string>();
  if (years.length) {
    const lrows = await prisma.$queryRaw<Array<{ id: number; y: number; lseg: string }>>(Prisma.sql`
      WITH sf AS (SELECT f.id FROM "Farmer" f LEFT JOIN "Store" st ON st.id = f."storeId" WHERE ${fWhere}),
      yrs AS (SELECT unnest(${years}::int[]) y),
      agg AS (
        SELECT s."farmerId" id, yr.y,
          MAX(s."soldAt") FILTER (WHERE s."soldAt" < ((yr.y + 1)::text || '-04-01')::timestamptz) last_at,
          MIN(s."soldAt") FILTER (WHERE s."soldAt" < ((yr.y + 1)::text || '-04-01')::timestamptz) first_at
        FROM "Sale" s JOIN sf ON sf.id = s."farmerId" CROSS JOIN yrs yr
        WHERE s.source = 'REAL' AND s."soldAt" IS NOT NULL
        GROUP BY 1, 2)
      SELECT id, y,
        CASE WHEN last_at IS NULL THEN 'LAPSED'
          WHEN last_at > ((y + 1)::text || '-04-01')::timestamptz - interval '${RM} months'
            THEN CASE WHEN first_at > ((y + 1)::text || '-04-01')::timestamptz - interval '${RM} months' THEN 'NEW' ELSE 'RECENT' END
          WHEN last_at > ((y + 1)::text || '-04-01')::timestamptz - interval '${LM} months' THEN 'AT_RISK'
          ELSE 'LAPSED' END lseg
      FROM agg WHERE last_at IS NOT NULL`);
    for (const r of lrows) lsegByFarmerFy.set(`${r.id}|${r.y}`, r.lseg);
  }

  // ── Sheet: Value × Lifecycle × Store (farmer counts, stored tiers) ──
  const matrixRows = await prisma.$queryRaw<Array<{ sid: number | null; vseg: string | null; lseg: string | null; n: number }>>(Prisma.sql`
    SELECT f."storeId" sid, f."valueSegment" vseg, f."lifecycleSegment" lseg, COUNT(*)::int n
    FROM "Farmer" f LEFT JOIN "Store" st ON st.id = f."storeId"
    WHERE ${fWhere} GROUP BY 1, 2, 3`);
  const byStore = new Map<number | null, { cell: Record<string, number>; total: number }>();
  const grand: Record<string, number> = {}; let grandTotal = 0;
  for (const r of matrixRows) {
    const key = `${r.vseg ?? "REGULAR"}|${r.lseg ?? "LAPSED"}`;
    const st = byStore.get(r.sid) ?? { cell: {}, total: 0 };
    st.cell[key] = (st.cell[key] ?? 0) + r.n; st.total += r.n; byStore.set(r.sid, st);
    grand[key] = (grand[key] ?? 0) + r.n; grandTotal += r.n;
  }
  const matrixSorted = [...byStore.entries()].map(([sid, s]) => ({
    name: sid == null ? "Unassigned" : nameById.get(sid) ?? `Store #${sid}`,
    rm: sid == null ? "" : rmById.get(sid) ?? "", ...s,
  })).sort((a, b) => b.total - a.total).slice(0, 200);
  const ws1 = wb.addWorksheet("Value x Lifecycle x Store");
  ws1.addRow(["Store", "RM", ...combos.map(([v, l]) => `${segMeta(v).label} · ${segMeta(l).label}`), "Total"]).commit();
  ws1.addRow(["All stores", "", ...combos.map(([v, l]) => grand[`${v}|${l}`] ?? 0), grandTotal]).commit();
  for (const s of matrixSorted) ws1.addRow([s.name, s.rm, ...combos.map(([v, l]) => s.cell[`${v}|${l}`] ?? 0), s.total]).commit();
  await ws1.commit();

  // ── Sheet: every matching sale line (keyset-paged) ──
  const ws2 = wb.addWorksheet("Sales lines");
  ws2.addRow(["Order No", "Date", "Financial year", "Farmer", "Mobile", "Village", "Store", "RM", "District", "Item", "Crop (this line)", "Sales crops (all)", "Visit crops (all)", "Category", "Qty", "UOM", "Base value (Rs)", "Value segment", "Lifecycle"]).commit();
  let cursor = 0, lineCount = 0;
  const BATCH = 10000;
  for (;;) {
    const rows = await prisma.$queryRaw<Array<{
      id: number; fid: number; fystart: number | null; ordno: string | null; soldat: Date | null; fy: string | null; name: string; mobile: string | null;
      village: string | null; sid: number | null; zone: string | null; item: string; crop: string | null; cat: string | null;
      qty: number | null; uom: string | null; basic: number | null; vseg: string | null; lseg: string | null;
      scrops: string[] | null; vcrops: string[] | null;
    }>>(Prisma.sql`
      SELECT sl.id, sl."farmerId" fid, floor(EXTRACT(YEAR FROM (sl."soldAt" - interval '3 months')))::int fystart,
        sl."orderNo" ordno, sl."soldAt" soldat, sl."financialYear" fy, f.name, f.mobile, f."village" village,
        f."storeId" sid, st."zone" zone, sl."itemRaw" item, sl."cropTag" crop, sl."mainCategory" cat,
        sl.qty, sl.uom, sl."basic" basic, f."valueSegment" vseg, f."lifecycleSegment" lseg,
        f."salesCropTags" scrops, f."visitCropTags" vcrops
      FROM "SaleLine" sl JOIN "Farmer" f ON f.id = sl."farmerId" LEFT JOIN "Store" st ON st.id = f."storeId"
      WHERE sl.source = 'REAL' AND sl."farmerId" IS NOT NULL AND ${fWhere} ${cropLine} ${fyLine} ${dateLine} AND sl.id > ${cursor}
      ORDER BY sl.id LIMIT ${BATCH}`);
    if (!rows.length) break;
    for (const r of rows) {
      cursor = r.id; lineCount++;
      // FY-relative stage (as of this line's FY); fall back to the stored stage if we have no sale history map.
      const fyRel = r.fystart != null ? lsegByFarmerFy.get(`${r.fid}|${r.fystart}`) : undefined;
      const lsegKey = fyRel ?? r.lseg;
      ws2.addRow([
        r.ordno ?? "", r.soldat ? new Date(r.soldat).toISOString().slice(0, 10) : "", r.fy ?? "",
        r.name, r.mobile ?? "", r.village ?? "", r.sid != null ? nameById.get(r.sid) ?? "" : "", r.sid != null ? rmById.get(r.sid) ?? "" : "", r.zone ?? "",
        r.item, r.crop ? cropLabel(r.crop) : "", cropsJoin(r.scrops), cropsJoin(r.vcrops), r.cat ?? "", r.qty ?? 0, r.uom ?? "",
        Math.round(r.basic ?? 0), r.vseg ? segMeta(r.vseg).label : "", lsegKey ? segMeta(lsegKey).label : "",
      ]).commit();
    }
    if (rows.length < BATCH) break;
  }
  await ws2.commit();
  return { grandTotal, lineCount };
}

/** Visits sheet: one row per visit with every recorded attribute. Returns the visit count. */
async function writeVisitsSheet(
  wb: ExcelJS.stream.xlsx.WorkbookWriter, f: ExportFilters, scope: Scope,
): Promise<number> {
  const vc: Prisma.Sql[] = [];
  if (scope.role === "officer") {
    vc.push(Prisma.sql`(v."storeId" = ${scope.storeId} OR (v."storeId" IS NULL AND f."storeId" = ${scope.storeId}))`);
  } else if (scope.role === "regional") {
    vc.push(Prisma.sql`(vs."zone" = ${scope.zone} OR (v."storeId" IS NULL AND fs."zone" = ${scope.zone}))`);
  }
  if (f.storeIds?.length) vc.push(Prisma.sql`(v."storeId" = ANY(${f.storeIds}) OR (v."storeId" IS NULL AND f."storeId" = ANY(${f.storeIds})))`);
  if (f.zones?.length) vc.push(Prisma.sql`(vs."zone" = ANY(${f.zones}) OR (v."storeId" IS NULL AND fs."zone" = ANY(${f.zones})))`);
  if (f.storeStatus?.length) vc.push(Prisma.sql`COALESCE(vs."status", fs."status") = ANY(${f.storeStatus})`);
  if (f.villages?.length) vc.push(Prisma.sql`upper(btrim(f."village")) = ANY(${f.villages})`);
  if (f.crops?.length) vc.push(Prisma.sql`f."visitCropTags" && ${f.crops}::text[]`);
  if (f.pests?.length) vc.push(Prisma.sql`f."pestTags" && ${f.pests}::text[]`);
  // Honour the farmer-level Value / Lifecycle segment filters too, so a "Lifecycle = Lead" export
  // yields a Visits sheet of ONLY those farmers' visits (e.g. mustard leads) — matching the sales sheets.
  if (f.valueSegments?.length) vc.push(Prisma.sql`f."valueSegment" = ANY(${f.valueSegments})`);
  if (f.lifecycleSegments?.length) vc.push(Prisma.sql`f."lifecycleSegment" = ANY(${f.lifecycleSegments})`);
  if (f.problems?.length) vc.push(Prisma.sql`v."currentProblem" && ${f.problems}::text[]`);
  const vDateFrom = f.visitFrom && /^\d{4}-\d{2}-\d{2}$/.test(f.visitFrom) ? new Date(`${f.visitFrom}T00:00:00Z`) : null;
  const vDateTo = f.visitTo && /^\d{4}-\d{2}-\d{2}$/.test(f.visitTo) ? new Date(`${f.visitTo}T23:59:59Z`) : null;
  if (vDateFrom) vc.push(Prisma.sql`v."visitedAt" >= ${vDateFrom}`);
  if (vDateTo) vc.push(Prisma.sql`v."visitedAt" <= ${vDateTo}`);
  const vWhere = vc.length ? Prisma.join(vc, " AND ") : Prisma.sql`TRUE`;

  const ws = wb.addWorksheet("Visits");
  ws.addRow([
    "Visit ID", "Date", "Farmer", "Mobile", "Village", "Store", "RM", "District", "Officer", "Recorded by", "Emp code",
    "Visit type", "Visit mode", "GPS lat", "GPS lng", "Follow-up date", "Soil type", "Soil testing", "Water source",
    "Main crop", "Crops", "Other crops", "Sales crops (all)", "Visit crops (all)", "Season", "Crop insured", "Land holding", "Products", "Product required",
    "Current problem", "Crop risk", "Danger zone", "Annual expense", "Purchase freq", "Other shops",
    "FPO member", "FPO name", "Contract farming", "Contract detail", "Dairy services", "Dairy detail",
    "WhatsApp", "WhatsApp number", "Photos", "Voice notes", "Notes", "Lifecycle stage", "Value segment", "Recorded at (UTC)",
  ]).commit();
  let cursor = 0, count = 0; const BATCH = 5000;
  for (;;) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT v.id,
        COALESCE(to_char(v."visitedAt",'YYYY-MM-DD'), v."date") AS date,
        f.name AS farmer, f.mobile, f.village,
        btrim(regexp_replace(COALESCE(vs.name, fs.name), '\\s*\\(.*?\\)\\s*', '', 'g')) AS store,
        COALESCE(vs."regionalManager", fs."regionalManager") AS rm,
        COALESCE(vs.zone, fs.zone) AS district,
        v."officerName" AS officer, v."recordedBy" AS recordedby, v."recordedByCode" AS empcode,
        COALESCE(v.type, v.purpose) AS visittype, v."visitMode" AS visitmode, v."gpsLat" AS lat, v."gpsLng" AS lng,
        v."followUpDate" AS followup, v."soilType" AS soiltype, v."soilTesting" AS soiltesting,
        array_to_string(v."waterSource", '; ') AS water, v."mainCrop" AS maincrop,
        array_to_string(v.crops, '; ') AS crops, v."otherCrops" AS othercrops,
        f."salesCropTags" AS scrops, f."visitCropTags" AS vcrops, v.season,
        v."cropInsured" AS insured, v."landHoldingUnit" AS land,
        array_to_string(v.products, '; ') AS products, array_to_string(v."productRequired", '; ') AS prodreq,
        array_to_string(v."currentProblem", '; ') AS problem, array_to_string(v."cropRisk", '; ') AS croprisk,
        array_to_string(v."dangerZone", '; ') AS danger, v."annualExpense" AS expense, v."purchaseFreq" AS freq,
        v."otherShops" AS othershops, v."fpoMember" AS fpo, v."fpoName" AS fponame,
        v."contractFarming" AS contract, v."contractDetail" AS contractdetail,
        v."dairyServices" AS dairy, v."dairyDetail" AS dairydetail, v."whatsappAvail" AS wa, v."whatsappNumber" AS wanum,
        v."photoCount" AS photos, v."voiceNoteCount" AS voices,
        v.notes, f."lifecycleSegment"::text AS lead, f."valueSegment"::text AS segment,
        to_char(v."createdAt",'YYYY-MM-DD HH24:MI') AS createdat
      FROM "Visit" v
      LEFT JOIN "Farmer" f ON f.id = v."farmerId"
      LEFT JOIN "Store" vs ON vs.id = v."storeId"
      LEFT JOIN "Store" fs ON fs.id = f."storeId"
      WHERE ${vWhere} AND v.id > ${cursor}
      ORDER BY v.id LIMIT ${BATCH}`);
    if (!rows.length) break;
    const yn = (b: unknown) => (b ? "Yes" : "No");
    const s = (x: unknown) => (x == null ? "" : String(x));
    for (const r of rows) {
      cursor = Number(r.id); count++;
      ws.addRow([
        Number(r.id), s(r.date), s(r.farmer), s(r.mobile), s(r.village), s(r.store), s(r.rm), s(r.district),
        s(r.officer), s(r.recordedby), s(r.empcode), s(r.visittype), s(r.visitmode),
        r.lat ?? "", r.lng ?? "", s(r.followup), s(r.soiltype), s(r.soiltesting), s(r.water),
        s(r.maincrop), s(r.crops), s(r.othercrops), cropsJoin(r.scrops), cropsJoin(r.vcrops), s(r.season), yn(r.insured), s(r.land),
        s(r.products), s(r.prodreq), s(r.problem), s(r.croprisk), s(r.danger), s(r.expense), s(r.freq), s(r.othershops),
        yn(r.fpo), s(r.fponame), yn(r.contract), s(r.contractdetail), yn(r.dairy), s(r.dairydetail),
        yn(r.wa), s(r.wanum), Number(r.photos ?? 0), Number(r.voices ?? 0), s(r.notes), segLabelSafe(r.lead), segLabelSafe(r.segment), s(r.createdat),
      ]).commit();
    }
    if (rows.length < BATCH) break;
  }
  await ws.commit();
  return count;
}

/** The store-name cleaner used across the visit/lead sheets (drops the "(…)" suffix). */
const STORE_NAME = Prisma.raw(`btrim(regexp_replace(st.name, '\\s*\\(.*?\\)\\s*', '', 'g'))`);

/** Leads sheet: one row per LEAD farmer with their visit-derived analytics (crops, pests, visit activity). */
async function writeLeadsSheet(wb: ExcelJS.stream.xlsx.WorkbookWriter, f: ExportFilters, storeIds?: number[], zones?: string[]): Promise<number> {
  // Farmer-level conditions — leads carry visit data, so crop matches visitCropTags. No spend/value/lifecycle
  // narrowing (a lead is always NO_SPEND / LEAD); applying those would just empty the sheet.
  const c: Prisma.Sql[] = [Prisma.sql`f.source = 'REAL'`, Prisma.sql`f."lifecycleSegment" = 'LEAD'`];
  if (storeIds?.length) c.push(Prisma.sql`f."storeId" = ANY(${storeIds})`);
  if (f.storeStatus?.length) c.push(Prisma.sql`st."status" = ANY(${f.storeStatus})`);
  if (zones?.length) c.push(Prisma.sql`st."zone" = ANY(${zones})`);
  if (f.villages?.length) c.push(Prisma.sql`upper(btrim(f."village")) = ANY(${f.villages})`);
  if (f.crops?.length) c.push(Prisma.sql`f."visitCropTags" && ${f.crops}::text[]`);
  if (f.pests?.length) c.push(Prisma.sql`f."pestTags" && ${f.pests}::text[]`);
  const vFrom = ymd(f.visitFrom), vTo = ymd(f.visitTo, true);
  if (vFrom || vTo) {
    const vp = [...(vFrom ? [Prisma.sql`v."visitedAt" >= ${vFrom}`] : []), ...(vTo ? [Prisma.sql`v."visitedAt" <= ${vTo}`] : [])];
    c.push(Prisma.sql`EXISTS (SELECT 1 FROM "Visit" v WHERE v."farmerId" = f.id AND ${Prisma.join(vp, " AND ")})`);
  }
  const where = Prisma.join(c, " AND ");

  const ws = wb.addWorksheet("Leads");
  ws.addRow([
    "Farmer", "Mobile", "Village", "Store", "RM", "District", "Registered on", "Value segment",
    "Visit crops", "Sales crops", "Pests / diseases", "Visits", "First visit", "Last visit", "Last officer",
    "Next follow-up", "Current problems", "WhatsApp opt-in",
  ]).commit();
  let cursor = 0, count = 0; const BATCH = 5000;
  for (;;) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT f.id, f.name, f.mobile, f.village, ${STORE_NAME} AS store, st."regionalManager" AS rm, st.zone AS district,
        to_char(f."createdAt", 'YYYY-MM-DD') AS registered, f."valueSegment" AS vseg,
        f."visitCropTags" AS vcrops, f."salesCropTags" AS scrops, f."pestTags" AS pests, f."whatsappOptIn" AS wa,
        va.visits, va.firstv, va.lastv, va.nextfollow,
        (SELECT v2."officerName" FROM "Visit" v2 WHERE v2."farmerId" = f.id
           ORDER BY COALESCE(to_char(v2."visitedAt",'YYYY-MM-DD'), v2."date") DESC NULLS LAST LIMIT 1) AS lastofficer,
        (SELECT array_agg(DISTINCT p) FROM "Visit" v3, unnest(v3."currentProblem") p WHERE v3."farmerId" = f.id) AS problems
      FROM "Farmer" f
      LEFT JOIN "Store" st ON st.id = f."storeId"
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int visits,
          MIN(COALESCE(to_char(v."visitedAt",'YYYY-MM-DD'), v."date")) firstv,
          MAX(COALESCE(to_char(v."visitedAt",'YYYY-MM-DD'), v."date")) lastv,
          MAX(v."followUpDate") nextfollow
        FROM "Visit" v WHERE v."farmerId" = f.id) va ON TRUE
      WHERE ${where} AND f.id > ${cursor}
      ORDER BY f.id LIMIT ${BATCH}`);
    if (!rows.length) break;
    const s = (x: unknown) => (x == null ? "" : String(x));
    for (const r of rows) {
      cursor = Number(r.id); count++;
      ws.addRow([
        s(r.name), s(r.mobile), s(r.village), s(r.store), s(r.rm), s(r.district), s(r.registered), segLabelSafe(r.vseg),
        cropsJoin(r.vcrops), cropsJoin(r.scrops), (Array.isArray(r.pests) ? (r.pests as string[]).map(tagLabel).join("; ") : ""),
        Number(r.visits ?? 0), s(r.firstv), s(r.lastv), s(r.lastofficer), s(r.nextfollow),
        (Array.isArray(r.problems) ? (r.problems as string[]).join("; ") : ""), r.wa ? "Yes" : "No",
      ]).commit();
    }
    if (rows.length < BATCH) break;
  }
  await ws.commit();
  return count;
}

/** Converted-leads sheet: farmers who registered as leads and later bought (wasLead=true), with when they
 *  converted (leadConvertedAt = first sale after registration) and the first purchase. Sales-side filters apply;
 *  FY / sale-date range bound the CONVERSION date (so "converted in FY26-27" works). */
async function writeConvertedSheet(wb: ExcelJS.stream.xlsx.WorkbookWriter, f: ExportFilters, storeIds?: number[], zones?: string[]): Promise<number> {
  const c: Prisma.Sql[] = [Prisma.sql`f.source = 'REAL'`, Prisma.sql`f."wasLead" = TRUE`, Prisma.sql`f."leadConvertedAt" IS NOT NULL`];
  if (storeIds?.length) c.push(Prisma.sql`f."storeId" = ANY(${storeIds})`);
  if (f.storeStatus?.length) c.push(Prisma.sql`st."status" = ANY(${f.storeStatus})`);
  if (zones?.length) c.push(Prisma.sql`st."zone" = ANY(${zones})`);
  if (f.villages?.length) c.push(Prisma.sql`upper(btrim(f."village")) = ANY(${f.villages})`);
  if (f.crops?.length) c.push(Prisma.sql`f."salesCropTags" && ${f.crops}::text[]`); // clients now — match purchased crops
  if (f.pests?.length) c.push(Prisma.sql`f."pestTags" && ${f.pests}::text[]`);
  if (f.valueSegments?.length) c.push(Prisma.sql`f."valueSegment" = ANY(${f.valueSegments})`);
  if (f.spendTiers?.length) {
    const ors = f.spendTiers.map((i) => SPEND_TIERS[i]).filter(Boolean).map((t) => {
      if (t.max === 0 && t.min == null) return Prisma.sql`(f."lifetimeSpend" IS NULL OR f."lifetimeSpend" <= 0)`;
      const p: Prisma.Sql[] = [];
      if (t.min != null) p.push(Prisma.sql`f."lifetimeSpend" >= ${t.min}`);
      if (t.max != null) p.push(Prisma.sql`f."lifetimeSpend" < ${t.max}`);
      return p.length ? Prisma.sql`(${Prisma.join(p, " AND ")})` : Prisma.sql`TRUE`;
    });
    if (ors.length) c.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }
  // Conversion-date window from the FY and/or sale-date-range controls.
  if (f.fyStarts?.length) {
    const ors = f.fyStarts.map((y) => Prisma.sql`(f."leadConvertedAt" >= ${new Date(Date.UTC(y, 3, 1))} AND f."leadConvertedAt" < ${new Date(Date.UTC(y + 1, 3, 1))})`);
    c.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }
  const cFrom = ymd(f.salesFrom), cTo = ymd(f.salesTo, true);
  if (cFrom) c.push(Prisma.sql`f."leadConvertedAt" >= ${cFrom}`);
  if (cTo) c.push(Prisma.sql`f."leadConvertedAt" <= ${cTo}`);
  const where = Prisma.join(c, " AND ");

  const ws = wb.addWorksheet("Leads converted to clients");
  ws.addRow([
    "Farmer", "Mobile", "Village", "Store", "RM", "District", "Registered on", "Converted on", "Days to convert",
    "Current value segment", "Current lifecycle", "Sales crops", "Visit crops", "Lifetime spend (Rs)", "Sale lines",
    "First purchase item", "First purchase crop",
  ]).commit();
  let cursor = 0, count = 0; const BATCH = 5000;
  for (;;) {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT f.id, f.name, f.mobile, f.village, ${STORE_NAME} AS store, st."regionalManager" AS rm, st.zone AS district,
        to_char(f."createdAt", 'YYYY-MM-DD') AS registered, to_char(f."leadConvertedAt", 'YYYY-MM-DD') AS converted,
        GREATEST(0, (f."leadConvertedAt"::date - f."createdAt"::date))::int AS days,
        f."valueSegment" AS vseg, f."lifecycleSegment" AS lseg, f."salesCropTags" AS scrops, f."visitCropTags" AS vcrops,
        COALESCE(f."lifetimeSpend", 0)::bigint AS spend,
        (SELECT COUNT(*)::int FROM "SaleLine" sl WHERE sl."farmerId" = f.id AND sl.source = 'REAL') AS lines,
        (SELECT sl."itemRaw" FROM "SaleLine" sl WHERE sl."farmerId" = f.id AND sl.source = 'REAL' ORDER BY sl."soldAt" ASC NULLS LAST LIMIT 1) AS firstitem,
        (SELECT sl."cropTag" FROM "SaleLine" sl WHERE sl."farmerId" = f.id AND sl.source = 'REAL' AND sl."cropTag" IS NOT NULL ORDER BY sl."soldAt" ASC NULLS LAST LIMIT 1) AS firstcrop
      FROM "Farmer" f
      LEFT JOIN "Store" st ON st.id = f."storeId"
      WHERE ${where} AND f.id > ${cursor}
      ORDER BY f.id LIMIT ${BATCH}`);
    if (!rows.length) break;
    const s = (x: unknown) => (x == null ? "" : String(x));
    for (const r of rows) {
      cursor = Number(r.id); count++;
      ws.addRow([
        s(r.name), s(r.mobile), s(r.village), s(r.store), s(r.rm), s(r.district), s(r.registered), s(r.converted),
        Number(r.days ?? 0), segLabelSafe(r.vseg), segLabelSafe(r.lseg), cropsJoin(r.scrops), cropsJoin(r.vcrops),
        Math.round(Number(r.spend ?? 0)), Number(r.lines ?? 0), s(r.firstitem), r.firstcrop ? cropLabel(String(r.firstcrop)) : "",
      ]).commit();
    }
    if (rows.length < BATCH) break;
  }
  await ws.commit();
  return count;
}

export async function GET(req: NextRequest) {
  const scope = await getScope();
  // Downloads of raw sales / visit data are restricted to system admins.
  if (scope.role !== "sysadmin") return new Response("Only system admins can download sales / visit data.", { status: 403 });
  let f: ExportFilters = {};
  const raw = req.nextUrl.searchParams.get("f");
  if (raw) { try { f = JSON.parse(Buffer.from(decodeURIComponent(raw), "base64").toString("utf8")); } catch { f = {}; } }

  const typeParam = (req.nextUrl.searchParams.get("type") ?? "sales") as ExportType;
  const type: ExportType = typeParam === "visits" || typeParam === "both" ? typeParam : "sales";
  const wantSales = type === "sales" || type === "both";
  const wantVisits = type === "visits" || type === "both";

  // Sysadmin-only (guarded above), so no per-role narrowing of stores/districts — filters apply as sent.
  const storeIds = f.storeIds, zones = f.zones;

  const stores = await prisma.store.findMany({ select: { id: true, name: true, regionalManager: true } });
  const nameById = new Map(stores.map((s) => [s.id, s.name.replace(/\s*\(.*?\)\s*/g, "").trim() || s.name]));
  const rmById = new Map(stores.map((s) => [s.id, (s.regionalManager ?? "").trim()]));

  const pass = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: pass, useStyles: false, useSharedStrings: false });

  // Write the workbook in the background; the Response streams `pass` as rows are flushed.
  (async () => {
    try {
      let sales: { grandTotal: number; lineCount: number } | null = null;
      let visitCount: number | null = null;
      let leadCount: number | null = null;
      let convertedCount: number | null = null;
      if (wantSales) sales = await writeSalesSheets(wb, f, storeIds, zones, nameById, rmById);
      if (wantVisits) visitCount = await writeVisitsSheet(wb, f, scope);
      // Leads sheet rides with the visit data (leads are visit-only, no sales).
      if (wantVisits) leadCount = await writeLeadsSheet(wb, f, storeIds, zones);
      // Converted-leads sheet rides with the sales data (they're clients now).
      if (wantSales) convertedCount = await writeConvertedSheet(wb, f, storeIds, zones);

      // ── One combined "Filters applied" sheet covering everything in this file ──
      const fyLbl = (y: number) => `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
      const scopeLabel = scope.role === "officer" ? "Your store only" : scope.role === "regional" ? "Your district only" : "All stores / districts";
      const wf = wb.addWorksheet("Filters applied");
      const fRows: (string | number)[][] = [
        ["Filter", "Applied"],
        ["Exported data", type === "both" ? "Sales + Visits" : type === "visits" ? "Visits" : "Sales"],
        ["Stores", list((wantSales ? storeIds : f.storeIds), (id) => nameById.get(id) ?? `#${id}`, "All stores")],
        ["Store status", list(f.storeStatus, (s) => String(s), "Active + Inactive")],
        ["Districts", list((wantSales ? zones : f.zones), (z) => String(z), "All districts")],
        ["Villages", list(f.villages, (v) => String(v), "All villages")],
        ["Crops", list(f.crops, cropLabel, "All crops")],
        ["Pests / diseases", list(f.pests, tagLabel, "All")],
        ["Access scope", scopeLabel],
      ];
      if (wantSales) {
        fRows.push(
          ["", ""],
          ["— Sales filters —", ""],
          ["Financial year(s)", list(f.fyStarts, fyLbl, "All FYs")],
          ["Sale-line date range", f.salesFrom || f.salesTo ? `${f.salesFrom ?? "start"} to ${f.salesTo ?? "today"}` : "All dates"],
          ["Value segment", list(f.valueSegments, (s) => segMeta(s).label, "All")],
          ["Lifecycle", list(f.lifecycleSegments, (s) => segMeta(s).label, "All")],
          ["Spend tier", list(f.spendTiers, (i) => SPEND_TIERS[i]?.label ?? String(i), "Any")],
          ["Farmers in matrix", sales?.grandTotal ?? 0],
          ["Sale lines in file", sales?.lineCount ?? 0],
          ["Converted leads in file", convertedCount ?? 0],
          ["Money basis", "Base / pre-tax price (SaleLine.basic)"],
        );
      }
      if (wantVisits) {
        fRows.push(
          ["", ""],
          ["— Visit filters —", ""],
          ["Visit date range", f.visitFrom || f.visitTo ? `${f.visitFrom ?? "start"} to ${f.visitTo ?? "today"}` : "All dates"],
          ["Current problem", list(f.problems, (p) => String(p), "Any")],
          ["Value segment", list(f.valueSegments, (s) => segMeta(s).label, "All")],
          ["Lifecycle", list(f.lifecycleSegments, (s) => segMeta(s).label, "All")],
          ["Visits in file", visitCount ?? 0],
          ["Leads in file", leadCount ?? 0],
        );
      }
      fRows.push(["", ""], ["Exported (UTC)", new Date().toISOString().slice(0, 19).replace("T", " ")]);
      for (const r of fRows) wf.addRow(r).commit();
      await wf.commit();

      await wb.commit();
    } catch (e) {
      pass.destroy(e as Error);
    }
  })();

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `analytics-${type}-${ts}.xlsx`;
  return new Response(Readable.toWeb(pass) as unknown as ReadableStream, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Filename": filename,
      "Cache-Control": "no-store",
    },
  });
}
