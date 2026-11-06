"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import {
  getHelperCandidates, getHelperStores, listCampaignHelpers,
  saveCampaignHelper, removeCampaignHelper,
  type HelperCandidate, type HelperStoreOption, type CampaignHelperVM,
} from "@/app/actions/campaign-helpers";

/** Searchable single-select of people (officers / RMs) to lend to the campaign. */
function PersonPicker({ options, value, onPick }: {
  options: HelperCandidate[]; value: number | null; onPick: (id: number) => void;
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
  const sel = options.find((o) => o.id === value) ?? null;
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => `${o.name} ${o.employeeCode ?? ""} ${o.storeName ?? ""}`.toLowerCase().includes(needle))
    : options;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-left text-[13px]">
        <span className={sel ? "text-[#1A1C1A]" : "text-[#9E9E9E]"}>
          {sel ? `${sel.name}${sel.employeeCode ? ` · ${sel.employeeCode}` : ""}` : "Pick a person to lend…"}
        </span>
        <span className="ml-2 text-[10px] text-[#9E9E9E]">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-[#E0E0E0] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.14)]">
          <div className="border-b border-[#F0F0F0] p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code / store…"
              className="w-full rounded-md border border-[#E0E0E0] px-2 py-1.5 text-[12px]" />
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-3 py-3 text-center text-[12px] text-[#9E9E9E]">No matches</div>
            ) : shown.map((o) => (
              <button key={o.id} type="button" onClick={() => { onPick(o.id); setOpen(false); setQ(""); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-[#F5F7F5]">
                <span className="min-w-0">
                  <span className="font-semibold text-[#1A1C1A]">{o.name}</span>
                  <span className="ml-1.5 text-[11px] text-[#9E9E9E]">{o.roleLabel}{o.storeName ? ` · ${o.storeName}` : ""}</span>
                </span>
                {o.employeeCode && <span className="shrink-0 text-[10.5px] text-[#9E9E9E]">{o.employeeCode}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Searchable multi-select of stores the helper will cover, with Select-all / Clear-all. */
function StoreMultiPicker({ options, selected, onToggle, onSelectAll, onClear }: {
  options: HelperStoreOption[]; selected: Set<number>;
  onToggle: (id: number) => void; onSelectAll: () => void; onClear: () => void;
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
  const shown = needle ? options.filter((o) => `${o.name} ${o.zone ?? ""}`.toLowerCase().includes(needle)) : options;
  const allOn = options.length > 0 && selected.size === options.length;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-left text-[13px]">
        <span className={selected.size ? "text-[#1A1C1A]" : "text-[#9E9E9E]"}>{selected.size ? `${selected.size} store${selected.size > 1 ? "s" : ""} selected` : "Pick the stores they'll cover…"}</span>
        <span className="ml-2 text-[10px] text-[#9E9E9E]">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-[#E0E0E0] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.14)]">
          <div className="border-b border-[#F0F0F0] p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stores…"
              className="w-full rounded-md border border-[#E0E0E0] px-2 py-1.5 text-[12px]" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 border-b border-[#F0F0F0] bg-[#FAFBFA] px-3 py-2 text-[12px] font-semibold text-[#7DA02E]">
            <input type="checkbox" checked={allOn}
              ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allOn; }}
              onChange={() => (allOn ? onClear() : onSelectAll())} className="h-3.5 w-3.5 accent-[#7DA02E]" />
            {allOn ? "Clear all" : "Select all"}{options.length ? ` (${options.length})` : ""}
          </label>
          <div className="max-h-[200px] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-3 py-3 text-center text-[12px] text-[#9E9E9E]">No matches</div>
            ) : shown.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-[#F5F7F5]">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} className="h-3.5 w-3.5 accent-[#7DA02E]" />
                <span className="flex-1 text-[#1A1C1A]">{o.name}</span>
                {o.status !== "Active" && <span className="rounded-full bg-[#FDECEA] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#C62828]">Closed</span>}
                {o.zone && <span className="text-[10.5px] text-[#9E9E9E]">{o.zone}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Manage the field users lent to a campaign ("helpers"). A helper keeps their normal role everywhere
 * else, but on THIS campaign they can call + mark-reached + comment on the named stores' TEST farmers —
 * even though those stores aren't their own. Central/sysadmin only (the campaign managers).
 */
export function HelpersModal({ campaignId, campaignName, onClose }: { campaignId: number; campaignName: string; onClose: () => void }) {
  const [candidates, setCandidates] = useState<HelperCandidate[] | null>(null);
  const [stores, setStores] = useState<HelperStoreOption[]>([]);
  const [helpers, setHelpers] = useState<CampaignHelperVM[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [storeIds, setStoreIds] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const reload = () => listCampaignHelpers(campaignId).then(setHelpers);
  useEffect(() => {
    getHelperCandidates().then(setCandidates);
    getHelperStores().then(setStores);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const selectedStores = useMemo(() => new Set(storeIds), [storeIds]);
  const editing = helpers.find((h) => h.userId === userId) ?? null;

  // Picking a person who's already a helper pre-loads their current stores so the form reads as an edit.
  const pickPerson = (id: number) => {
    setUserId(id);
    const existing = helpers.find((h) => h.userId === id);
    setStoreIds(existing ? [...existing.storeIds] : []);
    setErr(null);
  };
  const toggleStore = (id: number) => setStoreIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = () => {
    setErr(null);
    start(async () => {
      const res = await saveCampaignHelper({ campaignId, userId: userId ?? 0, storeIds });
      if (res.ok) { setUserId(null); setStoreIds([]); reload(); }
      else setErr(res.error ?? "Could not save.");
    });
  };
  const remove = (id: number) => start(async () => { await removeCampaignHelper(id); reload(); });

  return (
    <Modal open onClose={onClose} className="max-w-[640px]">
      <ModalHeader eyebrow="Campaign · helpers" eyebrowColor="#00838F" title={campaignName}
        subtitle="Lend an officer / RM to this campaign to cover named stores — they can call + mark reached + comment on those stores' farmers, nothing else changes" onClose={onClose} />
      <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
        {/* Current helpers */}
        <div className="mb-1.5 text-[11px] font-semibold uppercase text-[#9E9E9E]">Lent to this campaign</div>
        {helpers.length === 0 ? (
          <div className="mb-4 rounded-[10px] border border-dashed border-[#E0E0E0] px-3.5 py-4 text-center text-[12.5px] text-[#9E9E9E]">
            No helpers yet. Add one below to let someone support this campaign outside their own store.
          </div>
        ) : (
          <div className="mb-4 overflow-hidden rounded-[10px] border border-[#EEEEEE]">
            {helpers.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 border-b border-[#F5F5F5] px-3 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#1A1C1A]">{h.name}{h.employeeCode ? <span className="ml-1.5 text-[11px] font-normal text-[#9E9E9E]">{h.employeeCode}</span> : null}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10.5px] text-[#9E9E9E]">{h.roleLabel} · covers</span>
                    {h.storeNames.map((s) => (
                      <span key={s} className="rounded-full bg-[#E0F7FA] px-2 py-0.5 text-[10px] font-semibold text-[#00838F]">{s}</span>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => pickPerson(h.userId)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#455A64] hover:bg-[#ECEFF1]">Edit</button>
                <button type="button" onClick={() => remove(h.id)} disabled={saving} className="rounded-[8px] bg-[#FDECEA] px-3 py-1.5 text-[12px] font-semibold text-[#C62828] hover:bg-[#F9DCD8] disabled:opacity-50">Remove</button>
              </div>
            ))}
          </div>
        )}

        {/* Add / edit a helper */}
        <div className="rounded-[12px] border border-[#E0F2F4] bg-[#F7FDFE] p-3.5">
          <div className="mb-2 text-[12px] font-bold text-[#00838F]">{editing ? "Edit helper" : "Add a helper"}</div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-[#9E9E9E]">Person</div>
          <div className="mb-3">
            {candidates == null ? <div className="text-[12px] text-[#9E9E9E]">Loading people…</div>
              : <PersonPicker options={candidates} value={userId} onPick={pickPerson} />}
          </div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-[#9E9E9E]">Stores they'll cover (any of)</div>
          <div className="mb-3">
            <StoreMultiPicker options={stores} selected={selectedStores} onToggle={toggleStore}
              onSelectAll={() => setStoreIds(stores.map((s) => s.id))} onClear={() => setStoreIds([])} />
          </div>
          {err && <div className="mb-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={saving || userId == null || storeIds.length === 0}
              className="rounded-[10px] bg-[#00838F] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : editing ? "Update helper" : "Add helper"}
            </button>
            {(userId != null || storeIds.length > 0) && (
              <button type="button" onClick={() => { setUserId(null); setStoreIds([]); setErr(null); }}
                className="rounded-[10px] bg-[#F5F7F5] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
