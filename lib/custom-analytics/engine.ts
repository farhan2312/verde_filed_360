/**
 * Custom analytics — query engine. Turns one visual (+ page filters + click-to-filter) into a single
 * aggregate SQL query over the semantic model, ALWAYS restricted to the viewer's own scope.
 *
 * Safety: every SQL fragment comes from the constant model in sql.ts, chosen by id after validation
 * against model.ts. User-supplied values (dates, stores, segments, clicked values, top-N keys) are only
 * ever bound parameters ($n). Plain module — server only.
 */
import { prisma } from "@/lib/prisma";
import type { Scope } from "@/lib/scope";
import { allRmStores } from "@/lib/rm-stores";
import { startOfToday } from "@/lib/action-constants";
import { SQL, type DatasetSql } from "./sql";
import { DATASET_BY_ID, fieldMeta, aggsFor, mapDim, FILTER_SUPPORT, LINK_FIELDS_LABEL, type FieldMeta } from "./model";
import type { Visual, PageFilters, CrossFilter, FieldRef, ValueRef, VisualResult, DateGrain, Agg } from "./types";

/** Bound-parameter collector → "$1", "$2"… */
class Params {
  list: unknown[] = [];
  p(v: unknown, cast = ""): string { this.list.push(v); return `$${this.list.length}${cast}`; }
}

const OTHER = "Other";
const MAX_DATE_POINTS = 500;
const TABLE_PAGE = 50;
const EXPORT_CAP = 50_000;

/** Store ids the viewer may see: null = everything, "none" = nothing (fail closed). */
export function scopeStoreIds(scope: Scope): number[] | null | "none" {
  if (scope.role === "campaigner") return "none";
  if (scope.role === "officer") return scope.storeId != null ? [scope.storeId] : "none";
  if (scope.role === "regional") return scope.managedStoreIds && scope.managedStoreIds.length ? scope.managedStoreIds : "none";
  return null;
}

/**
 * The RM page filter → the stores those managers hold. `Store.rmUserIds` is the authoritative link and a
 * store can have several managers, so the filter is keyed on User.id and resolved through the SAME helper
 * the review queue uses (lib/rm-stores.ts) — the comma-joined `Store.regionalManager` label is not a key.
 * Still ANDed with the viewer's own scope, so picking an RM can only ever narrow what they already see.
 */
export async function rmFilterStoreIds(rmUserIds: number[]): Promise<number[]> {
  const want = new Set(rmUserIds);
  const ids = new Set<number>();
  for (const rm of await allRmStores()) if (want.has(rm.userId)) rm.storeIds.forEach((id) => ids.add(id));
  return [...ids];
}

const ist = (x: string) => `(${x} + interval '330 minutes')`;
function grainExpr(x: string, g: DateGrain): string {
  const t = ist(x);
  switch (g) {
    case "day": return `to_char(${t}, 'YYYY-MM-DD')`;
    case "week": return `to_char(date_trunc('week', ${t}), 'YYYY-MM-DD')`;
    case "month": return `to_char(${t}, 'YYYY-MM')`;
    case "quarter": return `to_char(${t}, 'YYYY-"Q"Q')`;
    case "year": return `to_char(${t}, 'YYYY')`;
    case "fy": return `('FY' || to_char(${t} - interval '3 months', 'YY') || '-' || to_char(${t} + interval '9 months', 'YY'))`;
  }
}

/** IST calendar maths for the page date presets → [from, to) as UTC instants. */
export function dateRange(f: PageFilters): { from?: Date; to?: Date } {
  const preset = f.datePreset ?? "all";
  if (preset === "all") return {};
  const IST = 330 * 60_000;
  const nowIst = new Date(Date.now() + IST);
  const y = nowIst.getUTCFullYear(), mo = nowIst.getUTCMonth(), day = nowIst.getUTCDate();
  const at = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd) - IST); // IST midnight
  const tomorrow = at(y, mo, day + 1);
  const fyStartYear = mo >= 3 ? y : y - 1;
  switch (preset) {
    case "30d": return { from: at(y, mo, day - 29), to: tomorrow };
    case "90d": return { from: at(y, mo, day - 89), to: tomorrow };
    case "thisMonth": return { from: at(y, mo, 1), to: tomorrow };
    case "lastMonth": return { from: at(y, mo - 1, 1), to: at(y, mo, 1) };
    case "thisFy": return { from: at(fyStartYear, 3, 1), to: tomorrow };
    case "lastFy": return { from: at(fyStartYear - 1, 3, 1), to: at(fyStartYear, 3, 1) };
    case "custom": {
      const p = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").map(Number) : null);
      const a = p(f.dateFrom), b = p(f.dateTo);
      return { from: a ? at(a[0], a[1] - 1, a[2]) : undefined, to: b ? at(b[0], b[1] - 1, b[2] + 1) : undefined };
    }
  }
  return {};
}

interface Built { from: string; where: string; ignored: string[] }

/** A field usable as a dimension in this dataset (dims, and — for tables — numeric columns too). */
function dimField(ds: string, ref: FieldRef | null | undefined): FieldMeta | null {
  if (!ref) return null;
  const f = fieldMeta(ds, ref.field);
  return f && f.kind !== "measure" ? f : null;
}

const GRAINS: DateGrain[] = ["day", "week", "month", "quarter", "year", "fy"];

function dimSql(def: DatasetSql, ds: string, ref: FieldRef, laterals: Set<string>): string {
  const meta = fieldMeta(ds, ref.field)!;
  const fd = def.fields[ref.field];
  if (fd.lateral) laterals.add(fd.lateral);
  if (meta.date) return grainExpr(fd.expr, ref.grain && GRAINS.includes(ref.grain) ? ref.grain : "month"); // allow-listed
  return `(${fd.expr})::text`;
}

function valueSql(def: DatasetSql, ds: string, v: ValueRef, laterals: Set<string>): string {
  const meta = fieldMeta(ds, v.field)!;
  if (meta.kind === "measure") return def.measures[v.field];
  const fd = def.fields[v.field];
  if (fd.lateral) laterals.add(fd.lateral);
  const agg: Agg = v.agg && aggsFor(meta).includes(v.agg) ? v.agg : meta.kind === "num" ? meta.defaultAgg ?? "sum" : "distinct";
  switch (agg) {
    case "sum": return `COALESCE(SUM(${fd.expr}), 0)`;
    case "avg": return `AVG(${fd.expr})`;
    case "min": return `MIN(${fd.expr})`;
    case "max": return `MAX(${fd.expr})`;
    case "count": return `COUNT(${fd.expr})`;
    case "distinct": return `COUNT(DISTINCT ${fd.expr})`;
  }
}

/** `rmStores` = the stores the picked RMs manage (already resolved, see rmFilterStoreIds); null = no RM filter. */
function buildBase(ds: string, def: DatasetSql, scope: Scope, f: PageFilters, cf: CrossFilter | null, q: Params, laterals: Set<string>, rmStores: number[] | null): Built {
  const where = [...def.where];
  const ignored: string[] = [];
  const sup = FILTER_SUPPORT[ds];

  const ids = scopeStoreIds(scope);
  if (ids === "none") where.push("false");
  else if (ids) where.push(`${def.storeCol} = ANY(${q.p(ids, "::int[]")})`);

  const strs = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string").slice(0, 500) : []);
  const storeIds = Array.isArray(f.storeIds) ? f.storeIds.map(Number).filter(Number.isInteger).slice(0, 500) : [];
  const regions = strs(f.regions), vsegs = strs(f.valueSegments), lsegs = strs(f.lifecycles);
  if (storeIds.length) where.push(`${def.storeCol} = ANY(${q.p(storeIds, "::int[]")})`);
  // btrim to match the trimmed labels getFilterOptions offers (and the `region` dimension expression).
  if (regions.length) where.push(`btrim(s.zone) = ANY(${q.p(regions, "::text[]")})`);
  // An RM who manages nothing matches no store — fail closed rather than ignoring the filter.
  if (rmStores) where.push(rmStores.length ? `${def.storeCol} = ANY(${q.p(rmStores, "::int[]")})` : "false");
  if (vsegs.length) {
    if (sup.valueSegment && def.valueSegment) where.push(`${def.valueSegment} = ANY(${q.p(vsegs, "::text[]")})`);
    else ignored.push("Value segment");
  }
  if (lsegs.length) {
    if (sup.lifecycle && def.lifecycle) where.push(`${def.lifecycle} = ANY(${q.p(lsegs, "::text[]")})`);
    else ignored.push("Lifecycle");
  }
  const r = dateRange(f);
  if (r.from || r.to) {
    if (def.date) {
      if (r.from) where.push(`${def.date} >= ${q.p(r.from, "::timestamp")}`);
      if (r.to) where.push(`${def.date} < ${q.p(r.to, "::timestamp")}`);
    } else ignored.push("Date");
  }

  // Click-to-filter: the same field on the same dataset, or a shared (common) field on any dataset.
  if (cf && typeof cf.value === "string" && typeof cf.field === "string" && cf.value !== OTHER) {
    let ref: FieldRef | null = null;
    if (cf.dataset === ds && fieldMeta(ds, cf.field)) ref = { field: cf.field, grain: cf.grain };
    else if (cf.common) {
      const match = DATASET_BY_ID[ds].fields.find((x) => x.common === cf.common && x.kind === "dim");
      if (match) ref = { field: match.id };
    }
    if (ref) where.push(`${dimSql(def, ds, ref, laterals)} = ${q.p(cf.value)}`);
  }

  return { from: def.from, where: where.length ? `WHERE ${where.join(" AND ")}` : "", ignored };
}

async function run<T>(sql: string, params: unknown[]): Promise<T[]> {
  const [, rows] = await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = 25000`),
    prisma.$queryRawUnsafe<T[]>(sql, ...params),
  ]);
  return rows;
}

const toNum = (x: unknown): number | null => (x == null ? null : typeof x === "number" ? x : typeof x === "bigint" ? Number(x) : Number(x as string));

/** Which dims a visual groups by, its values, and the category cap per dim. */
function shape(v: Visual): { dims: FieldRef[]; caps: (number | null)[]; values: ValueRef[] } {
  // topN arrives from the browser and ends up in LIMIT — always a clamped integer, never raw input.
  const top = (dflt: number, max = 50) => Math.max(3, Math.min(max, Math.floor(Number(v.topN) || dflt)));
  const vals = Array.isArray(v.values) ? v.values : [];
  const axis = v.axis ? [v.axis] : [];
  switch (v.type) {
    case "kpi": return { dims: [], caps: [], values: vals.slice(0, 1) };
    case "table": return { dims: (Array.isArray(v.dims) ? v.dims : []).slice(0, 4), caps: [], values: vals.slice(0, 6) };
    case "matrix": return { dims: [v.axis, v.split].filter(Boolean) as FieldRef[], caps: [top(50, 200), 12], values: vals.slice(0, 1) };
    case "donut": return { dims: axis, caps: [top(8)], values: vals.slice(0, 1) };
    case "treemap": return { dims: axis, caps: [top(30)], values: vals.slice(0, 1) };
    default: {
      const dims = [v.axis, v.split].filter(Boolean) as FieldRef[];
      return { dims, caps: [top(15), 8], values: v.split ? vals.slice(0, 1) : vals.slice(0, 4) };
    }
  }
}

export interface RunOpts { page?: number; sortKey?: string; sortDir?: "asc" | "desc"; exportAll?: boolean }

interface Group { ds: string; dims: FieldRef[]; idx: number[] }

export async function runVisual(scope: Scope, v: Visual, filters: PageFilters, cf: CrossFilter | null, opts: RunOpts = {}): Promise<VisualResult> {
  const ds0 = v.dataset;
  if (!ds0 || !SQL[ds0] || !DATASET_BY_ID[ds0]) return { ok: false, error: "Add a field from the Data panel to start.", rows: [] };
  const { dims, caps, values } = shape(v);

  // Validate every field against the model (unknown ids are rejected, never interpolated). Dimensions belong to
  // the visual's table; each value may come from its own table.
  for (const d of dims) if (!d || typeof d.field !== "string" || !dimField(ds0, d)) return { ok: false, error: "Unknown field on this visual.", rows: [] };
  const vds = values.map((x) => (x && typeof x.dataset === "string" ? x.dataset : ds0));
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!x || typeof x.field !== "string" || !SQL[vds[i]] || !fieldMeta(vds[i], x.field)) return { ok: false, error: "Unknown value on this visual.", rows: [] };
  }
  if (v.type !== "table" && !values.length) return { ok: false, error: "Add a value (a number to show).", rows: [] };
  if (v.type === "table" && !values.length && !dims.length) return { ok: false, error: "Add fields to the table.", rows: [] };
  if (v.type === "matrix" && dims.length < 2) return { ok: false, error: "A matrix needs Rows and Columns.", rows: [] };
  if (["column", "bar", "line", "area", "donut", "treemap"].includes(v.type) && !dims.length) return { ok: false, error: "Add a field to the axis.", rows: [] };

  // One query per table, each grouped by the SAME dimensions mapped into that table (shared fields / main date).
  const groups: Group[] = [];
  for (let i = 0; i < values.length; i++) {
    let g = groups.find((x) => x.ds === vds[i]);
    if (!g) {
      const mapped = dims.map((d) => mapDim(ds0, d, vds[i]));
      const bad = mapped.findIndex((m) => !m);
      if (bad >= 0) return { ok: false, error: `${DATASET_BY_ID[vds[i]].label} can't be split by "${fieldMeta(ds0, dims[bad].field)?.label}" — tables only line up on ${LINK_FIELDS_LABEL}.`, rows: [] };
      g = { ds: vds[i], dims: mapped as FieldRef[], idx: [] };
      groups.push(g);
    }
    g.idx.push(i);
  }
  if (!groups.length) groups.push({ ds: ds0, dims, idx: [] });
  const isDate = dims.map((d) => !!fieldMeta(ds0, d.field)?.date);

  // The RM filter is by user id, so it needs one lookup before any query is built (see rmFilterStoreIds).
  const rmIds = Array.isArray(filters.rmUserIds) ? filters.rmUserIds.map(Number).filter(Number.isInteger).slice(0, 200) : [];
  let rmStores: number[] | null = null;

  /** Build every SQL piece for one table with a FRESH parameter list (Postgres rejects unused bound params). */
  const prep = (g: Group, foldKeys: (string[] | null)[] = []) => {
    const def = SQL[g.ds];
    const q = new Params();
    const laterals = new Set<string>();
    const base = buildBase(g.ds, def, scope, filters, cf, q, laterals, rmStores);
    const dimExprs = g.dims.map((d) => dimSql(def, g.ds, d, laterals));
    const valExprs = g.idx.map((i) => valueSql(def, g.ds, values[i], laterals));
    const folded = dimExprs.map((e, i) => (foldKeys[i] ? `CASE WHEN ${e} = ANY(${q.p(foldKeys[i], "::text[]")}) THEN ${e} ELSE '${OTHER}' END` : e));
    const from = `${base.from} ${[...laterals].join(" ")}`;
    const finish = (sql: string) => (sql.includes(":today") ? sql.replaceAll(":today", q.p(startOfToday(), "::timestamp")) : sql);
    const sel = [...folded.map((e, i) => `${e} AS d${i}`), ...valExprs.map((e, i) => `${e} AS m${i}`)];
    return { q, base, dimExprs, valExprs, folded, from, finish, sel };
  };

  try {
    if (rmIds.length) rmStores = await rmFilterStoreIds(rmIds);
    // Fold long category lists into "Other" (top N by the first value, in its table). Date axes are never
    // folded; a full table export is never folded. Category text is the same in every table, so the keys apply to all.
    let truncated = false;
    const lead = groups[0];
    const foldKeys: (string[] | null)[] = dims.map(() => null);
    if (!(opts.exportAll && v.type === "table")) {
      for (let i = 0; i < dims.length; i++) {
        const cap = caps[i];
        if (cap == null || isDate[i]) continue;
        const P = prep(lead);
        const primary = P.valExprs[0] ?? "COUNT(*)";
        const top = await run<{ k: string | null }>(P.finish(`SELECT ${P.dimExprs[i]} AS k FROM ${P.from} ${P.base.where} GROUP BY 1 ORDER BY ${primary} DESC NULLS LAST LIMIT ${cap + 1}`), P.q.list);
        if (top.length > cap) { truncated = true; foldKeys[i] = top.slice(0, cap).map((t) => t.k ?? ""); }
      }
    }
    const group = dims.length ? `GROUP BY ${dims.map((_, i) => i + 1).join(", ")}` : "";

    if (groups.length > 1) return { ...(await runJoined(groups, prep, foldKeys, group, dims.length, values.length, isDate, v.type, opts)), truncated };

    const P = prep(lead, foldKeys);
    const sel = P.sel;

    if (v.type === "matrix") {
      const [a, b] = P.folded;
      const sql = `SELECT ${sel.join(", ")}, GROUPING(${a}) AS g0, GROUPING(${b}) AS g1 FROM ${P.from} ${P.base.where}
        GROUP BY GROUPING SETS ((${a}, ${b}), (${a}), (${b}), ())`;
      const rows = await run<Record<string, unknown>>(P.finish(sql), P.q.list);
      return {
        ok: true, truncated, ignoredFilters: P.base.ignored,
        rows: rows.map((r) => ({ d0: Number(r.g0) === 1 ? "__total" : (r.d0 as string | null), d1: Number(r.g1) === 1 ? "__total" : (r.d1 as string | null), m0: toNum(r.m0) })),
      };
    }

    if (v.type === "table") {
      const keys = [...dims.map((_, i) => `d${i}`), ...values.map((_, i) => `m${i}`)];
      const sortKey = opts.sortKey && keys.includes(opts.sortKey) ? opts.sortKey : values.length ? "m0" : "d0";
      const dir = opts.sortDir === "asc" ? "ASC" : "DESC";
      const page = Math.max(0, Math.min(100_000, Math.floor(Number(opts.page) || 0)));
      const limit = opts.exportAll ? EXPORT_CAP : TABLE_PAGE;
      const sql = `SELECT ${sel.join(", ")}, COUNT(*) OVER () AS __total FROM ${P.from} ${P.base.where} ${group}
        ORDER BY ${sortKey} ${dir} NULLS LAST LIMIT ${limit} OFFSET ${opts.exportAll ? 0 : page * TABLE_PAGE}`;
      const rows = await run<Record<string, unknown>>(P.finish(sql), P.q.list);
      return { ok: true, ignoredFilters: P.base.ignored, total: rows.length ? toNum(rows[0].__total) ?? 0 : 0, rows: rows.map((r) => clean(r, dims.length, values.length)) };
    }

    // KPI + charts. Wrapped so the outer ORDER BY can use the output names (Other last).
    const inner = `SELECT ${sel.join(", ")} FROM ${P.from} ${P.base.where} ${group}`;
    const order = !dims.length ? "" : isDate[0] ? "ORDER BY d0 ASC" : `ORDER BY (d0 = '${OTHER}'), m0 DESC NULLS LAST`;
    const limit = dims.length && isDate[0] ? `LIMIT ${MAX_DATE_POINTS * (dims.length > 1 ? 9 : 1)}` : "";
    const rows = await run<Record<string, unknown>>(P.finish(`SELECT * FROM (${inner}) t ${order} ${limit}`), P.q.list);
    return { ok: true, truncated, ignoredFilters: P.base.ignored, rows: rows.map((r) => clean(r, dims.length, values.length)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /statement timeout|canceling statement/i.test(msg) ? "This visual took too long — add a filter or pick fewer categories." : "Couldn't load this visual.", rows: [] };
  }
}

const JOIN_CAP = 20_000;
const KEY_SEP = "\u0001";

/**
 * Values from several tables: run each table's query grouped by the shared dimensions, then line the rows up
 * by those dimension values (a full outer join in memory). Tables sort / page here instead of in SQL.
 */
async function runJoined(
  groups: Group[],
  prep: (g: Group, foldKeys?: (string[] | null)[]) => { q: Params; base: Built; from: string; finish: (s: string) => string; sel: string[] },
  foldKeys: (string[] | null)[], group: string, nd: number, nv: number, isDate: boolean[], type: Visual["type"], opts: RunOpts,
): Promise<VisualResult> {
  const merged = new Map<string, Record<string, string | number | null>>();
  const ignored = new Set<string>();
  for (const g of groups) {
    const P = prep(g, foldKeys);
    P.base.ignored.forEach((x) => ignored.add(`${x} (${DATASET_BY_ID[g.ds].label})`));
    const rows = await run<Record<string, unknown>>(P.finish(`SELECT ${P.sel.join(", ")} FROM ${P.from} ${P.base.where} ${group} LIMIT ${JOIN_CAP}`), P.q.list);
    for (const r of rows) {
      const key = Array.from({ length: nd }, (_, i) => String(r[`d${i}`] ?? "")).join(KEY_SEP);
      let row = merged.get(key);
      if (!row) {
        row = {};
        for (let i = 0; i < nd; i++) row[`d${i}`] = (r[`d${i}`] as string | null) ?? null;
        for (let i = 0; i < nv; i++) row[`m${i}`] = null;
        merged.set(key, row);
      }
      const target = row;
      g.idx.forEach((vi, j) => { target[`m${vi}`] = toNum(r[`m${j}`]); });
    }
  }
  let rows = [...merged.values()];
  const num = (x: unknown) => (typeof x === "number" ? x : -Infinity);
  if (type === "table") {
    const keys = [...Array.from({ length: nd }, (_, i) => `d${i}`), ...Array.from({ length: nv }, (_, i) => `m${i}`)];
    const sortKey = opts.sortKey && keys.includes(opts.sortKey) ? opts.sortKey : nv ? "m0" : "d0";
    const dir = opts.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => (sortKey.startsWith("m") ? num(a[sortKey]) - num(b[sortKey]) : String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""))) * dir);
    const total = rows.length;
    if (!opts.exportAll) { const page = Math.max(0, Math.min(100_000, Math.floor(Number(opts.page) || 0))); rows = rows.slice(page * TABLE_PAGE, page * TABLE_PAGE + TABLE_PAGE); }
    return { ok: true, total, rows, ignoredFilters: [...ignored] };
  }
  rows.sort((a, b) => (isDate[0] ? String(a.d0 ?? "").localeCompare(String(b.d0 ?? "")) : a.d0 === OTHER ? 1 : b.d0 === OTHER ? -1 : num(b.m0) - num(a.m0)));
  return { ok: true, rows, ignoredFilters: [...ignored] };
}

function clean(r: Record<string, unknown>, nd: number, nv: number): Record<string, string | number | null> {
  const o: Record<string, string | number | null> = {};
  for (let i = 0; i < nd; i++) o[`d${i}`] = (r[`d${i}`] as string | null) ?? null;
  for (let i = 0; i < nv; i++) o[`m${i}`] = toNum(r[`m${i}`]);
  return o;
}
