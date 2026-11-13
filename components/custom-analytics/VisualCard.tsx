"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { runReportVisual, exportVisualXlsx } from "@/app/actions/custom-analytics";
import { fieldMeta, valueLabel, valueFormat, DATASET_BY_ID } from "@/lib/custom-analytics/model";
import { dimLabel, fmtValue } from "@/lib/custom-analytics/format";
import { VISUAL_META, type Visual, type PageFilters, type CrossFilter, type VisualResult, type FieldRef } from "@/lib/custom-analytics/types";
import { downloadB64 } from "@/lib/download";
import { BarChart, LineChart, Donut, Treemap, CAT, OTHER_COLOR, rampColor, type Series } from "./charts";

const HEADER_H = 34;

/** Stable colour per series/slice key inside one visual (fixed order, never cycled; Other = grey). */
function useColorMap() {
  const ref = useRef(new Map<string, number>());
  return (keys: string[]) => {
    const m = ref.current;
    const fresh = keys.filter((k) => k !== "Other" && !m.has(k));
    if (fresh.length && m.size + fresh.length > CAT.length) { m.clear(); }
    for (const k of keys) if (k !== "Other" && !m.has(k) && m.size < CAT.length) m.set(k, m.size);
    return keys.map((k) => (k === "Other" ? OTHER_COLOR : CAT[m.get(k) ?? 0]));
  };
}

export function visualTitle(v: Visual): string {
  if (v.title?.trim()) return v.title.trim();
  if (!v.dataset) return VISUAL_META[v.type].label;
  const vals = v.values.map((x) => valueLabel(v.dataset, x)).join(", ");
  const by = (v.type === "table" ? v.dims?.[0] : v.axis) as FieldRef | undefined;
  const byLabel = by ? fieldMeta(v.dataset, by.field)?.label : null;
  return vals ? (byLabel ? `${vals} by ${byLabel}` : vals) : byLabel ?? DATASET_BY_ID[v.dataset]?.label ?? "Visual";
}

export function VisualCard({ visual, filters, cf, onCrossFilter, height, editing, selected, onSelect, onRemove, dragHandle }: {
  visual: Visual; filters: PageFilters; cf: CrossFilter | null; onCrossFilter?: (cf: CrossFilter | null) => void; height: number;
  editing?: boolean; selected?: boolean; onSelect?: () => void; onRemove?: () => void; dragHandle?: React.ReactNode;
}) {
  const [res, setRes] = useState<VisualResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const [menu, setMenu] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const colorsFor = useColorMap();
  const reqId = useRef(0);

  // The visual that started a click-filter isn't filtered by it (it stays whole, like Power BI).
  const effCf = cf && cf.sourceVisual !== visual.id ? cf : null;
  const dataKey = JSON.stringify({ t: visual.type, d: visual.dataset, a: visual.axis, s: visual.split, ds: visual.dims, v: visual.values, n: visual.topN, f: filters, cf: effCf, page, sort });

  useEffect(() => { setPage(0); }, [visual.type, visual.dataset, JSON.stringify(visual.dims), JSON.stringify(visual.values), JSON.stringify(filters), JSON.stringify(effCf)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visual.dataset) { setRes(null); return; }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await runReportVisual(visual, filters, effCf, { page, sortKey: sort?.key, sortDir: sort?.dir }).catch(() => ({ ok: false, error: "Couldn't load this visual.", rows: [] } as VisualResult));
      if (id === reqId.current) { setRes(r); setLoading(false); }
    }, editing ? 300 : 0);
    return () => clearTimeout(t);
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ds = visual.dataset;
  const body = height - HEADER_H - 12;

  const doExport = async () => {
    setMenu(false); setExporting(true);
    const r = await exportVisualXlsx(visual, filters, effCf, visualTitle(visual));
    setExporting(false);
    if (r.ok && r.b64) downloadB64(r.b64, r.filename ?? "visual.xlsx");
    else alert(r.error ?? "Export failed.");
  };

  const pick = (ref: FieldRef | null | undefined, raw: string | number | null | undefined) => {
    if (!onCrossFilter || !ds || !ref || raw == null || raw === "Other" || raw === "__total") return;
    const meta = fieldMeta(ds, ref.field);
    if (!meta) return;
    const value = String(raw);
    if (cf && cf.sourceVisual === visual.id && cf.value === value && cf.field === ref.field) { onCrossFilter(null); return; }
    onCrossFilter({ dataset: ds, field: ref.field, grain: ref.grain, value, common: meta.common ?? null, label: `${meta.label}: ${dimLabel(value, meta.format, ref.grain)}`, sourceVisual: visual.id });
  };

  return (
    <div onMouseDown={onSelect}
      className={`relative flex h-full flex-col rounded-[12px] border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${selected ? "border-[#7DA02E] ring-2 ring-[#7DA02E]/25" : "border-black/[0.06]"}`}>
      <div className="flex items-center gap-1.5 px-3 pt-2" style={{ height: HEADER_H }}>
        {dragHandle}
        <div className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[#1A1C1A]" title={visualTitle(visual)}>{visualTitle(visual)}</div>
        {(loading || exporting) && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[#DBE9B4] border-t-[#7DA02E]" />}
        {res?.ignoredFilters && res.ignoredFilters.length > 0 && (
          <span className="shrink-0 cursor-help text-[11px] text-[#B26A00]" title={`This data doesn't have: ${res.ignoredFilters.join(", ")} — those page filters don't apply here.`}>⚠</span>
        )}
        {ds && (
          <div className="relative shrink-0">
            <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => setMenu((m) => !m)} aria-label="Visual options"
              className="rounded-md px-1.5 text-[15px] leading-none text-[#9E9E9E] hover:bg-[#F5F5F5] hover:text-[#424242]">⋯</button>
            {menu && (
              <div onMouseDown={(e) => e.stopPropagation()} className="absolute right-0 z-30 mt-1 w-[170px] overflow-hidden rounded-[10px] border border-[#E0E0E0] bg-white py-1 text-[12.5px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                {visual.type !== "table" && visual.type !== "kpi" && visual.type !== "matrix" && (
                  <button type="button" onClick={() => { setAsTable((x) => !x); setMenu(false); }} className="block w-full px-3 py-1.5 text-left hover:bg-[#F5F7F5]">{asTable ? "Show as chart" : "Show as table"}</button>
                )}
                <button type="button" onClick={doExport} className="block w-full px-3 py-1.5 text-left hover:bg-[#F5F7F5]">⬇ Export to Excel</button>
                {editing && onRemove && <button type="button" onClick={() => { setMenu(false); onRemove(); }} className="block w-full px-3 py-1.5 text-left text-[#C62828] hover:bg-[#FDECEA]">Remove visual</button>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 px-3 pb-2">
        {!ds ? (
          <Empty text={editing ? "Click or drag fields from the Data panel →" : "Empty visual"} />
        ) : !res ? (
          <Empty text="Loading…" />
        ) : !res.ok ? (
          <Empty text={res.error ?? "No data"} />
        ) : (
          <Body visual={visual} res={res} height={body} asTable={asTable} colorsFor={colorsFor} pick={pick}
            page={page} setPage={setPage} sort={sort} setSort={setSort} />
        )}
      </div>
      {res?.truncated && <div className="pointer-events-none absolute bottom-1 right-3 text-[10px] text-[#BDBDBD]">top {visual.topN ?? ""} + Other</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center px-2 text-center text-[12px] text-[#9E9E9E]">{text}</div>;
}

function Body({ visual: v, res, height, asTable, colorsFor, pick, page, setPage, sort, setSort }: {
  visual: Visual; res: VisualResult; height: number; asTable: boolean; colorsFor: (k: string[]) => string[];
  pick: (ref: FieldRef | null | undefined, raw: string | number | null | undefined) => void;
  page: number; setPage: (p: number) => void; sort: { key: string; dir: "asc" | "desc" } | null; setSort: (s: { key: string; dir: "asc" | "desc" } | null) => void;
}) {
  const ds = v.dataset!;
  const rows = res.rows;
  const fmt0 = valueFormat(ds, v.values[0] ?? { field: "" });

  if (!rows.length) return <Empty text="No data for these filters." />;

  if (v.type === "kpi") {
    const val = rows[0]?.m0 as number | null;
    const big = fmtValue(val, fmt0);
    return (
      <div className="flex h-full flex-col justify-center">
        <div className="truncate font-bold tabular-nums text-[#1A1C1A]" style={{ fontSize: Math.max(20, Math.min(40, height * 0.42)) }} title={big}>{big.length > 12 ? fmtValue(val, fmt0, true) : big}</div>
        <div className="truncate text-[11.5px] text-[#898781]">{valueLabel(ds, v.values[0])}</div>
      </div>
    );
  }

  if (v.type === "table" || asTable) return <TableView v={v} res={res} height={height} pick={pick} page={page} setPage={setPage} sort={sort} setSort={setSort} server={v.type === "table"} />;
  if (v.type === "matrix") return <MatrixView v={v} rows={rows} height={height} pick={pick} />;

  const axisMeta = fieldMeta(ds, v.axis?.field ?? "");
  const axisFmt = axisMeta?.format ?? "text";
  const isDate = !!axisMeta?.date;

  if (v.type === "donut" || v.type === "treemap") {
    const keys = rows.map((r) => String(r.d0 ?? ""));
    const cats = keys.map((k) => dimLabel(k, axisFmt, v.axis?.grain));
    const vals = rows.map((r) => Number(r.m0 ?? 0));
    const colors = v.type === "donut" ? colorsFor(keys) : keys.map((k) => (k === "Other" ? OTHER_COLOR : CAT[0]));
    const onPick = (i: number) => pick(v.axis, keys[i]);
    return v.type === "donut"
      ? <Donut cats={cats} values={vals} colors={colors} format={fmt0} height={height} onPick={onPick} />
      : <Treemap cats={cats} values={vals} colors={colors} format={fmt0} height={height} onPick={onPick} />;
  }

  // Column / bar / line / area.
  let keys: string[];
  let series: Series[];
  if (v.split) {
    const catTotal = new Map<string, number>(), serTotal = new Map<string, number>();
    for (const r of rows) {
      const c = String(r.d0 ?? ""), s = String(r.d1 ?? ""), m = Number(r.m0 ?? 0);
      catTotal.set(c, (catTotal.get(c) ?? 0) + m); serTotal.set(s, (serTotal.get(s) ?? 0) + m);
    }
    keys = [...catTotal.keys()];
    if (isDate) keys.sort(); else keys.sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : (catTotal.get(b) ?? 0) - (catTotal.get(a) ?? 0)));
    const sKeys = [...serTotal.keys()].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : (serTotal.get(b) ?? 0) - (serTotal.get(a) ?? 0)));
    const splitMeta = fieldMeta(ds, v.split.field);
    const colors = colorsFor(sKeys);
    const idx = new Map(keys.map((k, i) => [k, i]));
    series = sKeys.map((sk, si) => {
      const vals: (number | null)[] = keys.map(() => null);
      for (const r of rows) if (String(r.d1 ?? "") === sk) vals[idx.get(String(r.d0 ?? ""))!] = Number(r.m0 ?? 0);
      return { key: sk, label: dimLabel(sk, splitMeta?.format ?? "text", v.split?.grain), color: colors[si], values: vals };
    });
  } else {
    keys = rows.map((r) => String(r.d0 ?? ""));
    series = v.values.map((x, i) => ({ key: `m${i}`, label: valueLabel(ds, x), color: v.values.length === 1 ? CAT[0] : CAT[i], values: rows.map((r) => (r[`m${i}`] as number | null) ?? null) }));
  }
  const cats = keys.map((k) => dimLabel(k, axisFmt, v.axis?.grain));
  const onPick = (i: number) => pick(v.axis, keys[i]);
  if (v.type === "line" || v.type === "area") return <LineChart cats={cats} series={series} format={fmt0} stacked={v.stacked} height={height} onPick={onPick} area={v.type === "area"} />;
  return <BarChart cats={cats} series={series} format={fmt0} stacked={v.stacked} height={height} onPick={onPick} horizontal={v.type === "bar"} />;
}

function TableView({ v, res, height, pick, page, setPage, sort, setSort, server }: {
  v: Visual; res: VisualResult; height: number; pick: (ref: FieldRef | null | undefined, raw: string | number | null | undefined) => void;
  page: number; setPage: (p: number) => void; sort: { key: string; dir: "asc" | "desc" } | null; setSort: (s: { key: string; dir: "asc" | "desc" } | null) => void; server: boolean;
}) {
  const ds = v.dataset!;
  const dims: FieldRef[] = v.type === "table" ? v.dims ?? [] : ([v.axis, v.split].filter(Boolean) as FieldRef[]);
  const cols = [
    ...dims.map((d, i) => ({ key: `d${i}`, label: fieldMeta(ds, d.field)?.label ?? d.field, num: false, ref: d, fmt: fieldMeta(ds, d.field)?.format ?? "text" })),
    ...v.values.slice(0, v.type === "table" ? 6 : v.split ? 1 : 4).map((x, i) => ({ key: `m${i}`, label: valueLabel(ds, x), num: true, ref: null as FieldRef | null, fmt: valueFormat(ds, x) })),
  ];
  const total = res.total ?? res.rows.length;
  const pages = server ? Math.max(1, Math.ceil(total / 50)) : 1;
  const clickSort = (key: string) => {
    if (!server) return;
    setSort(sort?.key === key ? (sort.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" });
  };
  return (
    <div className="flex h-full flex-col" style={{ maxHeight: height }}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-[#EEE]">
              {cols.map((c) => (
                <th key={c.key} onClick={() => clickSort(c.key)} className={`whitespace-nowrap px-2 py-1.5 font-semibold text-[#52514e] ${c.num ? "text-right" : "text-left"} ${server ? "cursor-pointer hover:text-[#1A1C1A]" : ""}`}>
                  {c.label}{sort?.key === c.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.rows.map((r, ri) => (
              <tr key={ri} className="border-b border-[#F5F5F5] hover:bg-[#FAFAF8]">
                {cols.map((c) => c.num ? (
                  <td key={c.key} className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-[#1A1C1A]">{fmtValue(r[c.key] as number | null, c.fmt)}</td>
                ) : (
                  <td key={c.key} onClick={() => pick(c.ref, r[c.key])} className="max-w-[260px] cursor-pointer truncate px-2 py-1 text-[#1A1C1A] hover:underline" title={dimLabel(r[c.key], c.fmt, c.ref?.grain)}>
                    {dimLabel(r[c.key], c.fmt, c.ref?.grain)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {server && total > 50 && (
        <div className="flex items-center justify-end gap-2 pt-1 text-[11px] text-[#757575]">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded px-1.5 disabled:opacity-30 hover:bg-[#F5F5F5]">‹</button>
          <span>{page * 50 + 1}–{Math.min(total, (page + 1) * 50)} of {total.toLocaleString("en-IN")}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded px-1.5 disabled:opacity-30 hover:bg-[#F5F5F5]">›</button>
        </div>
      )}
    </div>
  );
}

function MatrixView({ v, rows, height, pick }: { v: Visual; rows: VisualResult["rows"]; height: number; pick: (ref: FieldRef | null | undefined, raw: string | number | null | undefined) => void }) {
  const ds = v.dataset!;
  const rMeta = fieldMeta(ds, v.axis!.field), cMeta = fieldMeta(ds, v.split!.field);
  const fmt = valueFormat(ds, v.values[0]);
  const { rKeys, cKeys, cell, rowTot, colTot, grand, max } = useMemo(() => {
    const cell = new Map<string, number | null>(), rowTot = new Map<string, number | null>(), colTot = new Map<string, number | null>();
    let grand: number | null = null, max = 0;
    for (const r of rows) {
      const a = String(r.d0), b = String(r.d1), m = r.m0 as number | null;
      if (a === "__total" && b === "__total") grand = m;
      else if (a === "__total") colTot.set(b, m);
      else if (b === "__total") rowTot.set(a, m);
      else { cell.set(`${a}\u0000${b}`, m); max = Math.max(max, m ?? 0); }
    }
    const byTot = (map: Map<string, number | null>, date: boolean) => [...map.keys()].sort((x, y) => (x === "Other" ? 1 : y === "Other" ? -1 : date ? x.localeCompare(y) : (map.get(y) ?? 0) - (map.get(x) ?? 0)));
    return { rKeys: byTot(rowTot, !!rMeta?.date), cKeys: byTot(colTot, !!cMeta?.date), cell, rowTot, colTot, grand, max };
  }, [rows, rMeta, cMeta]);
  return (
    <div className="h-full overflow-auto" style={{ maxHeight: height }}>
      <table className="text-[11.5px]">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-[#EEE]">
            <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold text-[#52514e]">{rMeta?.label} \ {cMeta?.label}</th>
            {cKeys.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-[#52514e]">{dimLabel(c, cMeta?.format ?? "text", v.split?.grain)}</th>)}
            <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-[#1A1C1A]">Total</th>
          </tr>
        </thead>
        <tbody>
          {rKeys.map((r) => (
            <tr key={r} className="border-b border-[#F5F5F5]">
              <td onClick={() => pick(v.axis, r)} className="sticky left-0 max-w-[200px] cursor-pointer truncate bg-white px-2 py-1 font-medium text-[#1A1C1A] hover:underline">{dimLabel(r, rMeta?.format ?? "text", v.axis?.grain)}</td>
              {cKeys.map((c) => {
                const val = cell.get(`${r}\u0000${c}`) ?? null;
                const sh = rampColor(val ?? 0, max);
                return <td key={c} className="whitespace-nowrap px-2 py-1 text-right tabular-nums" style={{ background: sh.bg, color: sh.fg }}>{val == null ? "" : fmtValue(val, fmt, true)}</td>;
              })}
              <td className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">{fmtValue(rowTot.get(r) ?? null, fmt, true)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[#E0E0E0]">
            <td className="sticky left-0 bg-white px-2 py-1 font-bold">Total</td>
            {cKeys.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">{fmtValue(colTot.get(c) ?? null, fmt, true)}</td>)}
            <td className="whitespace-nowrap px-2 py-1 text-right font-bold tabular-nums">{fmtValue(grand, fmt, true)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
