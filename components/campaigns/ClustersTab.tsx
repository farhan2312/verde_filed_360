"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { InfoTip } from "@/components/InfoTip";
import { segMeta, segDef, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS, VALUE_TITLE, LIFECYCLE_TITLE } from "@/lib/campaign-segments";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { shortStoreName } from "@/lib/store-utils";
import type { ClusterCriteria } from "@/lib/cluster-rules";
import type { CropOption, PestOption } from "./CampaignsScreen";
import {
  listClustersWithCounts, deleteCluster, previewClusterCount, type ClusterVM,
} from "@/app/actions/campaigns";
import { createClusterFromCriteria, updateClusterFromCriteria } from "@/app/actions/cluster-builder";
import { ChainNext } from "@/components/ChainNext";
import { useConfirm } from "@/components/ConfirmDialog";
import { getClusterFarmers, exportClusterFarmersXlsx } from "@/app/actions/clusters";
import type { ClusterMembersResult } from "@/components/clusters/types";
import { downloadB64 } from "@/lib/download";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => x.toLocaleString("en-IN");
const ORIGIN_LABEL: Record<string, string> = { map: "Map", segment: "Builder", analytics: "Analytics" };
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };

export interface StoreOption { id: number; name: string; zone: string | null }

export function ClustersTab({ initial, zones, crops, pests, stores, canChain, canCreate = true, scopeLabel }: {
  initial: ClusterVM[]; zones: string[]; crops: CropOption[]; pests: PestOption[]; stores: StoreOption[]; canChain: boolean;
  /** Central/sysadmin only — RMs get a read-only, region-scoped view. */
  canCreate?: boolean;
  /** e.g. "SULTANPUR" — shown so a scoped viewer knows the counts are their region's. */
  scopeLabel?: string | null;
}) {
  const [list, setList] = useState(initial);
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState<ClusterVM | null>(null);
  const [viewing, setViewing] = useState<ClusterVM | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();

  const refresh = () => start(async () => setList(await listClustersWithCounts()));
  const remove = (id: number) =>
    start(async () => { await deleteCluster(id); setList((l) => l.filter((c) => c.id !== id)); });
  const askRemove = async (c: ClusterVM) => {
    if (await confirm({ title: "Delete this cluster?", confirmLabel: "Delete cluster", message: <><b>{c.name}</b> ({n(c.count)} farmers) will be permanently removed. This can’t be undone.</> })) remove(c.id);
  };

  return (
    <div>
      {dialog}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] text-[#757575]">
          {canCreate
            ? "Clusters are dynamic — membership re-resolves live as farmers are added or updated. Build one here, or save one from the Map or Analytics views."
            : `Clusters are dynamic and built by the central team. Counts below are ${scopeLabel ? `your district (${scopeLabel})` : "your"} members only.`}
        </div>
        {canCreate && (
          <button type="button" onClick={() => setBuilding(true)} className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[13px] font-semibold text-white">+ New cluster</button>
        )}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {list.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[#9E9E9E]">No clusters yet — build one or save from a map/analytics view.</div>
        ) : list.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-[#F5F5F5] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-bold text-[#1A1C1A]">{c.name}</span>
                <span className="rounded-full bg-[#F5F7F5] px-2 py-0.5 text-[10px] font-semibold text-[#616161]">{ORIGIN_LABEL[c.origin] ?? c.origin}</span>
                {c.mode === "dynamic" && <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[10px] font-semibold text-[#7DA02E]">● live</span>}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-[#9E9E9E]" title={c.description}>{c.description}</div>
              <div className="mt-0.5 text-[10.5px] text-[#BDBDBD]">
                {c.createdBy ? <>By <span className="font-semibold text-[#9E9E9E]">{c.createdBy}</span>{c.createdByCode ? ` (${c.createdByCode})` : ""}</> : "By —"}
                {c.createdAt ? ` · ${fmtDate(c.createdAt)}` : ""}
              </div>
            </div>
            <div className="text-[13px] font-bold text-[#7DA02E]">{n(c.count)}</div>
            <div className="text-[11px] text-[#9E9E9E]">farmers</div>
            {canCreate && c.locked && (
              <span title={`In the active campaign "${c.lockedBy ?? ""}" — close it to edit or delete this cluster`}
                className="inline-flex items-center gap-1 rounded-full bg-[#FFF3E0] px-2.5 py-1 text-[11px] font-semibold text-[#E65100]">
                🔒 In campaign
              </span>
            )}
            <button type="button" onClick={() => setViewing(c)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#7DA02E] hover:bg-[#F5F9EA]">View</button>
            {canCreate && !c.locked && (
              <button type="button" onClick={() => setEditing(c)} disabled={pending} className="rounded-[8px] bg-[#E8F0FE] px-3 py-1.5 text-[12px] font-semibold text-[#1565C0] hover:bg-[#D7E6FD] disabled:opacity-50">Edit</button>
            )}
            {canCreate && !c.locked && (
              <button type="button" onClick={() => askRemove(c)} disabled={pending} className="rounded-[8px] bg-[#FDECEA] px-3 py-1.5 text-[12px] font-semibold text-[#C62828] hover:bg-[#F9DCD8] disabled:opacity-50">Delete</button>
            )}
          </div>
        ))}
      </div>

      {building && <RuleBuilder zones={zones} crops={crops} pests={pests} stores={stores} canChain={canChain} onClose={() => setBuilding(false)} onCreated={() => { setBuilding(false); refresh(); }} />}
      {editing && <RuleBuilder zones={zones} crops={crops} pests={pests} stores={stores} canChain={false} editing={editing} onClose={() => setEditing(null)} onCreated={() => { setEditing(null); refresh(); }} />}
      {viewing && <MembersModal cluster={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* Multi-select checkbox dropdown: tick options inside the panel. Has a Select-all / Clear-all
   row and an optional search box for long lists (stores). Selection is driven by the parent. */
function CheckDropdown({ placeholder, options, selected, onToggle, onSelectAll, onClear, searchable = false }: {
  placeholder: string;
  options: { value: string; label: string; hint?: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const selCount = options.reduce((acc, o) => acc + (selected.has(o.value) ? 1 : 0), 0);
  const allOn = options.length > 0 && selCount === options.length;

  return (
    <div ref={ref} className="relative mb-2">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-left text-[13px]">
        <span className={selCount ? "text-[#1A1C1A]" : "text-[#9E9E9E]"}>{selCount ? `${selCount} selected` : placeholder}</span>
        <span className="ml-2 text-[10px] text-[#9E9E9E]">▾</span>
      </button>
      {open && (
        <div className="mt-1 overflow-hidden rounded-lg border border-[#E0E0E0] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          {searchable && (
            <div className="border-b border-[#F0F0F0] p-2">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="w-full rounded-md border border-[#E0E0E0] px-2 py-1.5 text-[12px]" />
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 border-b border-[#F0F0F0] bg-[#FAFBFA] px-3 py-2 text-[12px] font-semibold text-[#7DA02E]">
            <input type="checkbox" checked={allOn}
              ref={(el) => { if (el) el.indeterminate = selCount > 0 && !allOn; }}
              onChange={() => (allOn ? onClear() : onSelectAll())} className="h-3.5 w-3.5 accent-[#7DA02E]" />
            {allOn ? "Clear all" : "Select all"}{options.length ? ` (${options.length})` : ""}
          </label>
          <div className="max-h-[180px] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-3 py-3 text-center text-[12px] text-[#9E9E9E]">No matches</div>
            ) : shown.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-[#F5F7F5]">
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(o.value)} className="h-3.5 w-3.5 accent-[#7DA02E]" />
                <span className="flex-1 text-[#1A1C1A]">{o.label}</span>
                {o.hint && <span className="text-[10.5px] text-[#9E9E9E]">{o.hint}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Rule builder ── (also the full-edit modal when `editing` is passed) */
function RuleBuilder({ zones, crops: cropOpts, pests: pestOpts, stores, canChain, editing, onClose, onCreated }: { zones: string[]; crops: CropOption[]; pests: PestOption[]; stores: StoreOption[]; canChain: boolean; editing?: ClusterVM; onClose: () => void; onCreated: () => void }) {
  const seed = editing?.criteria ?? null;
  // Prefill the crop picker + its source toggle from whichever crop field the saved rule used.
  const seedCropSource: "any" | "sales" | "visit" = seed?.salesCrops?.length ? "sales" : seed?.visitCrops?.length ? "visit" : "any";
  const seedCrops = seed?.salesCrops?.length ? seed.salesCrops : seed?.visitCrops?.length ? seed.visitCrops : seed?.cropTags ?? [];
  // Rule conditions this builder has no control for (spend tier, villages, category, legacy segments…)
  // are carried through an edit untouched, so a "full edit" never silently drops them. explicitIds
  // (hand-picked static membership) is intentionally not carried — editing re-defines the rule.
  const carry = useMemo<Partial<ClusterCriteria>>(() => {
    if (!seed) return {};
    const { valueSegments, lifecycleSegments, salesCrops, visitCrops, cropTags, pestTags, zones: _z, zone, storeIds: _s, q: _q, whatsappOptIn, explicitIds, ...rest } = seed;
    void valueSegments; void lifecycleSegments; void salesCrops; void visitCrops; void cropTags; void pestTags; void _z; void zone; void _s; void _q; void whatsappOptIn; void explicitIds;
    return rest;
  }, [seed]);
  const hasCarry = Object.keys(carry).length > 0;

  const [name, setName] = useState(editing?.name ?? "");
  const [createdId, setCreatedId] = useState<number | null>(null); // chain: cluster → project (create only)
  const [valueSegs, setValueSegs] = useState<string[]>(seed?.valueSegments ?? []);
  const [lifecycleSegs, setLifecycleSegs] = useState<string[]>(seed?.lifecycleSegments ?? []);
  const [crops, setCrops] = useState<string[]>(seedCrops);
  const [cropSource, setCropSource] = useState<"any" | "sales" | "visit">(seedCropSource); // which crop record to match
  const [pests, setPests] = useState<string[]>(seed?.pestTags ?? []);
  const [zoneList, setZoneList] = useState<string[]>(seed?.zones ?? (seed?.zone ? [seed.zone] : []));
  const [storeIds, setStoreIds] = useState<number[]>(seed?.storeIds ?? []);
  const [q, setQ] = useState(seed?.q ?? "");
  const [waOptIn, setWaOptIn] = useState(!!seed?.whatsappOptIn);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  // Stores cascade off the selected regions: with regions picked, only stores in those regions are offered.
  const availStores = useMemo(
    () => (zoneList.length ? stores.filter((s) => s.zone && zoneList.includes(s.zone)) : stores),
    [zoneList, stores],
  );

  const criteria = (): ClusterCriteria => ({
    ...carry, // preserve edit-only conditions the builder can't show (spend tier, villages, …)
    valueSegments: valueSegs.length ? valueSegs : undefined,
    lifecycleSegments: lifecycleSegs.length ? lifecycleSegs : undefined,
    // Route the picked crops to the chosen source: sales bought / seen on a visit / either.
    ...(crops.length
      ? cropSource === "sales" ? { salesCrops: crops }
      : cropSource === "visit" ? { visitCrops: crops }
      : { cropTags: crops }
      : {}),
    pestTags: pests.length ? pests : undefined,
    zones: zoneList.length ? zoneList : undefined,
    storeIds: storeIds.length ? storeIds : undefined,
    q: q.trim() || undefined,
    whatsappOptIn: waOptIn || undefined,
  });
  const hasAny = valueSegs.length || lifecycleSegs.length || crops.length || pests.length || zoneList.length || storeIds.length || q.trim() || waOptIn || hasCarry;

  // Debounced live count preview.
  useEffect(() => {
    if (!hasAny) { setCount(null); return; }
    setCounting(true);
    const t = setTimeout(async () => { setCount(await previewClusterCount(criteria())); setCounting(false); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueSegs, lifecycleSegs, crops, cropSource, pests, zoneList, storeIds, q, waOptIn]);

  const toggle = (arr: string[], set: (a: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const toggleZone = (z: string) => {
    const next = zoneList.includes(z) ? zoneList.filter((x) => x !== z) : [...zoneList, z];
    setZoneList(next);
    // Prune any picked store no longer inside the (now constraining) region set.
    if (next.length) setStoreIds((ids) => ids.filter((id) => { const s = storeById.get(id); return !!s?.zone && next.includes(s.zone); }));
  };
  const toggleStore = (id: number) => setStoreIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = () => {
    setErr(null);
    start(async () => {
      const res = editing
        ? await updateClusterFromCriteria({ id: editing.id, name, criteria: criteria() })
        : await createClusterFromCriteria({ name, criteria: criteria(), origin: "segment", mode: "dynamic" });
      if (res.ok) {
        // Chain (create only): offer the hop to the next pipeline step (central/sysadmin only).
        if (!editing && canChain && res.id != null) setCreatedId(res.id);
        else onCreated();
      } else setErr(res.error ?? "Failed");
    });
  };

  return (
    <Modal open onClose={createdId != null ? onCreated : onClose} className="max-w-[560px]">
      <ModalHeader eyebrow={editing ? "Cluster · Edit" : "Cluster"} eyebrowColor="#7DA02E" title={editing ? "Edit cluster" : "Build a cluster"} subtitle={editing ? "Change anything — the new rule saves live" : "Pick filters — membership stays live"} onClose={createdId != null ? onCreated : onClose} />
      <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
        {createdId != null ? (
          <ChainNext message={`Cluster "${name.trim()}" created`} nextLabel="Next: create a project →"
            nextHref={`/projects?withCluster=${createdId}`} onDone={onCreated} />
        ) : (<>
        <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Name</label>
        <input className="mt-1 mb-3 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amethi At-Risk HNI" />

        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[#9E9E9E]">{VALUE_TITLE} (any)<span className="normal-case text-[10px] font-normal text-[#BDBDBD]">· by spend · hover for definition</span></div>
        <div className="mb-3 flex flex-wrap gap-1.5">{VALUE_SEGMENTS.map((s) => { const on = valueSegs.includes(s); const m = segMeta(s); return (
          <button key={s} type="button" title={segDef(s)} onClick={() => toggle(valueSegs, setValueSegs, s)} className="rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold" style={{ background: on ? m.bg : "#fff", color: on ? m.color : "#616161", borderColor: on ? m.color : "#E0E0E0" }}>{m.label}</button>
        ); })}</div>

        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[#9E9E9E]">{LIFECYCLE_TITLE} (any)<span className="normal-case text-[10px] font-normal text-[#BDBDBD]">· by recency · hover for definition</span></div>
        <div className="mb-3 flex flex-wrap gap-1.5">{LIFECYCLE_SEGMENTS.map((s) => { const on = lifecycleSegs.includes(s); const m = segMeta(s); return (
          <button key={s} type="button" title={segDef(s)} onClick={() => toggle(lifecycleSegs, setLifecycleSegs, s)} className="rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold" style={{ background: on ? m.bg : "#fff", color: on ? m.color : "#616161", borderColor: on ? m.color : "#E0E0E0" }}>{m.label}</button>
        ); })}</div>

        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Crop (any of)</span>
          <div className="inline-flex rounded-lg border border-[#E0E0E0] bg-[#F5F7F5] p-0.5">
            {([["any", "Any source"], ["sales", "Bought"], ["visit", "Seen on visit"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setCropSource(k)}
                className="rounded-md px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors"
                style={{ background: cropSource === k ? "#fff" : "transparent", color: cropSource === k ? "#7DA02E" : "#9E9E9E", boxShadow: cropSource === k ? "0 1px 2px rgba(0,0,0,0.12)" : "none" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-1.5 text-[10.5px] text-[#9E9E9E]">
          {cropSource === "sales" ? "Matches farmers who bought this crop's inputs (from sales uploads)."
            : cropSource === "visit" ? "Matches farmers an officer recorded growing this crop (from field visits)."
            : "Matches either source — bought it or seen growing on a visit."}
        </div>
        <CheckDropdown placeholder="Select crops…" searchable
          options={cropOpts.map((c) => ({ value: c.crop, label: cropLabel(c.crop), hint: c.count.toLocaleString("en-IN") }))}
          selected={new Set(crops)}
          onToggle={(v) => toggle(crops, setCrops, v)}
          onSelectAll={() => setCrops(cropOpts.map((c) => c.crop))}
          onClear={() => setCrops([])} />
        <div className="mb-3 flex flex-wrap gap-1.5">{crops.map((c) => (
          <button key={c} type="button" onClick={() => toggle(crops, setCrops, c)} className="rounded-full border-[1.5px] border-[#7DA02E] bg-[#F5F9EA] px-3 py-1 text-[12px] font-semibold text-[#7DA02E]">{cropLabel(c)} ✕</button>
        ))}</div>

        <div className="mb-1.5 text-[11px] font-semibold uppercase text-[#9E9E9E]">Target pest / disease (any of)</div>
        <CheckDropdown placeholder="Select pests / diseases…" searchable
          options={pestOpts.map((p) => ({ value: p.pest, label: tagLabel(p.pest), hint: p.count.toLocaleString("en-IN") }))}
          selected={new Set(pests)}
          onToggle={(v) => toggle(pests, setPests, v)}
          onSelectAll={() => setPests(pestOpts.map((p) => p.pest))}
          onClear={() => setPests([])} />
        <div className="mb-3 flex flex-wrap gap-1.5">{pests.map((p) => (
          <button key={p} type="button" onClick={() => toggle(pests, setPests, p)} className="rounded-full border-[1.5px] border-[#E65100] bg-[#FFF3E0] px-3 py-1 text-[12px] font-semibold text-[#E65100]">{tagLabel(p)} ✕</button>
        ))}</div>


        {/* Districts — multi-select; cascades into the Stores picker below */}
        <div className="mb-1.5 text-[11px] font-semibold uppercase text-[#9E9E9E]">Districts (any of)</div>
        <CheckDropdown placeholder="Select districts…" searchable
          options={zones.map((z) => ({ value: z, label: z }))}
          selected={new Set(zoneList)}
          onToggle={toggleZone}
          onSelectAll={() => setZoneList([...zones])}
          onClear={() => setZoneList([])} />
        {zoneList.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">{zoneList.map((z) => (
            <button key={z} type="button" onClick={() => toggleZone(z)} className="rounded-full border-[1.5px] border-[#7DA02E] bg-[#F5F9EA] px-3 py-1 text-[12px] font-semibold text-[#7DA02E]">{z} ✕</button>
          ))}</div>
        )}

        {/* Stores — cascading multi-select, filtered by the selected regions */}
        <div className="mb-1.5 text-[11px] font-semibold uppercase text-[#9E9E9E]">Stores (any of){zoneList.length > 0 ? ` · in ${zoneList.length} district${zoneList.length > 1 ? "s" : ""}` : ""}</div>
        <CheckDropdown placeholder="Select stores…" searchable
          options={availStores.map((s) => ({ value: String(s.id), label: s.name }))}
          selected={new Set(storeIds.map(String))}
          onToggle={(v) => toggleStore(Number(v))}
          onSelectAll={() => setStoreIds(availStores.map((s) => s.id))}
          onClear={() => setStoreIds([])} />
        {storeIds.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">{storeIds.map((id) => { const s = storeById.get(id); return (
            <button key={id} type="button" onClick={() => toggleStore(id)} className="rounded-full border-[1.5px] border-[#1565C0] bg-[#E3F2FD] px-3 py-1 text-[12px] font-semibold text-[#1565C0]">{s ? shortStoreName(s.name) : `#${id}`} ✕</button>
          ); })}</div>
        )}

        {/* Search */}
        <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Search</label>
        <input className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-2.5 py-2 text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name / village / mobile" />

        {/* WhatsApp opt-in */}
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-[#E9F2CF] bg-[#F1F8F1] px-3 py-2 text-[12.5px] font-semibold text-[#66852A]">
          <input type="checkbox" checked={waOptIn} onChange={(e) => setWaOptIn(e.target.checked)} style={{ accentColor: "#0B8A3D" }} />
          ⚡ WhatsApp opted-in only
        </label>

        <div className="mt-4 flex items-center justify-between rounded-[10px] bg-[#F5F7F5] px-4 py-3">
          <div className="text-[12px] text-[#616161]">Matches</div>
          <div className="text-[18px] font-bold text-[#7DA02E]">{!hasAny ? "—" : counting ? "…" : n(count ?? 0)}</div>
        </div>
        {err && <div className="mt-2 text-[12px] text-[#C62828]">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !name.trim() || !hasAny || !count} className="rounded-[10px] bg-[#7DA02E] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : editing ? "Save changes" : "Create cluster"}</button>
        </div>
        </>)}
      </div>
    </Modal>
  );
}

/* ── Members viewer ── */
function MembersModal({ cluster, onClose }: { cluster: ClusterVM; onClose: () => void }) {
  const [data, setData] = useState<ClusterMembersResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  useEffect(() => { getClusterFarmers(cluster.id, 1).then(setData); }, [cluster.id]);

  const doExport = async () => {
    setExporting(true); setExportErr(null);
    try {
      const res = await exportClusterFarmersXlsx(cluster.id);
      if (res.ok && res.b64 && res.filename) downloadB64(res.b64, res.filename);
      else setExportErr(res.error ?? "Export failed.");
    } catch { setExportErr("Export failed."); }
    finally { setExporting(false); }
  };

  return (
    <Modal open onClose={onClose} className="max-w-[900px]">
      <ModalHeader eyebrow={cluster.description} eyebrowColor="#7DA02E" title={cluster.name}
        subtitle={`${n(cluster.count)} farmers · live${cluster.createdBy ? ` · created by ${cluster.createdBy}${cluster.createdByCode ? ` (${cluster.createdByCode})` : ""}` : ""}${cluster.createdAt ? ` · ${fmtDate(cluster.createdAt)}` : ""}`}
        onClose={onClose} />
      <div className="flex items-center justify-between gap-2 border-b border-[#F0F0F0] px-5 py-2.5">
        <span className="text-[11.5px] text-[#9E9E9E]">Ranked by past-12-month spend</span>
        <div className="flex items-center gap-2">
          {exportErr && <span className="text-[11px] font-semibold text-[#C62828]">{exportErr}</span>}
          <button type="button" onClick={doExport} disabled={exporting || !data}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#66852A] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#7DA02E] disabled:opacity-50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        </div>
      </div>
      <div className="max-h-[64vh] overflow-y-auto px-5 py-4">
        {!data ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">Loading…</div>
          : data.rows.length === 0 ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">No members.</div>
          : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead><tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]"><th className="py-2">Farmer</th><th>Store</th><th>Village</th><th>Crop</th><th>Value segment</th><th>Lifecycle</th><th className="text-right" title={(data.ltvLabel ?? "LTV") !== "LTV" ? "Spend on this crop only — the value segment is the farmer's overall tier" : undefined}>{data.ltvLabel ?? "LTV"}</th></tr></thead>
              <tbody>{data.rows.map((f) => (
                <tr key={f.id} className="border-b border-[#F5F5F5]">
                  <td className="py-2 font-semibold text-[#1A1C1A]">{f.name}</td>
                  <td className="text-[#1565C0]">{f.store}</td>
                  <td className="text-[#616161]">{f.village}</td>
                  <td className="max-w-[240px] text-[#616161]">
                    {f.crops.length === 0 ? "—" : (
                      <span title={f.crops.join(", ")} className="cursor-default">
                        {f.crops.slice(0, 3).join(", ")}
                        {f.crops.length > 3 && (
                          <span className="ml-1 inline-block whitespace-nowrap rounded bg-[#EEF3EE] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#7DA02E]">+{f.crops.length - 3} more</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="text-[#616161]"><InfoTip term={f.segment}>{f.segment}</InfoTip></td>
                  <td className="text-[#616161]"><InfoTip term={f.lifecycle}>{f.lifecycle}</InfoTip></td>
                  <td className="text-right font-semibold text-[#1A1C1A]">{f.ltv}</td>
                </tr>
              ))}</tbody>
            </table>
            {data.total > data.rows.length && <div className="mt-2 text-[11px] text-[#9E9E9E]">Showing first {data.rows.length} of {n(data.total)}.</div>}
            </div>
          )}
      </div>
    </Modal>
  );
}
