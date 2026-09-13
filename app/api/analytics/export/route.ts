import type { NextRequest } from "next/server";
import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, type Scope } from "@/lib/scope";
import { SPEND_TIERS } from "@/lib/spend-tiers";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS } from "@/lib/campaign-segments";

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
  storeIds?: number[]; zones?: string[]; villages?: string[]; crops?: string[]; pests?: string[];
  valueSegments?: string[]; lifecycleSegments?: string[]; spendTiers?: number[]; fyStarts?: number[];
  problems?: string[]; // visit lens — Current Problem
  visitFrom?: string; visitTo?: string; // visit lens — visitedAt range (ISO YYYY-MM-DD)
}
type ExportType = "sales" | "visits" | "both";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const list = <T,>(arr: T[] | undefined, fn: (x: T) => string, none: string) => (arr?.length ? arr.map(fn).join(", ") : none);
const segLabelSafe = (x: unknown) => { const k = x == null ? "" : String(x); if (!k) return ""; try { return segMeta(k).label; } catch { return k; } };

function fyWindow(fyStarts?: number[]): Prisma.Sql | null {
  if (!fyStarts?.length) return null;
  const ors = fyStarts.map((y) => Prisma.sql`(sl."soldAt" >= ${new Date(Date.UTC(y, 3, 1))} AND sl."soldAt" < ${new Date(Date.UTC(y + 1, 3, 1))})`);
  return Prisma.sql`(${Prisma.join(ors, " OR ")})`;
}

/** Farmer-level conditions shared by the matrix and the sale-lines query (alias f, store alias st). */
function farmerConds(f: ExportFilters, storeIds?: number[], zones?: string[]): Prisma.Sql[] {
  const c: Prisma.Sql[] = [Prisma.sql`f.source = 'REAL'`];
  if (storeIds?.length) c.push(Prisma.sql`f."storeId" = ANY(${storeIds})`);
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
  storeIds: number[] | undefined, zones: string[] | undefined, nameById: Map<number, string>,
): Promise<{ grandTotal: number; lineCount: number }> {
  const fWhere = Prisma.join(farmerConds(f, storeIds, zones), " AND ");
  const cropLine = f.crops?.length ? Prisma.sql`AND sl."cropTag" = ANY(${f.crops}::text[])` : Prisma.empty;
  const fyw = fyWindow(f.fyStarts);
  const fyLine = fyw ? Prisma.sql`AND ${fyw}` : Prisma.empty;
  const V = [...VALUE_SEGMENTS], L = [...LIFECYCLE_SEGMENTS];
  const combos = V.flatMap((v) => L.map((l) => [v, l] as const));

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
    name: sid == null ? "Unassigned" : nameById.get(sid) ?? `Store #${sid}`, ...s,
  })).sort((a, b) => b.total - a.total).slice(0, 200);
  const ws1 = wb.addWorksheet("Value x Lifecycle x Store");
  ws1.addRow(["Store", ...combos.map(([v, l]) => `${segMeta(v).label} · ${segMeta(l).label}`), "Total"]).commit();
  ws1.addRow(["All stores", ...combos.map(([v, l]) => grand[`${v}|${l}`] ?? 0), grandTotal]).commit();
  for (const s of matrixSorted) ws1.addRow([s.name, ...combos.map(([v, l]) => s.cell[`${v}|${l}`] ?? 0), s.total]).commit();
  await ws1.commit();

  // ── Sheet: every matching sale line (keyset-paged) ──
  const ws2 = wb.addWorksheet("Sales lines");
  ws2.addRow(["Order No", "Date", "Financial year", "Farmer", "Mobile", "Village", "Store", "District", "Item", "Crop", "Category", "Qty", "UOM", "Base value (Rs)", "Value segment", "Lifecycle"]).commit();
  let cursor = 0, lineCount = 0;
  const BATCH = 10000;
  for (;;) {
    const rows = await prisma.$queryRaw<Array<{
      id: number; ordno: string | null; soldat: Date | null; fy: string | null; name: string; mobile: string | null;
      village: string | null; sid: number | null; zone: string | null; item: string; crop: string | null; cat: string | null;
      qty: number | null; uom: string | null; basic: number | null; vseg: string | null; lseg: string | null;
    }>>(Prisma.sql`
      SELECT sl.id, sl."orderNo" ordno, sl."soldAt" soldat, sl."financialYear" fy, f.name, f.mobile, f."village" village,
        f."storeId" sid, st."zone" zone, sl."itemRaw" item, sl."cropTag" crop, sl."mainCategory" cat,
        sl.qty, sl.uom, sl."basic" basic, f."valueSegment" vseg, f."lifecycleSegment" lseg
      FROM "SaleLine" sl JOIN "Farmer" f ON f.id = sl."farmerId" LEFT JOIN "Store" st ON st.id = f."storeId"
      WHERE sl.source = 'REAL' AND sl."farmerId" IS NOT NULL AND ${fWhere} ${cropLine} ${fyLine} AND sl.id > ${cursor}
      ORDER BY sl.id LIMIT ${BATCH}`);
    if (!rows.length) break;
    for (const r of rows) {
      cursor = r.id; lineCount++;
      ws2.addRow([
        r.ordno ?? "", r.soldat ? new Date(r.soldat).toISOString().slice(0, 10) : "", r.fy ?? "",
        r.name, r.mobile ?? "", r.village ?? "", r.sid != null ? nameById.get(r.sid) ?? "" : "", r.zone ?? "",
        r.item, r.crop ? cropLabel(r.crop) : "", r.cat ?? "", r.qty ?? 0, r.uom ?? "",
        Math.round(r.basic ?? 0), r.vseg ? segMeta(r.vseg).label : "", r.lseg ? segMeta(r.lseg).label : "",
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
  if (f.villages?.length) vc.push(Prisma.sql`upper(btrim(f."village")) = ANY(${f.villages})`);
  if (f.crops?.length) vc.push(Prisma.sql`f."visitCropTags" && ${f.crops}::text[]`);
  if (f.pests?.length) vc.push(Prisma.sql`f."pestTags" && ${f.pests}::text[]`);
  if (f.problems?.length) vc.push(Prisma.sql`v."currentProblem" && ${f.problems}::text[]`);
  const vDateFrom = f.visitFrom && /^\d{4}-\d{2}-\d{2}$/.test(f.visitFrom) ? new Date(`${f.visitFrom}T00:00:00Z`) : null;
  const vDateTo = f.visitTo && /^\d{4}-\d{2}-\d{2}$/.test(f.visitTo) ? new Date(`${f.visitTo}T23:59:59Z`) : null;
  if (vDateFrom) vc.push(Prisma.sql`v."visitedAt" >= ${vDateFrom}`);
  if (vDateTo) vc.push(Prisma.sql`v."visitedAt" <= ${vDateTo}`);
  const vWhere = vc.length ? Prisma.join(vc, " AND ") : Prisma.sql`TRUE`;

  const ws = wb.addWorksheet("Visits");
  ws.addRow([
    "Visit ID", "Date", "Farmer", "Mobile", "Village", "Store", "District", "Officer", "Recorded by", "Emp code",
    "Visit type", "Visit mode", "GPS lat", "GPS lng", "Follow-up date", "Soil type", "Soil testing", "Water source",
    "Main crop", "Crops", "Other crops", "Season", "Crop insured", "Land holding", "Products", "Product required",
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
        COALESCE(vs.zone, fs.zone) AS district,
        v."officerName" AS officer, v."recordedBy" AS recordedby, v."recordedByCode" AS empcode,
        COALESCE(v.type, v.purpose) AS visittype, v."visitMode" AS visitmode, v."gpsLat" AS lat, v."gpsLng" AS lng,
        v."followUpDate" AS followup, v."soilType" AS soiltype, v."soilTesting" AS soiltesting,
        array_to_string(v."waterSource", '; ') AS water, v."mainCrop" AS maincrop,
        array_to_string(v.crops, '; ') AS crops, v."otherCrops" AS othercrops, v.season,
        v."cropInsured" AS insured, v."landHoldingUnit" AS land,
        array_to_string(v.products, '; ') AS products, array_to_string(v."productRequired", '; ') AS prodreq,
        array_to_string(v."currentProblem", '; ') AS problem, array_to_string(v."cropRisk", '; ') AS croprisk,
        array_to_string(v."dangerZone", '; ') AS danger, v."annualExpense" AS expense, v."purchaseFreq" AS freq,
        v."otherShops" AS othershops, v."fpoMember" AS fpo, v."fpoName" AS fponame,
        v."contractFarming" AS contract, v."contractDetail" AS contractdetail,
        v."dairyServices" AS dairy, v."dairyDetail" AS dairydetail, v."whatsappAvail" AS wa, v."whatsappNumber" AS wanum,
        COALESCE(array_length(v.photos,1),0) AS photos, COALESCE(array_length(v."voiceNotes",1),0) AS voices,
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
        Number(r.id), s(r.date), s(r.farmer), s(r.mobile), s(r.village), s(r.store), s(r.district),
        s(r.officer), s(r.recordedby), s(r.empcode), s(r.visittype), s(r.visitmode),
        r.lat ?? "", r.lng ?? "", s(r.followup), s(r.soiltype), s(r.soiltesting), s(r.water),
        s(r.maincrop), s(r.crops), s(r.othercrops), s(r.season), yn(r.insured), s(r.land),
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

export async function GET(req: NextRequest) {
  const scope = await getScope();
  let f: ExportFilters = {};
  const raw = req.nextUrl.searchParams.get("f");
  if (raw) { try { f = JSON.parse(Buffer.from(decodeURIComponent(raw), "base64").toString("utf8")); } catch { f = {}; } }

  const typeParam = (req.nextUrl.searchParams.get("type") ?? "sales") as ExportType;
  const type: ExportType = typeParam === "visits" || typeParam === "both" ? typeParam : "sales";
  const wantSales = type === "sales" || type === "both";
  const wantVisits = type === "visits" || type === "both";

  // RBAC guards (apply to whichever sheets are requested).
  if (scope.role === "officer" && scope.storeId == null) return new Response("No store assigned to your account.", { status: 403 });
  if (scope.role === "regional" && !scope.zone) return new Response("No district assigned to your account.", { status: 403 });

  // Scope-derived store/district filters for the SALES sheets (LAST, so no query param can widen them).
  let storeIds = f.storeIds, zones = f.zones;
  if (scope.role === "officer") { storeIds = [scope.storeId as number]; zones = undefined; }
  else if (scope.role === "regional") { zones = [scope.zone as string]; }

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const nameById = new Map(stores.map((s) => [s.id, s.name.replace(/\s*\(.*?\)\s*/g, "").trim() || s.name]));

  const pass = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: pass, useStyles: false, useSharedStrings: false });

  // Write the workbook in the background; the Response streams `pass` as rows are flushed.
  (async () => {
    try {
      let sales: { grandTotal: number; lineCount: number } | null = null;
      let visitCount: number | null = null;
      if (wantSales) sales = await writeSalesSheets(wb, f, storeIds, zones, nameById);
      if (wantVisits) visitCount = await writeVisitsSheet(wb, f, scope);

      // ── One combined "Filters applied" sheet covering everything in this file ──
      const fyLbl = (y: number) => `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
      const scopeLabel = scope.role === "officer" ? "Your store only" : scope.role === "regional" ? "Your district only" : "All stores / districts";
      const wf = wb.addWorksheet("Filters applied");
      const fRows: (string | number)[][] = [
        ["Filter", "Applied"],
        ["Exported data", type === "both" ? "Sales + Visits" : type === "visits" ? "Visits" : "Sales"],
        ["Stores", list((wantSales ? storeIds : f.storeIds), (id) => nameById.get(id) ?? `#${id}`, "All stores")],
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
          ["Value segment", list(f.valueSegments, (s) => segMeta(s).label, "All")],
          ["Lifecycle", list(f.lifecycleSegments, (s) => segMeta(s).label, "All")],
          ["Spend tier", list(f.spendTiers, (i) => SPEND_TIERS[i]?.label ?? String(i), "Any")],
          ["Farmers in matrix", sales?.grandTotal ?? 0],
          ["Sale lines in file", sales?.lineCount ?? 0],
          ["Money basis", "Base / pre-tax price (SaleLine.basic)"],
        );
      }
      if (wantVisits) {
        fRows.push(
          ["", ""],
          ["— Visit filters —", ""],
          ["Visit date range", f.visitFrom || f.visitTo ? `${f.visitFrom ?? "start"} to ${f.visitTo ?? "today"}` : "All dates"],
          ["Current problem", list(f.problems, (p) => String(p), "Any")],
          ["Visits in file", visitCount ?? 0],
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
