"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { STORE_STATUS_META } from "@/lib/status";
import { EmptyState } from "@/components/ui";
import { SearchableSelect } from "@/components/SearchableSelect";
import { EditPencil } from "./EditPencil";
import { StoreFormModal } from "./StoreFormModal";
import { MapOfficersModal } from "./MapOfficersModal";
import { DeleteStoreModal } from "./DeleteStoreModal";
import type { StoreMgmtData, StoreMgmtRow, OfficerLite } from "./types";

const GRID =
  "grid grid-cols-[24px_1.7fr_0.9fr_1.1fr_1.5fr_0.55fr_0.7fr_150px] px-[18px] items-center gap-2";

const isActive = (s: string) => s.trim().toLowerCase() === "active";

type Filter = "all" | "mapped" | "unmapped" | "closed";

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function OfficerChip({ o }: { o: OfficerLite }) {
  return (
    <span
      className="inline-flex max-w-[120px] items-center gap-1 rounded-[20px] bg-[#E3F2FD] px-1.5 py-[2px] text-[11px] font-semibold text-[#1565C0]"
      style={{ opacity: o.active ? 1 : 0.5 }}
      title={o.code ? `${o.name} · ${o.code}` : o.name}
    >
      <span
        className="flex h-4 w-4 flex-none items-center justify-center rounded-full text-[8px] text-white"
        style={{ background: o.grad }}
      >
        {o.init}
      </span>
      <span className="truncate">{o.name.split(" ")[0]}</span>
    </span>
  );
}

function KpiCard({ value, label, accent, onClick }: { value: number; label: string; accent?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex flex-col items-start rounded-xl border bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        onClick ? "cursor-pointer hover:border-[#FFB74D]" : "cursor-default",
      )}
      style={{ borderColor: accent ? "#F5CE8E" : "rgba(0,0,0,0.03)" }}
    >
      <div className="text-[20px] font-bold" style={{ color: accent ?? "#1A1C1A" }}>
        {value.toLocaleString("en-IN")}
      </div>
      <div className="text-[10.5px] text-[#9E9E9E]">{label}</div>
    </button>
  );
}

export function StoresTab({ data, canEdit }: { data: StoreMgmtData; canEdit: boolean }) {
  const { totals } = data;
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [fZone, setFZone] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StoreMgmtRow | null>(null);
  const [mappingId, setMappingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<StoreMgmtRow | null>(null);

  const zones = useMemo(
    () => [...new Set(data.rows.map((r) => r.zone).filter(Boolean))].sort(),
    [data.rows],
  );
  const storeNameById = useMemo(
    () => Object.fromEntries(data.rows.map((r) => [r.id, r.shortName])) as Record<number, string>,
    [data.rows],
  );
  const rmNames = useMemo(
    () => new Set(data.regionals.map((r) => r.name.trim().toUpperCase())),
    [data.regionals],
  );
  const mappingStore = mappingId != null ? data.rows.find((r) => r.id === mappingId) ?? null : null;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = data.rows.filter((r) => {
      if (filter === "mapped" && (r.unmapped || !isActive(r.status))) return false;
      if (filter === "unmapped" && !r.unmapped) return false;
      if (filter === "closed" && isActive(r.status)) return false;
      if (fZone && r.zone !== fZone) return false;
      if (term && !`${r.name} ${r.code} ${r.zone} ${r.regionalManager}`.toLowerCase().includes(term))
        return false;
      return true;
    });
    return list.slice().sort((a, b) => {
      if (a.unmapped !== b.unmapped) return a.unmapped ? -1 : 1;
      if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
      return a.name.localeCompare(b.name);
    });
  }, [data.rows, filter, q, fZone]);

  const SEGMENTS: { id: Filter; label: string; count: number; accent?: boolean }[] = [
    { id: "all", label: "All", count: totals.total },
    { id: "mapped", label: "Mapped", count: totals.mapped },
    { id: "unmapped", label: "⚠ Unmapped", count: totals.unmapped, accent: true },
    { id: "closed", label: "Closed", count: totals.closed },
  ];

  return (
    <div>
      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 gap-[12px] sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard value={totals.total} label="Total Stores" />
        <KpiCard value={totals.active} label="Active" />
        <KpiCard value={totals.unmapped} label="⚠ Unmapped" accent="#E65100" onClick={() => setFilter("unmapped")} />
        <KpiCard value={totals.officersUnassigned} label="Officers Unassigned" />
        <KpiCard value={totals.farmersMapped} label="Farmers Mapped" />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-0 rounded-[10px] border border-[#F0F0F0] bg-white p-[3px]">
          {SEGMENTS.map((s) => {
            const active = filter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setFilter(s.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  active
                    ? s.id === "closed" ? "bg-[#C62828] text-white" : s.accent ? "bg-[#E65100] text-white" : "bg-[#5C7D22] text-white"
                    : s.id === "closed" ? "text-[#C62828]" : s.accent ? "text-[#E65100]" : "text-[#757575]",
                )}
              >
                {s.label} ({s.count})
              </button>
            );
          })}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search store, code, district or RM…"
          className="min-w-[200px] flex-1 rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2 text-[13px] outline-none focus:border-[#7DA02E]"
        />
        <SearchableSelect
          className="min-w-[150px] rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2 text-[13px] text-[#424242] outline-none focus:border-[#7DA02E]"
          placeholder="All districts" searchPlaceholder="Search districts…"
          value={fZone || null} onChange={(v) => setFZone(v ?? "")}
          options={zones.map((z) => ({ value: z, label: z }))}
        />
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-[10px] bg-[#7DA02E] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#66852A]"
          >
            + Add Store
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
        <div className="min-w-[920px] lg:min-w-0">
        <div className={`${GRID} border-b border-[#F0F0F0] bg-[#FAFAFA] py-[12px] text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]`}>
          <div />
          <div>Store</div>
          <div>District</div>
          <div>Regional Manager</div>
          <div>Agri Officers</div>
          <div>Farmers</div>
          <div>Status</div>
          <div />
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No stores match" hint="Adjust the filter or search." />
        ) : (
          rows.map((sr) => {
            const st = STORE_STATUS_META[sr.status] ?? { bg: "#F5F5F5", c: "#757575" };
            const rmUnverified = sr.regionalManager && !rmNames.has(sr.regionalManager.trim().toUpperCase());
            return (
              <div
                key={sr.id}
                className={cn(`${GRID} border-b border-[#F8F8F8] py-[12px]`, sr.unmapped && "border-l-2 border-l-[#FFB74D]")}
              >
                <div className="h-[22px] w-[22px] flex-none rounded-md" style={{ background: sr.color }} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-[#1A1C1A]">{sr.shortName}</div>
                  <div className="mt-px flex items-center gap-1.5 text-[10.5px] text-[#9E9E9E]">
                    <span>{sr.code}</span>
                    {!sr.hasGps && <span className="rounded bg-[#F5F5F5] px-1 text-[9px] text-[#BDBDBD]">no GPS</span>}
                  </div>
                </div>
                <div className="truncate text-[12px] text-[#616161]">{sr.zone || "—"}</div>
                <div className="min-w-0 text-[12px] text-[#616161]">
                  <span className="truncate">{sr.regionalManager || "—"}</span>
                  {rmUnverified && (
                    <span className="ml-1 rounded bg-[#F5F5F5] px-1 text-[9px] text-[#BDBDBD]" title="No matching regional-manager account">
                      unverified
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {sr.officers.length === 0 ? (
                    sr.unmapped ? (
                      <span className="rounded-[20px] bg-[#FFF3E0] px-2 py-[2px] text-[10.5px] font-semibold text-[#E65100]">
                        ⚠ Unmapped
                      </span>
                    ) : (
                      <span className="text-[12px] text-[#BDBDBD]">—</span>
                    )
                  ) : (
                    <>
                      {sr.officers.slice(0, 2).map((o) => <OfficerChip key={o.id} o={o} />)}
                      {sr.officers.length > 2 && (
                        <span className="text-[11px] font-semibold text-[#9E9E9E]">+{sr.officers.length - 2}</span>
                      )}
                    </>
                  )}
                </div>
                <div className="text-[13px] font-bold" style={{ color: sr.farmerCount >= 500 ? "#E65100" : "#1A1C1A" }}>
                  {sr.farmerCount.toLocaleString("en-IN")}
                </div>
                <div>
                  <span className="inline-block rounded-[20px] px-[9px] py-[3px] text-[10px] font-semibold" style={{ background: st.bg, color: st.c }}>
                    {sr.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMappingId(sr.id)}
                        className="rounded-lg bg-[#E3F2FD] px-[9px] py-[5px] text-[11px] font-semibold text-[#1565C0] hover:bg-[#BBDEFB]"
                      >
                        Map
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(sr)}
                        aria-label={`Edit ${sr.shortName}`}
                        className="inline-flex items-center rounded-lg bg-[#F5F7F5] px-[8px] py-[6px] text-[#7DA02E] hover:bg-[#F5F9EA]"
                      >
                        <EditPencil />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(sr)}
                        aria-label={`Delete ${sr.shortName}`}
                        className="inline-flex items-center rounded-lg bg-[#FDECEA] px-[8px] py-[6px] text-[#C62828] hover:bg-[#F9DCD8]"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        </div>
        </div>
      </div>

      {creating && (
        <StoreFormModal store={null} regionals={data.regionals} zones={zones} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <StoreFormModal store={editing} regionals={data.regionals} zones={zones} onClose={() => setEditing(null)} />
      )}
      {mappingStore && (
        <MapOfficersModal
          store={mappingStore}
          allOfficers={data.allOfficers}
          storeNameById={storeNameById}
          onClose={() => setMappingId(null)}
        />
      )}
      {deleting && <DeleteStoreModal store={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
