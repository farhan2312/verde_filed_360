"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { ChainNext } from "@/components/ChainNext";
import { InfoTip } from "@/components/InfoTip";
import { VALUE_SEGMENTS, LIFECYCLE_SEGMENTS, VALUE_TITLE, LIFECYCLE_TITLE, segMeta, segDef } from "@/lib/campaign-segments";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { VisitDateFilter } from "./VisitDateFilter";
import { LeadConversionsCard } from "./LeadConversionsCard";
import { PerformanceBoard } from "./PerformanceBoard";
import type { PerfKind } from "@/app/actions/analytics-performance";
import {
  getWorkbench, getWorkbenchCustomers, saveWorkbenchSegment, getCropTrend, getVisitAnalytics, getSalesRawData,
  type Lens, type WbFilters, type WbData, type WbFacets, type WbBar, type WbCustomer, type CropTrendPoint,
  type VisitAnalytics, type VisitMonth, type VisitAdoption, type VisitStoreRow, type MergedMatrix, type TreeCell, type SegDim,
  type RawKpis, type RawLine,
} from "@/app/actions/analytics-segments";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
type ExportScope = "sales" | "visits" | "both";
const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const money = (x: number) => (x >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : x >= 1e5 ? `₹${(x / 1e5).toFixed(1)} L` : `₹${n(x)}`);

// Indian financial year: Apr Y → Mar Y+1, identified by its start year Y (Jan–Mar fall in the previous FY).
const fyStartOfYm = (ym: string) => { const [y, m] = ym.split("-").map(Number); return m >= 4 ? y : y - 1; };
const fyLabel = (y: number) => `FY ${y}–${String((y + 1) % 100).padStart(2, "0")}`; // FY 2024–25

export function AnalyticsWorkbench({ initial, facets, canChain = false }: { initial: WbData; facets: WbFacets; canChain?: boolean }) {
  const [filters, setFilters] = useState<WbFilters>({ lens: "sales" });
  const [perfTab, setPerfTab] = useState<PerfKind | null>(null); // null = segmentation (Sales/Visits); else a performance board
  const [data, setData] = useState(initial);
  const [visitData, setVisitData] = useState<VisitAnalytics | null>(null);
  const [loading, start] = useTransition();
  const [cell, setCell] = useState<{ storeId: number | null; storeName: string; dim: SegDim | "cross"; seg: string } | null>(null);
  const [rows, setRows] = useState<WbCustomer[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportBytes, setExportBytes] = useState(0);
  const [exportScope, setExportScope] = useState<ExportScope>("sales"); // Sales / Visits / Both — drives the export
  const [treeBy, setTreeBy] = useState<"value" | "lifecycle">("value"); // shared primary dimension for the KPI tree AND the detailed matrix
  const flipTree = () => setTreeBy((b) => (b === "value" ? "lifecycle" : "value"));
  const years = filters.fyStarts ?? []; // selected FY start years — drives the whole sales analysis
  const toggleStr = (key: "zones" | "villages" | "crops" | "pests" | "problems" | "valueSegments" | "lifecycleSegments", v: string) => {
    const cur = (filters[key] as string[] | undefined) ?? [];
    apply({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<WbFilters>);
  };
  const toggleInt = (key: "storeIds" | "spendTiers" | "fyStarts" | "storeTags", v: number) => {
    const cur = (filters[key] as number[] | undefined) ?? [];
    apply({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((a, b) => a - b) } as Partial<WbFilters>);
  };
  // Close any open <details> filter popover when clicking outside it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      document.querySelectorAll("details[open]").forEach((d) => { if (!d.contains(e.target as Node)) (d as HTMLDetailsElement).open = false; });
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // One streaming Excel export — sales sheets, visit sheet, or both (one file) — any size, live progress.
  const exportExcel = async (type: ExportScope = "sales") => {
    if (exporting) return;
    setExporting(true); setExportBytes(0);
    try {
      const f = {
        storeIds: filters.storeIds, storeTags: filters.storeTags, zones: filters.zones, villages: filters.villages, crops: filters.crops, pests: filters.pests,
        valueSegments: filters.valueSegments, lifecycleSegments: filters.lifecycleSegments,
        spendTiers: filters.spendTiers, fyStarts: filters.fyStarts, problems: filters.problems,
        visitFrom: filters.visitFrom, visitTo: filters.visitTo,
      };
      const url = `/api/analytics/export?f=${encodeURIComponent(btoa(JSON.stringify(f)))}&type=${type}`;
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error((await res.text().catch(() => "")) || "Export failed.");
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { chunks.push(value); received += value.length; setExportBytes(received); }
      }
      const blob = new Blob(chunks as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get("X-Export-Filename") || "analytics-export.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };
  const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

  const apply = (patch: Partial<WbFilters>) => {
    const f = { ...filters, ...patch };
    setFilters(f);
    start(async () => {
      const [wb, va] = await Promise.all([
        getWorkbench(f),
        f.lens === "visit" ? getVisitAnalytics(f) : Promise.resolve(null),
      ]);
      setData(wb);
      setVisitData(va);
    });
  };
  const setLens = (lens: Lens) => {
    setExportScope((s) => (s === "both" ? s : lens === "visit" ? "visits" : "sales")); // follow the lens unless the user chose Both
    apply({ lens, crops: undefined, valueSegments: undefined, lifecycleSegments: undefined, spendTiers: undefined, problems: undefined });
  };
  const clearAll = () => apply({ storeIds: undefined, storeTags: undefined, zones: undefined, villages: undefined, crops: undefined, pests: undefined, valueSegments: undefined, lifecycleSegments: undefined, spendTiers: undefined, problems: undefined, fyStarts: undefined, visitFrom: undefined, visitTo: undefined });

  const openCell = (storeId: number | null, storeName: string, dim: SegDim | "cross", seg: string) => {
    setCell({ storeId, storeName, dim, seg }); setRows(null);
    getWorkbenchCustomers(filters, storeId, dim, seg).then(setRows);
  };

  const cropOpts = filters.lens === "sales" ? facets.salesCrops : facets.visitCrops;
  const activeFilterCount = [
    filters.storeIds, filters.storeTags, filters.zones, filters.villages, filters.crops, filters.pests,
    filters.valueSegments, filters.lifecycleSegments, filters.spendTiers, filters.problems, filters.fyStarts,
  ].filter((a) => a && a.length).length;
  const k = data.kpis;
  const vk = visitData?.kpis;
  const vd = (x: number | undefined) => (visitData ? n(x ?? 0) : "…");
  const VISIT_KPIS: [string, string][] = [["Visits", vd(vk?.visits)], ["Farmers visited", vd(vk?.farmers)], ["Leads · no sales yet", vd(vk?.leads)], ["Villages", vd(vk?.villages)], ["Officers", vd(vk?.officers)], ["Field GPS", visitData ? `${vk?.fieldPct ?? 0}%` : "…"], ["Photos", vd(vk?.photos)]];

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {/* Tab strip: Sales / Visits (segmentation) + Stores / RMs / Agri Officers (performance) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
          {(["sales", "visit"] as Lens[]).map((l) => {
            const active = !perfTab && filters.lens === l;
            return (
              <button key={l} type="button" onClick={() => { setPerfTab(null); setLens(l); }}
                className="rounded-[8px] px-5 py-2 text-[12.5px] font-bold transition-colors"
                style={{ background: active ? "#fff" : "transparent", color: active ? "#678722" : "#9E9E9E", boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                {l === "sales" ? "Sales" : "Visits"}
              </button>
            );
          })}
          <span className="mx-1 my-1 w-px bg-[#E0E0E0]" />
          {([["stores", "Stores"], ["rms", "RMs"], ["officers", "Agri Officers"]] as [PerfKind, string][]).map(([kind, label]) => {
            const active = perfTab === kind;
            return (
              <button key={kind} type="button" onClick={() => setPerfTab(kind)}
                className="rounded-[8px] px-5 py-2 text-[12.5px] font-bold transition-colors"
                style={{ background: active ? "#fff" : "transparent", color: active ? "#1565C0" : "#9E9E9E", boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                {label}
              </button>
            );
          })}
        </div>
        {!perfTab && (
        <div className="flex flex-wrap items-center gap-2">
          {loading && <span className="text-[12px] text-[#9E9E9E]">Updating…</span>}
          {/* Unified export: choose Sales / Visits / Both → one Excel (Both = separate sheets, filters respected). */}
          {exporting && (
            <span className="flex items-center gap-2 rounded-full bg-[#E3F2FD] px-2.5 py-1 text-[11px] font-semibold text-[#1565C0]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#90CAF9] border-t-[#1565C0]" />
              Preparing Excel… {fmtBytes(exportBytes)}
            </span>
          )}
          <div className="inline-flex overflow-hidden rounded-[10px] border border-[#678722]">
            <select value={exportScope} onChange={(e) => setExportScope(e.target.value as ExportScope)} disabled={exporting}
              aria-label="What to export"
              className="cursor-pointer bg-[#F3F8E6] px-2.5 py-2 text-[12.5px] font-semibold text-[#678722] outline-none disabled:opacity-50">
              <option value="sales">Sales data</option>
              <option value="visits">Visit data</option>
              <option value="both">Both (sales + visits)</option>
            </select>
            <button type="button" onClick={() => exportExcel(exportScope)} disabled={exporting}
              className="border-l border-[#678722] bg-[#678722] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#516A1B] disabled:opacity-50"
              title="Export the current filters to Excel (streamed, any size)">
              {exporting ? "Exporting…" : "⬇ Export"}</button>
          </div>
          <button type="button" onClick={() => setSaving(true)} disabled={k.farmers === 0}
            className="rounded-[10px] bg-[#678722] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">＋ Save as cluster</button>
        </div>
        )}
      </div>

      {perfTab ? (
        <PerformanceBoard kind={perfTab} storeTags={facets.storeTags} />
      ) : (
      <>
      {/* Filter bar — every filter is a uniform-width multi-select (alphabetical options). */}
      <div className={`${CARD} mb-3 flex flex-wrap items-center gap-2 p-3`}>
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#9E9E9E]">{filters.lens === "sales" ? "Sales filters" : "Visit filters"}:</span>
        <MultiSel ph="All stores" options={facets.stores.map((s) => [String(s.id), s.name])}
          selected={(filters.storeIds ?? []).map(String)} onToggle={(v) => toggleInt("storeIds", Number(v))} onClear={() => apply({ storeIds: undefined })} />
        {facets.storeTags.length > 0 && (
          <MultiSel ph="All store tags" accent="#00838F" options={facets.storeTags.map((t) => [String(t.id), t.name])}
            selected={(filters.storeTags ?? []).map(String)} onToggle={(v) => toggleInt("storeTags", Number(v))} onClear={() => apply({ storeTags: undefined })} />
        )}
        <MultiSel ph="All districts" options={facets.zones.map((z) => [z, z])}
          selected={filters.zones ?? []} onToggle={(v) => toggleStr("zones", v)} onClear={() => apply({ zones: undefined })} />
        <MultiSel ph="All villages" options={facets.villages.map((v) => [v.village, `${v.village} (${n(v.count)})`])}
          selected={filters.villages ?? []} onToggle={(v) => toggleStr("villages", v)} onClear={() => apply({ villages: undefined })} />
        <MultiSel ph="All crops" options={cropOpts.map((c) => [c.crop, `${cropLabel(c.crop)} (${n(c.count)})`])}
          selected={filters.crops ?? []} onToggle={(v) => toggleStr("crops", v)} onClear={() => apply({ crops: undefined })} />
        <MultiSel ph="All pests" options={facets.pests.map((p) => [p.pest, `${tagLabel(p.pest)} (${n(p.count)})`])}
          selected={filters.pests ?? []} onToggle={(v) => toggleStr("pests", v)} onClear={() => apply({ pests: undefined })} />
        {filters.lens === "sales" && (
          <>
            <MultiSel ph={`All ${VALUE_TITLE.toLowerCase()}s`} options={VALUE_SEGMENTS.map((s) => [s, segMeta(s).label])} titleOf={segDef}
              selected={filters.valueSegments ?? []} onToggle={(v) => toggleStr("valueSegments", v)} onClear={() => apply({ valueSegments: undefined })} />
            <MultiSel ph={`All ${LIFECYCLE_TITLE.toLowerCase()}`} options={LIFECYCLE_SEGMENTS.map((s) => [s, segMeta(s).label])} titleOf={segDef}
              selected={filters.lifecycleSegments ?? []} onToggle={(v) => toggleStr("lifecycleSegments", v)} onClear={() => apply({ lifecycleSegments: undefined })} />
            <MultiSel ph="Any spend" options={facets.spendTiers.map((t, i) => [String(i), t])}
              selected={(filters.spendTiers ?? []).map(String)} onToggle={(v) => toggleInt("spendTiers", Number(v))} onClear={() => apply({ spendTiers: undefined })} />
            {facets.years.length > 0 && (
              <MultiSel ph="All FYs" accent="#1565C0" options={facets.years.map((y) => [String(y), fyLabel(y)])}
                selected={years.map(String)} onToggle={(v) => toggleInt("fyStarts", Number(v))} onClear={() => apply({ fyStarts: undefined })} />
            )}
          </>
        )}
        {filters.lens === "visit" && (
          <MultiSel ph="Any problem" options={facets.problems.map((p) => [p.problem, `${p.problem} (${n(p.count)})`])}
            selected={filters.problems ?? []} onToggle={(v) => toggleStr("problems", v)} onClear={() => apply({ problems: undefined })} />
        )}
        {activeFilterCount > 0 && <button type="button" onClick={clearAll} className="text-[12px] font-semibold text-[#C62828] hover:underline">Clear ({activeFilterCount})</button>}
      </div>

      {filters.lens === "visit" && (
        <VisitDateFilter minDate={facets.visitMinDate} from={filters.visitFrom} to={filters.visitTo}
          onChange={(from, to) => apply({ visitFrom: from, visitTo: to })} />
      )}

      {/* KPIs — sales: Total farmers + Value×Lifecycle cross-tab tree (flippable). Visit: the field metrics. */}
      {filters.lens === "sales" ? (
        <div className="mb-3 grid grid-cols-1 gap-[14px] lg:grid-cols-[220px_1fr]">
          <div className={`${CARD} flex flex-col justify-center p-4`}>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.3px] text-[#9E9E9E]">Total farmers</div>
            <div className="mt-1 text-[28px] font-bold text-[#1A1C1A]">{n(k.farmers)}</div>
            <div className="mt-0.5 text-[11.5px] text-[#9E9E9E]">FY spend · {money(k.spend)}</div>
          </div>
          <SegTree tree={data.tree} by={treeBy} onFlip={flipTree} />
        </div>
      ) : (
        <div className="mb-3 grid grid-cols-2 gap-[12px] sm:grid-cols-3 lg:grid-cols-6">
          {VISIT_KPIS.map(([label, val]) => {
            const isLeads = label.startsWith("Leads");
            return (
              <div key={label} className={`${CARD} p-3.5`} style={isLeads ? { borderLeft: "4px solid #546E7A", background: "#F7F9FA" } : undefined}
                title={isLeads ? "Registered farmers with no sales record yet (value tier: No Spend)" : undefined}>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.3px]" style={{ color: isLeads ? "#546E7A" : "#9E9E9E" }}>{label}</div>
                <div className="mt-1 text-[19px] font-bold" style={{ color: isLeads ? "#37474F" : "#1A1C1A" }}>{val}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sales board — trend, charts, matrix. The Visit lens gets its own board built purely from visit data. */}
      {filters.lens === "sales" ? (
      <div className="flex flex-col gap-[14px]">
        <LeadConversionsCard />
        <CropTrendCard crops={filters.crops ?? []} years={years} />

        <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2">
          <DonutCard title={`${VALUE_TITLE} share`} slices={data.valueDist} />
          <DonutCard title={`${LIFECYCLE_TITLE} share`} slices={data.lifecycleDist} />
          <HistogramCard title="Spend tiers (FY) — farmer histogram" bars={data.extra} />
          <BarCard title={data.secondaryTitle} bars={data.secondary} fmt={money} accent="#6A1B9A" />
        </div>
        <BarCard title="Sales-crop breakdown" bars={data.cropBreakdown.map((b) => ({ ...b, label: cropLabel(b.label) }))} fmt={n} accent="#EDA942" />

        <MergedMatrixCard matrix={data.matrix} valueCols={data.valueCols} lifecycleCols={data.lifecycleCols} onCell={openCell} by={treeBy} onFlip={flipTree} filters={filters} />
      </div>
      ) : (
        <div className="flex flex-col gap-[14px]">
          <VisitBoard va={visitData} />
        </div>
      )}

      {/* Drill modal */}
      <Modal open={!!cell} onClose={() => setCell(null)} className="max-w-[720px]">
        {cell && (
          <>
            <ModalHeader eyebrow={`${cell.storeName} · ${segCellMeta(cell.dim, cell.seg).label}`} eyebrowColor={segCellMeta(cell.dim, cell.seg).color}
              title="Farmer list" subtitle="Matches the current filters" onClose={() => setCell(null)} />
            <div className="max-h-[64vh] overflow-y-auto px-5 py-4">
              {rows == null ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">Loading…</div>
                : rows.length === 0 ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">No farmers.</div>
                : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-[12.5px]">
                    <thead><tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]"><th className="py-2">Farmer</th><th>Crops</th><th className="text-right">P12M spend</th></tr></thead>
                    <tbody>{rows.map((fr) => (
                      <tr key={fr.id} className="border-b border-[#F5F5F5]">
                        <td className="py-2"><div className="font-semibold text-[#1A1C1A]">{fr.name}</div><div className="text-[11px] text-[#9E9E9E]">{fr.village ?? "—"} · {fr.mobile ?? "—"}</div></td>
                        <td className="py-2"><div className="flex flex-wrap gap-1">
                          {fr.salesCrops.map((c) => <span key={"s" + c} className="rounded-full bg-[#F3F8E6] px-1.5 py-0.5 text-[10px] font-semibold text-[#678722]">{cropLabel(c)}</span>)}
                          {fr.visitCrops.map((c) => <span key={"v" + c} className="rounded-full bg-[#E3F2FD] px-1.5 py-0.5 text-[10px] font-semibold text-[#1565C0]">{cropLabel(c)}</span>)}
                          {fr.salesCrops.length === 0 && fr.visitCrops.length === 0 && <span className="text-[#DDD]">—</span>}
                        </div></td>
                        <td className="text-right font-semibold text-[#1A1C1A]">{fr.spend}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {rows.length >= 400 && <div className="mt-2 text-[11px] text-[#9E9E9E]">Showing first 400 by spend.</div>}
                  </div>
                )}
            </div>
          </>
        )}
      </Modal>

      {saving && <SaveModal filters={filters} kpi={k.farmers} canChain={canChain} onClose={() => setSaving(false)} />}
      </>
      )}
    </div>
  );
}

/**
 * Uniform multi-select checkbox dropdown used for EVERY analytics filter — same fixed width so
 * the bar reads cleanly. Native <details> popover (closed on outside click by the parent listener).
 * `ph` doubles as the "all" placeholder and the reset button label. Options are pre-sorted server-side.
 */
function MultiSel({ ph, options, selected, onToggle, onClear, accent = "#678722", titleOf }: {
  ph: string; options: [string, string][]; selected: string[]; onToggle: (v: string) => void; onClear: () => void; accent?: string; titleOf?: (v: string) => string;
}) {
  const [q, setQ] = useState("");
  const text = selected.length === 0 ? ph : selected.length === 1 ? (options.find((o) => o[0] === selected[0])?.[1] ?? selected[0]) : `${selected.length} selected`;
  const showSearch = options.length > 5; // search box only when the list is long
  const shown = showSearch && q.trim() ? options.filter(([, l]) => l.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <details className="group relative">
      <summary className="flex w-[150px] cursor-pointer list-none items-center justify-between gap-1.5 rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-2 text-[12.5px] text-[#424242]">
        <span className={`truncate ${selected.length ? "font-semibold" : ""}`} style={selected.length ? { color: accent } : undefined}>{text}</span>
        <span className="shrink-0 text-[10px] text-[#9E9E9E] transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-[300px] w-[220px] overflow-hidden rounded-lg border border-[#E0E0E0] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
        {showSearch && (
          <div className="border-b border-[#F0F0F0] p-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              className="w-full rounded border border-[#E0E0E0] px-2 py-1 text-[12px] outline-none focus:border-[#678722]" />
          </div>
        )}
        <div className="max-h-[248px] overflow-y-auto p-1">
          <button type="button" onClick={onClear}
            className={`w-full rounded px-2 py-1.5 text-left text-[12.5px] font-semibold hover:bg-[#F5F7F5] ${selected.length === 0 ? "" : "text-[#616161]"}`}
            style={selected.length === 0 ? { color: accent } : undefined}>{ph}</button>
          {shown.length === 0 ? <div className="px-2 py-1.5 text-[12px] text-[#9E9E9E]">No matches</div> : shown.map(([v, l]) => (
            <label key={v} title={titleOf ? titleOf(v) : l} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12.5px] text-[#424242] hover:bg-[#F5F7F5]">
              <input type="checkbox" checked={selected.includes(v)} onChange={() => onToggle(v)} style={{ accentColor: accent }} />
              <span className="truncate">{l}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

/** KPI cross-tab tree — 3 value groups each split by lifecycle (or flipped). */
function SegTree({ tree, by, onFlip }: { tree: TreeCell[]; by: "value" | "lifecycle"; onFlip: () => void }) {
  const primaries = by === "value" ? [...VALUE_SEGMENTS] : [...LIFECYCLE_SEGMENTS];
  const secondaries = by === "value" ? [...LIFECYCLE_SEGMENTS] : [...VALUE_SEGMENTS];
  const cellOf = (p: string, s: string) => {
    const c = tree.find((t) => (by === "value" ? t.value === p && t.lifecycle === s : t.lifecycle === p && t.value === s));
    return c?.count ?? 0;
  };
  return (
    <div className={`${CARD} p-3`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] font-bold text-[#1A1C1A]">{by === "value" ? `${VALUE_TITLE} → ${LIFECYCLE_TITLE}` : `${LIFECYCLE_TITLE} → ${VALUE_TITLE}`}</div>
        <button type="button" onClick={onFlip} className="rounded-full border border-[#E0E0E0] px-3 py-1 text-[11px] font-semibold text-[#616161] hover:bg-[#F5F7F5]">⇄ Flip</button>
      </div>
      <div className={`grid grid-cols-1 gap-2 ${primaries.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        {primaries.map((p) => {
          const total = secondaries.reduce((a, s) => a + cellOf(p, s), 0);
          return (
            <div key={p} className="rounded-[10px] border border-[#EEE] p-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-bold" style={{ color: segMeta(p).color }}><InfoTip term={p}>{segMeta(p).label}</InfoTip></span>
                <span className="text-[15px] font-bold text-[#1A1C1A]">{n(total)}</span>
              </div>
              <div className="mt-1.5 flex flex-col gap-1">
                {secondaries.map((s) => (
                  <div key={s} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: segMeta(s).color }} /><InfoTip term={s}>{segMeta(s).label}</InfoTip></span>
                    <span className="font-semibold text-[#424242]">{n(cellOf(p, s))}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Label + colour for a drilled cell — a marginal seg, or a "cross" cell whose seg is "VALUE|LIFECYCLE". */
function segCellMeta(dim: SegDim | "cross", seg: string): { label: string; color: string } {
  if (dim === "cross") { const [v, l] = seg.split("|"); return { label: `${segMeta(v).label} · ${segMeta(l).label}`, color: segMeta(v).color }; }
  return { label: segMeta(seg).label, color: segMeta(seg).color };
}
const SEG_SHORT: Record<string, string> = { NEW: "New", RECENT: "Recent", AT_RISK: "At Risk", LAPSED: "Lapsed", HNI: "HNI", POTENTIAL_HNI: "Potential", REGULAR: "Regular" };

/** The merged Store × (Value | Lifecycle) table. Summary = 6 marginal columns; Detailed = the full 3×3 (9 combos) per store. */
const MERGED_GRID = "grid grid-cols-[1.4fr_repeat(3,0.85fr)_0.9fr_repeat(4,0.85fr)_0.9fr]";
function MergedMatrixCard({ matrix, valueCols, lifecycleCols, onCell, by, onFlip, filters, right }: {
  matrix: MergedMatrix; valueCols: string[]; lifecycleCols: string[];
  onCell: (storeId: number | null, storeName: string, dim: SegDim | "cross", seg: string) => void;
  by: "value" | "lifecycle"; onFlip: () => void; filters: WbFilters; right?: ReactNode;
}) {
  const [view, setView] = useState<"summary" | "detailed" | "raw">("detailed");
  const cellBtn = (storeId: number | null, storeName: string, dim: SegDim, seg: string, c: number) =>
    c > 0 ? <button type="button" onClick={() => onCell(storeId, storeName, dim, seg)} className="font-semibold hover:underline" style={{ color: segMeta(seg).color }}>{n(c)}</button> : <span className="text-[#DDD]">·</span>;
  const TABS = { detailed: "Detailed", summary: "Summary", raw: "Sales raw data" } as const;
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F0] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[13px] font-bold text-[#1A1C1A]">{view === "raw" ? "Sales — raw line items" : `Store × ${VALUE_TITLE} + ${LIFECYCLE_TITLE}`}</div>
          <div className="inline-flex rounded-[8px] border border-[#E0E0E0] bg-[#F5F7F5] p-0.5">
            {(["detailed", "summary", "raw"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className="rounded-[6px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
                style={{ background: view === v ? "#fff" : "transparent", color: view === v ? "#678722" : "#9E9E9E", boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}>
                {TABS[v]}
              </button>
            ))}
          </div>
          {view === "detailed" && (
            <button type="button" onClick={onFlip} className="rounded-full border border-[#E0E0E0] px-3 py-1 text-[11px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">⇄ Flip</button>
          )}
        </div>
        {right}
      </div>
      {view === "raw" ? (
        <SalesRawData filters={filters} />
      ) : matrix.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#9E9E9E]">No farmers match these filters.</div>
      ) : view === "detailed" ? (
        <DetailedMatrix matrix={matrix} valueCols={valueCols} lifecycleCols={lifecycleCols} onCell={onCell} by={by} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={`${MERGED_GRID} border-b border-[#F0F0F0] bg-[#FAFAFA] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]`}>
              <div>Store</div>
              {valueCols.map((s) => <div key={s} className="text-right" style={{ color: segMeta(s).color }}><InfoTip term={s}>{segMeta(s).label}</InfoTip></div>)}
              <div className="text-right text-[#1A1C1A]">Segment Total</div>
              {lifecycleCols.map((s) => <div key={s} className="text-right" style={{ color: segMeta(s).color }}><InfoTip term={s}>{segMeta(s).label}</InfoTip></div>)}
              <div className="text-right text-[#1A1C1A]">Any Spend Total</div>
            </div>
            <div className={`${MERGED_GRID} border-b border-[#EEE] bg-[#F5FBF5] px-4 py-2.5 text-[12px] font-bold text-[#1A1C1A]`}>
              <div>All stores</div>
              {valueCols.map((s) => <div key={s} className="text-right">{n(matrix.valueTotals[s] ?? 0)}</div>)}
              <div className="text-right">{n(matrix.grandTotal)}</div>
              {lifecycleCols.map((s) => <div key={s} className="text-right">{n(matrix.lifecycleTotals[s] ?? 0)}</div>)}
              <div className="text-right">{n(matrix.grandTotal)}</div>
            </div>
            {matrix.rows.map((r) => (
              <div key={String(r.storeId)} className={`${MERGED_GRID} items-center border-b border-[#F8F8F8] px-4 py-2 text-[12px]`}>
                <div className="truncate font-semibold text-[#1A1C1A]" title={r.storeName}>{r.storeName}</div>
                {valueCols.map((s) => <div key={s} className="text-right">{cellBtn(r.storeId, r.storeName, "value", s, r.value[s] ?? 0)}</div>)}
                <div className="text-right font-bold text-[#1A1C1A]">{n(r.total)}</div>
                {lifecycleCols.map((s) => <div key={s} className="text-right">{cellBtn(r.storeId, r.storeName, "lifecycle", s, r.lifecycle[s] ?? 0)}</div>)}
                <div className="text-right font-bold text-[#1A1C1A]">{n(r.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {view !== "raw" && (
        <div className="px-4 py-2 text-[11px] text-[#9E9E9E]">
          {view === "detailed"
            ? `Every store split into all 12 pockets — grouped by ${by === "value" ? `${VALUE_TITLE} → ${LIFECYCLE_TITLE}` : `${LIFECYCLE_TITLE} → ${VALUE_TITLE}`}. ⇄ Flip swaps the grouping (synced with the KPI tree above). Shading = size within each group; click a count to drill in.`
            : "Both totals equal the store's farmer count. Switch to Detailed for the full 3×4 split. Value/lifecycle computed on the selected FY."}
        </div>
      )}
    </div>
  );
}

/** The full 3×3, grouped + heat-shaded. `by` picks which dimension forms the column groups (flip). */
function DetailedMatrix({ matrix, valueCols, lifecycleCols, onCell, by }: {
  matrix: MergedMatrix; valueCols: string[]; lifecycleCols: string[];
  onCell: (storeId: number | null, storeName: string, dim: "cross", seg: string) => void; by: "value" | "lifecycle";
}) {
  const groups = by === "value" ? valueCols : lifecycleCols; // outer column groups
  const subs = by === "value" ? lifecycleCols : valueCols;   // inner sub-columns within each group
  // cross is always stored value→lifecycle; read it in whichever order the current grouping needs.
  const at = (cross: Record<string, Record<string, number>> | undefined, g: string, s: string) => (by === "value" ? cross?.[g]?.[s] : cross?.[s]?.[g]) ?? 0;
  const crossSeg = (g: string, s: string) => (by === "value" ? `${g}|${s}` : `${s}|${g}`); // drill key is always VALUE|LIFECYCLE
  // Heat scaled per column group so each group's own big/small pockets stand out.
  const groupMax: Record<string, number> = {};
  for (const g of groups) groupMax[g] = Math.max(1, ...matrix.rows.flatMap((r) => subs.map((s) => at(r.cross, g, s))));
  const heatBg = (g: string, val: number) => (val > 0 ? `color-mix(in srgb, ${segMeta(g).color} ${Math.round(12 + 42 * (val / groupMax[g]))}%, transparent)` : "transparent");
  const th = "px-2.5 py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.3px]";
  const td = "px-2.5 py-2 text-right text-[12px] tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA]">
            <th rowSpan={2} className="sticky left-0 z-10 bg-[#FAFAFA] px-4 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.3px] text-[#9E9E9E]">Store</th>
            {groups.map((g, i) => (
              <th key={g} colSpan={subs.length} className={`px-2.5 py-1.5 text-center text-[11px] font-bold ${i > 0 ? "border-l border-[#EEE]" : ""}`} style={{ color: segMeta(g).color }}><InfoTip term={g}>{segMeta(g).label}</InfoTip></th>
            ))}
            <th rowSpan={2} className="border-l border-[#EEE] px-3 py-1.5 text-right text-[10.5px] font-bold uppercase tracking-[0.3px] text-[#1A1C1A]">Total</th>
          </tr>
          <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[#9E9E9E]">
            {groups.flatMap((g, gi) => subs.map((s, si) => (
              <th key={g + s} className={`${th} ${gi > 0 && si === 0 ? "border-l border-[#EEE]" : ""}`}><InfoTip term={s}>{SEG_SHORT[s] ?? segMeta(s).label}</InfoTip></th>
            )))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#EEE] bg-[#F5FBF5] font-bold text-[#1A1C1A]">
            <td className="sticky left-0 z-10 bg-[#F5FBF5] px-4 py-2 text-left text-[12px]">All stores</td>
            {groups.flatMap((g, gi) => subs.map((s, si) => (
              <td key={g + s} className={`${td} ${gi > 0 && si === 0 ? "border-l border-[#EEE]" : ""}`}>{n(at(matrix.grandCross, g, s)) || <span className="text-[#CFCFCF]">·</span>}</td>
            )))}
            <td className="border-l border-[#EEE] px-3 py-2 text-right text-[12px]">{n(matrix.grandTotal)}</td>
          </tr>
          {matrix.rows.map((r) => (
            <tr key={String(r.storeId)} className="border-b border-[#F8F8F8]">
              <td className="sticky left-0 z-10 max-w-[160px] truncate bg-white px-4 py-2 text-left text-[12px] font-semibold text-[#1A1C1A]" title={r.storeName}>{r.storeName}</td>
              {groups.flatMap((g, gi) => subs.map((s, si) => {
                const val = at(r.cross, g, s);
                return (
                  <td key={g + s} className={`${td} ${gi > 0 && si === 0 ? "border-l border-[#EEE]" : ""}`} style={{ background: heatBg(g, val) }}>
                    {val > 0
                      ? <button type="button" onClick={() => onCell(r.storeId, r.storeName, "cross", crossSeg(g, s))} className="font-semibold text-[#1A1C1A] hover:underline">{n(val)}</button>
                      : <span className="text-[#D5D5D5]">·</span>}
                  </td>
                );
              }))}
              <td className="border-l border-[#EEE] px-3 py-2 text-right text-[12px] font-bold text-[#1A1C1A]">{n(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sales raw-data tab: filter-driven KPI cards + the actual sale line items (no aggregation). */
function SalesRawData({ filters }: { filters: WbFilters }) {
  const [data, setData] = useState<{ kpis: RawKpis; rows: RawLine[]; capped: boolean } | null>(null);
  const [loading, start] = useTransition();
  const key = JSON.stringify(filters); // refetch whenever any filter changes
  useEffect(() => {
    setData(null);
    start(async () => setData(await getSalesRawData(filters)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const k = data?.kpis;
  const KPIS: [string, string][] = [
    ["Sale lines", k ? n(k.lines) : "…"],
    ["Base revenue", k ? money(k.base) : "…"],
    ["Farmers", k ? n(k.farmers) : "…"],
    ["Distinct items", k ? n(k.items) : "…"],
    ["Avg / line", k && k.lines ? money(Math.round(k.base / k.lines)) : "…"],
  ];
  const TH = "whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.3px] text-[#9E9E9E]";
  const TD = "whitespace-nowrap px-3 py-1.5 text-[#424242]";
  return (
    <div className="p-4">
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {KPIS.map(([label, val]) => (
          <div key={label} className="rounded-[10px] border border-[#EEE] bg-[#FAFAFA] px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.3px] text-[#9E9E9E]">{label}</div>
            <div className="mt-0.5 text-[17px] font-bold text-[#1A1C1A]">{val}</div>
          </div>
        ))}
      </div>
      {loading || data == null ? (
        <div className="py-10 text-center text-[13px] text-[#9E9E9E]">Loading sale lines…</div>
      ) : data.rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#9E9E9E]">No sale lines match these filters.</div>
      ) : (
        <div className="max-h-[460px] overflow-auto rounded-[10px] border border-[#F0F0F0]">
          <table className="w-full min-w-[1040px] text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-[#EEE]">
                <th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>Date</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>FY</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>Farmer</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>Phone</th>
                <th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>Store</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>Item</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>Category</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>Crop</th>
                <th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA] text-right`}>Qty</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA]`}>UOM</th><th className={`${TH} sticky top-0 z-10 bg-[#FAFAFA] text-right`}>Base (₹)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-[#F6F6F6]">
                  <td className={`${TD} text-[#616161]`}>{r.date ?? "—"}</td>
                  <td className={`${TD} text-[#9E9E9E]`}>{r.fy ?? "—"}</td>
                  <td className="px-3 py-1.5"><div className="font-semibold text-[#1A1C1A]">{r.farmer}</div>{r.village && <div className="text-[10px] text-[#9E9E9E]">{r.village}</div>}</td>
                  <td className={`${TD} text-[#616161]`}>{r.phone ?? "—"}</td>
                  <td className={`${TD} text-[#616161]`}>{r.store ?? "—"}</td>
                  <td className="px-3 py-1.5 text-[#424242]">{r.item}</td>
                  <td className={`${TD} text-[#9E9E9E]`}>{r.category ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.crop ? <span className="rounded-full bg-[#F3F8E6] px-1.5 py-0.5 text-[10px] font-semibold text-[#678722]">{r.crop}</span> : <span className="text-[#DDD]">—</span>}</td>
                  <td className={`${TD} text-right tabular-nums`}>{n(r.qty)}</td>
                  <td className={`${TD} text-[#9E9E9E]`}>{r.uom ?? "—"}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums text-[#1A1C1A]`}>{money(r.base)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 text-[11px] text-[#9E9E9E]">
        Actual sale line items · base (pre-tax) price · KPIs and rows follow the active filters.
        {data?.capped && " Showing first 1,000 lines by date — the KPIs cover the full set; use Export for everything."}
      </div>
    </div>
  );
}

function BarCard({ title, bars, fmt, accent = "#678722" }: { title: string; bars: WbBar[]; fmt: (x: number) => string; accent?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const shown = bars.filter((b) => b.value > 0);
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">{title}</div>
      {shown.length === 0 ? <div className="py-6 text-center text-[12.5px] text-[#9E9E9E]">No data.</div> : (
        <div className="flex flex-col gap-2">
          {shown.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-[11.5px]"><span className="truncate font-medium text-[#424242]" title={b.label}>{b.label}</span><span className="ml-2 shrink-0 text-[#9E9E9E]">{fmt(b.value)}</span></div>
              <div className="mt-0.5 h-2 rounded-full bg-[#F0F0F0]"><div className="h-2 rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: b.color ?? accent }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Donut / pie — share of a whole (farmers, visits, …). */
function DonutCard({ title, slices, unit = "farmers" }: { title: string; slices: WbBar[]; unit?: string }) {
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((a, b) => a + b.value, 0);
  const R = 54, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">{title}</div>
      {total === 0 ? <div className="py-6 text-center text-[12.5px] text-[#9E9E9E]">No data.</div> : (
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative shrink-0">
            <svg width="150" height="150" viewBox="0 0 150 150" className="-rotate-90">
              <circle cx="75" cy="75" r={R} fill="none" stroke="#F0F0F0" strokeWidth="20" />
              {shown.map((s) => {
                const frac = s.value / total;
                const el = (
                  <circle key={s.label} cx="75" cy="75" r={R} fill="none" stroke={s.color ?? "#678722"} strokeWidth="20"
                    strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C}>
                    <title>{`${s.label}: ${n(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
                  </circle>
                );
                acc += frac;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[17px] font-bold text-[#1A1C1A]">{n(total)}</div>
              <div className="text-[9.5px] uppercase text-[#9E9E9E]">{unit}</div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {shown.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color ?? "#678722" }} />
                <span className="truncate font-medium text-[#424242]"><InfoTip term={s.label}>{s.label}</InfoTip></span>
                <span className="ml-auto shrink-0 text-[#9E9E9E]">{n(s.value)} · {((s.value / total) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Vertical histogram — farmers per spend tier. */
function HistogramCard({ title, bars, accent = "#1565C0" }: { title: string; bars: WbBar[]; accent?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">{title}</div>
      {bars.every((b) => !b.value) ? <div className="py-6 text-center text-[12.5px] text-[#9E9E9E]">No data.</div> : (
        <div className="flex items-end gap-2.5 pt-2">
          {bars.map((b) => (
            <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center" title={`${b.label}: ${n(b.value)} farmers`}>
              <div className="mb-1 text-[10.5px] font-bold text-[#424242]">{b.value ? n(b.value) : ""}</div>
              <div className="w-full rounded-t-[6px]" style={{ height: `${Math.max(b.value > 0 ? 4 : 1, Math.round((b.value / max) * 110))}px`, background: b.color ?? accent }} />
              <div className="mt-1 w-full truncate text-center text-[10px] text-[#9E9E9E]" title={b.label}>{b.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Monthly purchase trend for one crop, coloured by cropping season (uses the per-line crop tags). */
const SEASON_COLOR: Record<CropTrendPoint["season"], string> = { Kharif: "#678722", Rabi: "#1565C0", Zaid: "#EDA942" };

/** Driven by the main crop + FY filters above — no dropdown of its own. No crop → all crops; no FY → all years. */
function CropTrendCard({ crops, years }: { crops: string[]; years: number[] }) {
  const [points, setPoints] = useState<CropTrendPoint[] | null>(null);
  const [loading, start] = useTransition();
  const cropKey = crops.join(","); // stable dep for the effect

  useEffect(() => {
    setPoints(null);
    start(async () => setPoints(await getCropTrend(crops)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropKey]);

  const all = points ?? [];
  const pts = years.length ? all.filter((p) => years.includes(fyStartOfYm(p.ym))) : all;
  const max = Math.max(1, ...pts.map((p) => p.revenue));
  const totalRev = pts.reduce((a, p) => a + p.revenue, 0);
  const seasonTotals = pts.reduce((m, p) => { m[p.season] = (m[p.season] ?? 0) + p.revenue; return m; }, {} as Record<string, number>);

  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <div className="text-[13px] font-bold text-[#1A1C1A]">Crop purchase trend</div>
        <span className="rounded-full bg-[#F3F8E6] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#678722]">{crops.length ? crops.map(cropLabel).join(", ") : "All crops"}</span>
        <span className="rounded-full bg-[#E3F2FD] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#1565C0]">{years.length ? years.map(fyLabel).join(", ") : "All FYs"}</span>
        {loading && <span className="text-[11.5px] text-[#9E9E9E]">Loading…</span>}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] font-medium text-[#616161]">
          {(["Kharif", "Rabi", "Zaid"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEASON_COLOR[s] }} />
              {s}{seasonTotals[s] ? ` · ${money(seasonTotals[s])}` : ""}
            </span>
          ))}
          {totalRev > 0 && <span className="rounded-full bg-[#F5F7F5] px-2.5 py-0.5 font-bold text-[#1A1C1A]">Total {money(totalRev)}</span>}
        </div>
      </div>
      <div className="mb-3 text-[11px] text-[#9E9E9E]">
        Monthly ₹ of {crops.length ? `${crops.map(cropLabel).join(", ")}-tagged` : "all"} sale lines · seasons: Kharif Jun–Oct · Rabi Nov–Mar · Zaid Apr–May
      </div>
      {points == null ? (
        <div className="py-10 text-center text-[12.5px] text-[#9E9E9E]">Loading…</div>
      ) : pts.length === 0 ? (
        <div className="py-10 text-center text-[12.5px] text-[#9E9E9E]">No crop-tagged sales recorded for this crop yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-[3px]" style={{ minWidth: Math.max(560, pts.length * 22) }}>
            {pts.map((p) => (
              <div key={p.ym} className="group flex min-w-[16px] flex-1 flex-col justify-end"
                title={`${p.label} ${p.year} · ${money(p.revenue)} · ${n(p.lines)} lines · ${p.season}`}>
                <div className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-75"
                  style={{ height: `${Math.max(p.revenue > 0 ? 4 : 1, Math.round((p.revenue / max) * 140))}px`, background: SEASON_COLOR[p.season], opacity: p.revenue > 0 ? 1 : 0.25 }} />
                <div className="mt-1 h-[24px] text-center">
                  <div className="text-[9px] leading-tight text-[#9E9E9E]">{p.label[0]}</div>
                  {(p.label === "Jan" || p.ym === pts[0].ym) && <div className="text-[9px] font-bold leading-tight text-[#616161]">{p.year}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Visit lens board: everything the field-visit wizard collects, nothing sales-derived ── */
const PALETTE = ["#678722", "#1565C0", "#EDA942", "#6A1B9A", "#C62828", "#00838F", "#E65100", "#5D4037", "#3949AB", "#7CB342"];
const paint = (bars: WbBar[]): WbBar[] => bars.map((b, i) => ({ ...b, color: b.color ?? PALETTE[i % PALETTE.length] }));

function VisitBoard({ va }: { va: VisitAnalytics | null }) {
  if (va == null) return <div className={`${CARD} py-12 text-center text-[13px] text-[#9E9E9E]`}>Loading visit analytics…</div>;
  if (va.kpis.visits === 0) return <div className={`${CARD} py-12 text-center text-[13px] text-[#9E9E9E]`}>No field visits match these filters yet — data appears here as officers log visits.</div>;
  return (
    <div className="flex flex-col gap-[14px]">
      <VisitTrendCard monthly={va.monthly} />
      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        <DonutCard title="Visit purpose" slices={paint(va.purposes)} unit="visits" />
        <AdoptionCard title="Services & readiness (share of visits)" rows={va.adoption} />
        <HistogramCard title="Land holding (Bigha)" bars={va.landHolding} accent="#678722" />
        <HistogramCard title="Annual agri expense" bars={va.expense} accent="#EDA942" />
        <BarCard title="Field problems (farmers)" bars={va.problems} fmt={n} accent="#C62828" />
        <BarCard title="Crops recorded in visits" bars={va.crops} fmt={n} accent="#EDA942" />
        <BarCard title="Products in use" bars={va.productsUsed} fmt={n} accent="#1565C0" />
        <BarCard title="Products required — demand signal" bars={va.productsNeeded} fmt={n} accent="#678722" />
        <DonutCard title="Water sources" slices={paint(va.water)} unit="mentions" />
        <BarCard title="Soil types" bars={va.soilTypes} fmt={n} accent="#5D4037" />
        <BarCard title="Crop risks flagged" bars={va.risks} fmt={n} accent="#E65100" />
        <BarCard title="Purchase frequency" bars={va.purchaseFreq} fmt={n} accent="#6A1B9A" />
        <BarCard title="Officer activity (visits)" bars={va.officers} fmt={n} accent="#0D47A1" />
        <StoreVisitsTable rows={va.byStore} />
      </div>
    </div>
  );
}

/** Monthly visit volume — simple bar timeline. */
function VisitTrendCard({ monthly }: { monthly: VisitMonth[] }) {
  const max = Math.max(1, ...monthly.map((m) => m.count));
  const total = monthly.reduce((a, m) => a + m.count, 0);
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <div className="text-[13px] font-bold text-[#1A1C1A]">Visits per month</div>
        {total > 0 && <span className="rounded-full bg-[#F5F7F5] px-2.5 py-0.5 text-[11px] font-bold text-[#1A1C1A]">{n(total)} dated visits</span>}
      </div>
      {monthly.length === 0 ? (
        <div className="py-8 text-center text-[12.5px] text-[#9E9E9E]">No dated visits yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-[3px] pt-2" style={{ minWidth: Math.max(360, monthly.length * 26) }}>
            {monthly.map((m) => (
              <div key={m.ym} className="flex min-w-[20px] flex-1 flex-col justify-end" title={`${m.label} ${m.year} · ${n(m.count)} visits`}>
                <div className="mx-auto mb-0.5 text-[9.5px] font-bold text-[#424242]">{m.count || ""}</div>
                <div className="w-full rounded-t-[4px] bg-[#678722]" style={{ height: `${Math.max(3, Math.round((m.count / max) * 110))}px` }} />
                <div className="mt-1 text-center text-[9px] leading-tight text-[#9E9E9E]">{m.label}<br /><b className="text-[#616161]">{String(m.year).slice(2)}</b></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Progress list — share of visits where each service / readiness flag was recorded. */
function AdoptionCard({ title, rows }: { title: string; rows: VisitAdoption[] }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">{title}</div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <div key={r.label}>
            <div className="flex justify-between text-[11.5px]">
              <span className="font-medium text-[#424242]">{r.label}</span>
              <span className="text-[#9E9E9E]">{r.pct}% · {n(r.count)}</span>
            </div>
            <div className="mt-0.5 h-2 rounded-full bg-[#F0F0F0]">
              <div className="h-2 rounded-full" style={{ width: `${r.pct}%`, background: PALETTE[i % PALETTE.length] }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Visits by store — table with an inline share bar. */
function StoreVisitsTable({ rows }: { rows: VisitStoreRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <div className={`${CARD} overflow-hidden lg:col-span-2`}>
      <div className="border-b border-[#F0F0F0] px-4 py-2.5 text-[13px] font-bold text-[#1A1C1A]">Visits by store</div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-[12.5px] text-[#9E9E9E]">No store-tagged visits.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead><tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]">
              <th className="px-4 py-2">Store</th><th className="py-2">Share</th><th className="py-2 text-right">Visits</th><th className="py-2 pr-4 text-right">Farmers visited</th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.store} className="border-b border-[#F8F8F8]">
                <td className="px-4 py-2 font-semibold text-[#1A1C1A]">{r.store}</td>
                <td className="py-2 pr-4"><div className="h-2 w-full max-w-[220px] rounded-full bg-[#F0F0F0]"><div className="h-2 rounded-full bg-[#678722]" style={{ width: `${(r.visits / max) * 100}%` }} /></div></td>
                <td className="py-2 text-right font-bold text-[#1A1C1A]">{n(r.visits)}</td>
                <td className="py-2 pr-4 text-right text-[#616161]">{n(r.farmers)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SaveModal({ filters, kpi, canChain, onClose }: { filters: WbFilters; kpi: number; canChain: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await saveWorkbenchSegment(filters, name);
      if (res.ok && res.id != null) setCreatedId(res.id);
      setMsg(res.ok ? "ok" : res.error ?? "Failed");
    });
  };
  return (
    <Modal open onClose={onClose} className="max-w-[460px]">
      <ModalHeader eyebrow="Cluster" eyebrowColor="#678722" title="Save filtered set as a cluster" subtitle={`~${n(kpi)} farmers · membership stays live`} onClose={onClose} />
      <div className="px-5 py-4">
        {msg === "ok" ? (
          canChain && createdId != null ? (
            <ChainNext message={`Cluster "${name.trim()}" created`} nextLabel="Next: create a project →"
              nextHref={`/projects?withCluster=${createdId}`} onDone={onClose} />
          ) : (
            <div className="rounded-[10px] border border-[#D3E4AB] bg-[#F3F8E6] px-3.5 py-3 text-[13px] font-medium text-[#678722]">✓ Saved — find it on the Farmer Clusters page (live, re-resolving membership).</div>
          )
        ) : (
          <>
            <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Cluster name</label>
            <input autoFocus className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amethi wheat HNIs" />
            {msg && <div className="mt-2 text-[12px] text-[#C62828]">{msg}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
              <button type="button" onClick={save} disabled={saving || !name.trim()} className="rounded-[10px] bg-[#678722] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Create cluster"}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
