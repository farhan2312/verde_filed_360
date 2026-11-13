/**
 * Custom analytics — the saved report format (client + server safe, no imports of server code).
 * A report is pages of visuals on a 12-column grid. Each visual reads ONE dataset from the semantic
 * model (lib/custom-analytics/model.ts) and is resolved server-side in the viewer's own scope.
 */

export type VisualType = "kpi" | "table" | "matrix" | "column" | "bar" | "line" | "area" | "donut" | "treemap";
export type Agg = "sum" | "avg" | "min" | "max" | "count" | "distinct";
export type DateGrain = "day" | "week" | "month" | "quarter" | "year" | "fy";

/** A dimension placed on a visual (axis / split / table row). Date fields carry a grain. */
export interface FieldRef { field: string; grain?: DateGrain }
/**
 * A value placed on a visual: a ready-made measure (no agg) or a field + aggregation. `dataset` = the table it
 * comes from when that differs from the visual's own (tables join on their shared dimensions).
 */
export interface ValueRef { field: string; agg?: Agg; dataset?: string }

export interface Layout { x: number; y: number; w: number; h: number }

export interface Visual {
  id: string;
  type: VisualType;
  dataset: string | null; // set by the first field dropped on it
  axis?: FieldRef | null; // category / x-axis / matrix rows
  split?: FieldRef | null; // legend / series split / matrix columns
  dims?: FieldRef[]; // table rows (table only)
  values: ValueRef[];
  title?: string;
  topN?: number; // categories shown before folding the rest into "Other"
  stacked?: boolean; // column / bar / area with a split
  layout: Layout;
}

/** Page filters — applied to every visual on the page that has the matching field. */
export interface PageFilters {
  datePreset?: DatePreset;
  dateFrom?: string; // YYYY-MM-DD (custom range)
  dateTo?: string;
  regions?: string[];
  storeIds?: number[];
  /**
   * Regional Managers, by User.id — never by name. `Store.rmUserIds` is the authoritative link and a
   * store can have several managers, so the filter resolves these ids to stores (engine.ts).
   */
  rmUserIds?: number[];
  valueSegments?: string[];
  lifecycles?: string[];
}
export type DatePreset = "all" | "30d" | "90d" | "thisMonth" | "lastMonth" | "thisFy" | "lastFy" | "custom";

export interface ReportPage { id: string; name: string; filters: PageFilters; visuals: Visual[] }
export interface ReportDoc { version: 1; pages: ReportPage[] }

/** Click-to-filter: a value clicked on one visual, applied to the page's other visuals. */
export interface CrossFilter { dataset: string; field: string; grain?: DateGrain; value: string; common?: string | null; label: string; sourceVisual: string }

/** What a visual query returns. Rows are keyed d0.. (dimensions, as text) and m0.. (measures). */
export interface VisualResult {
  ok: boolean;
  error?: string;
  rows: Record<string, string | number | null>[];
  total?: number; // tables: rows across all pages
  truncated?: boolean; // categories were folded into "Other"
  ignoredFilters?: string[]; // page filters this dataset can't apply (shown as a hint)
}

export const GRID_COLS = 12;
export const ROW_PX = 44;

export const uid = () => Math.random().toString(36).slice(2, 10);

export const emptyDoc = (): ReportDoc => ({ version: 1, pages: [{ id: uid(), name: "Page 1", filters: { datePreset: "all" }, visuals: [] }] });

/** Wells each visual type offers, in the order fields are auto-placed on click. */
export const VISUAL_META: Record<VisualType, { label: string; icon: string; axis?: string; split?: string; dims?: boolean; maxValues: number; defaultSize: { w: number; h: number } }> = {
  kpi: { label: "KPI card", icon: "🔢", maxValues: 1, defaultSize: { w: 3, h: 3 } },
  column: { label: "Column chart", icon: "📊", axis: "Axis", split: "Split by", maxValues: 4, defaultSize: { w: 6, h: 7 } },
  bar: { label: "Bar chart", icon: "📶", axis: "Axis", split: "Split by", maxValues: 4, defaultSize: { w: 6, h: 7 } },
  line: { label: "Line chart", icon: "📈", axis: "Axis", split: "Split by", maxValues: 4, defaultSize: { w: 6, h: 7 } },
  area: { label: "Area chart", icon: "🏔", axis: "Axis", split: "Split by", maxValues: 4, defaultSize: { w: 6, h: 7 } },
  donut: { label: "Donut", icon: "🍩", axis: "Slices", maxValues: 1, defaultSize: { w: 4, h: 7 } },
  treemap: { label: "Treemap", icon: "🟩", axis: "Groups", maxValues: 1, defaultSize: { w: 6, h: 7 } },
  table: { label: "Table", icon: "📋", dims: true, maxValues: 6, defaultSize: { w: 6, h: 8 } },
  matrix: { label: "Matrix", icon: "🔳", axis: "Rows", split: "Columns", maxValues: 1, defaultSize: { w: 8, h: 8 } },
};

export const AGG_LABEL: Record<Agg, string> = { sum: "Sum", avg: "Average", min: "Min", max: "Max", count: "Count", distinct: "Count (distinct)" };
export const GRAIN_LABEL: Record<DateGrain, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year", fy: "Financial year" };
export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  all: "All time", "30d": "Last 30 days", "90d": "Last 90 days", thisMonth: "This month", lastMonth: "Last month", thisFy: "This FY", lastFy: "Last FY", custom: "Custom range",
};
