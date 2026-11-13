/**
 * Builder rules for where a field lands on a visual (click = sensible slot, drop = chosen well), how fields
 * from different tables combine (they line up on shared dimensions — see mapDim), how a placed field is
 * moved or removed, and how fields carry over when a visual changes type. Pure functions, client-safe.
 */
import { DATASET_BY_ID, fieldMeta, valueFormat, mapDim, LINK_FIELDS_LABEL } from "./model";
import { VISUAL_META, type Visual, type VisualType, type ValueRef, type FieldRef } from "./types";

export type Well = "axis" | "split" | "dims" | "values";
type Out = { visual: Visual } | { error: string };

const hasSplit = (t: VisualType) => !!VISUAL_META[t].split;
const hasAxis = (t: VisualType) => !!VISUAL_META[t].axis;

/** The table a value reads from. */
export const valueDs = (v: Visual, x: ValueRef): string | null => x.dataset ?? v.dataset;

/** Every dimension on the visual (axis, split, table rows). */
export const visualDims = (v: Visual): FieldRef[] => (v.type === "table" ? v.dims ?? [] : ([v.axis, v.split].filter(Boolean) as FieldRef[]));

/** The dataset's first ready-made measure (used when a chart has an axis but nothing to measure). */
export function defaultMeasure(ds: string): ValueRef | null {
  const f = DATASET_BY_ID[ds]?.fields.find((x) => x.kind === "measure");
  return f ? { field: f.id } : null;
}

/** Keep a visual's wells consistent with its type (and give charts a measure). */
export function normalize(v: Visual, autoMeasure = true): Visual {
  const meta = VISUAL_META[v.type];
  const out: Visual = { ...v, values: v.values.slice(0, meta.maxValues).map((x) => (x.dataset && x.dataset === v.dataset ? { ...x, dataset: undefined } : x)) };
  if (!hasAxis(v.type)) out.axis = null;
  if (!hasSplit(v.type)) out.split = null;
  if (v.type !== "table") out.dims = undefined;
  if (out.split && out.values.length > 1) out.values = out.values.slice(0, 1);
  // With no dimensions left, a visual whose values all come from another table simply becomes that table's.
  if (!visualDims(out).length && out.values.length) {
    const tables = new Set(out.values.map((x) => valueDs(out, x)));
    if (tables.size === 1) { const t = [...tables][0]; out.dataset = t; out.values = out.values.map((x) => ({ ...x, dataset: undefined })); }
  }
  if (!visualDims(out).length && !out.values.length) out.dataset = null;
  if (autoMeasure && out.dataset && v.type !== "table" && !out.values.length && (out.axis || v.type === "kpi")) {
    const m = defaultMeasure(out.dataset);
    if (m) out.values = [m];
  }
  return out;
}

/** Can every table used by the visual's values be lined up by this dimension (given in the visual's table)? */
function dimFitsValues(v: Visual, dim: FieldRef): string | null {
  for (const x of v.values) {
    const t = valueDs(v, x);
    if (t && v.dataset && t !== v.dataset && !mapDim(v.dataset, dim, t)) {
      return `${DATASET_BY_ID[t]?.label} values can't be split by "${fieldMeta(v.dataset, dim.field)?.label}" — tables only line up on ${LINK_FIELDS_LABEL}.`;
    }
  }
  return null;
}

export function placeField(v: Visual, ds: string, fieldId: string, well?: Well): Out {
  const f = fieldMeta(ds, fieldId);
  if (!f) return { error: "Unknown field." };
  const home = v.dataset ?? ds; // the visual's own table (dimensions live here)
  const next: Visual = { ...v, dataset: home, values: [...v.values], dims: v.dims ? [...v.dims] : v.type === "table" ? [] : undefined };
  const foreign = ds !== home;
  const asValue: ValueRef = {
    ...(f.kind === "measure" ? { field: fieldId } : f.kind === "num" ? { field: fieldId, agg: f.defaultAgg ?? "sum" } : { field: fieldId, agg: "distinct" as const }),
    ...(foreign ? { dataset: ds } : {}),
  };

  const putValue = (): string | null => {
    if (foreign) {
      for (const d of visualDims(next)) {
        if (!mapDim(home, d, ds)) return `${DATASET_BY_ID[ds]?.label} can't be split by "${fieldMeta(home, d.field)?.label}" — tables only line up on ${LINK_FIELDS_LABEL}. Use one of those on the axis, or add a new visual.`;
      }
    }
    const max = VISUAL_META[v.type].maxValues;
    if (v.type !== "table" && next.values.length) {
      const fmt = valueFormat(home, asValue);
      if (next.values.some((x) => valueFormat(home, x) !== fmt)) {
        if (max === 1) { next.values = [asValue]; return null; }
        return "That value uses different units from the one already here — add it to a new visual (or use a Table) so the chart keeps one scale.";
      }
    }
    if (next.split && v.type !== "table" && next.values.length >= 1) { next.values = [asValue]; return null; }
    if (next.values.length >= max) next.values[max - 1] = asValue; else next.values.push(asValue);
    return null;
  };

  let target = well;
  if (!target) {
    if (f.kind !== "dim") target = "values";
    else if (v.type === "kpi") target = "values";
    else if (v.type === "table") target = "dims";
    else if (!next.axis) target = "axis";
    else if (hasSplit(v.type) && !next.split && next.values.length <= 1) target = "split";
    else target = "axis";
  }

  if (target === "values") { const e = putValue(); if (e) return { error: e }; }
  else {
    if (f.kind !== "dim") return { error: "Numbers go in Values — drop a category or date here." };
    // A dimension from another table is translated into the visual's own table (same shared field / main date).
    const dim = mapDim(ds, { field: fieldId, grain: f.date ? "month" : undefined }, home);
    if (!dim) return { error: `"${f.label}" can't be used with ${DATASET_BY_ID[home]?.label} — tables only line up on ${LINK_FIELDS_LABEL}. Add a new visual for it.` };
    if (fieldMeta(home, dim.field)?.date && !dim.grain) dim.grain = "month";
    const clash = dimFitsValues(next, dim);
    if (clash) return { error: clash };
    if (target === "axis") { if (!hasAxis(v.type)) return { error: "This visual has no axis." }; next.axis = dim; }
    if (target === "split") {
      if (!hasSplit(v.type)) return { error: "This visual can't be split." };
      if (next.values.some((x) => valueDs(next, x) !== home)) return { error: "A split works with values from one table only — remove the other table's values first." };
      next.split = dim;
    }
    if (target === "dims") { if (v.type !== "table") return { error: "Only tables take row fields." }; if ((next.dims ?? []).length >= 4) next.dims![3] = dim; else next.dims!.push(dim); }
  }
  return { visual: normalize(next) };
}

/** Take one placed field off a visual (drag-out / move). Never auto-adds a measure back. */
export function removeAt(v: Visual, well: Well, index: number): Visual {
  const next: Visual = { ...v, values: [...v.values], dims: v.dims ? [...v.dims] : v.dims };
  if (well === "axis") next.axis = null;
  else if (well === "split") next.split = null;
  else if (well === "dims") next.dims = (next.dims ?? []).filter((_, i) => i !== index);
  else next.values = next.values.filter((_, i) => i !== index);
  return normalize(next, false);
}

/** The field a placed chip refers to, with the table it belongs to. */
export function chipField(v: Visual, well: Well, index: number): { ds: string; field: string } | null {
  if (!v.dataset) return null;
  if (well === "axis") return v.axis ? { ds: v.dataset, field: v.axis.field } : null;
  if (well === "split") return v.split ? { ds: v.dataset, field: v.split.field } : null;
  if (well === "dims") { const d = v.dims?.[index]; return d ? { ds: v.dataset, field: d.field } : null; }
  const x = v.values[index];
  return x ? { ds: valueDs(v, x) ?? v.dataset, field: x.field } : null;
}

/** Change a visual's type, carrying its fields over where they fit. */
export function changeType(v: Visual, type: VisualType): Visual {
  const dims = visualDims(v);
  const next: Visual = { ...v, type };
  if (type === "table") { next.dims = dims.slice(0, 4); next.axis = null; next.split = null; }
  else {
    next.axis = dims[0] ?? null;
    // A split only makes sense when every value comes from the visual's own table.
    next.split = hasSplit(type) && v.values.every((x) => !x.dataset || x.dataset === v.dataset) ? dims[1] ?? null : null;
  }
  return normalize(next);
}

/** The visual a field creates when dropped on empty canvas (numbers → KPI, dates → line, categories → bar). */
export function typeForField(ds: string, fieldId: string): VisualType {
  const f = fieldMeta(ds, fieldId);
  if (!f || f.kind !== "dim") return "kpi";
  return f.date ? "line" : "bar";
}
