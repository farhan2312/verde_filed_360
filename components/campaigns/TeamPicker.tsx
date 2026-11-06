"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TeamOfficer, TeamCampaigner } from "@/lib/campaign-team";
import { shortStoreName as shortStore } from "@/lib/store-utils";

export interface TeamValue { officerIds: number[]; campaignerIds: number[] }

const CHIP_LIMIT = 24;

/**
 * "Who works this campaign?" — selected people as tiles on top, then a searchable dropdown grouped into
 * officers of the campaign's stores (own-store access), other officers and campaigners (whole campaign).
 */
export function TeamPicker({ officers, campaigners, storeIds, value, onChange, defaultOfficerIds }: {
  officers: TeamOfficer[]; campaigners: TeamCampaigner[];
  storeIds: number[]; // stores with farmers in this campaign
  value: TeamValue; onChange: (v: TeamValue) => void;
  defaultOfficerIds: number[]; // officers of the campaign's stores (for "Reset to store officers")
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showAllChips, setShowAllChips] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    search.current?.focus();
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const inCampaign = new Set(storeIds);
  const offSel = new Set(value.officerIds), camSel = new Set(value.campaignerIds);
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (...fields: (string | null)[]) => terms.every((t) => fields.some((f) => f?.toLowerCase().includes(t)));
  const local = officers.filter((o) => o.storeId != null && inCampaign.has(o.storeId) && hit(o.name, o.code, o.storeName));
  const other = officers.filter((o) => !(o.storeId != null && inCampaign.has(o.storeId)) && hit(o.name, o.code, o.storeName));
  const cams = campaigners.filter((c) => hit(c.name, c.code, "campaigner"));

  const toggleOfficer = (id: number) => onChange({ ...value, officerIds: offSel.has(id) ? value.officerIds.filter((x) => x !== id) : [...value.officerIds, id] });
  const toggleCampaigner = (id: number) => onChange({ ...value, campaignerIds: camSel.has(id) ? value.campaignerIds.filter((x) => x !== id) : [...value.campaignerIds, id] });
  const addOfficers = (ids: number[]) => onChange({ ...value, officerIds: [...new Set([...value.officerIds, ...ids])] });
  const dropOfficers = (ids: number[]) => { const d = new Set(ids); onChange({ ...value, officerIds: value.officerIds.filter((x) => !d.has(x)) }); };
  const addCampaigners = (ids: number[]) => onChange({ ...value, campaignerIds: [...new Set([...value.campaignerIds, ...ids])] });
  const dropCampaigners = (ids: number[]) => { const d = new Set(ids); onChange({ ...value, campaignerIds: value.campaignerIds.filter((x) => !d.has(x)) }); };

  const chips = [
    ...officers.filter((o) => offSel.has(o.id)).map((o) => ({ key: `o${o.id}`, label: o.name, sub: o.storeName ? shortStore(o.storeName) : "No store", whole: !(o.storeId != null && inCampaign.has(o.storeId)), campaigner: false, remove: () => toggleOfficer(o.id) })),
    ...campaigners.filter((c) => camSel.has(c.id)).map((c) => ({ key: `c${c.id}`, label: c.name, sub: "Campaigner", whole: true, campaigner: true, remove: () => toggleCampaigner(c.id) })),
  ];
  const shownChips = showAllChips ? chips : chips.slice(0, CHIP_LIMIT);
  const total = value.officerIds.length + value.campaignerIds.length;

  const group = ({ title, note, items, onAll, onNone, children }: { title: string; note: string; items: number; onAll: () => void; onNone: () => void; children: ReactNode }) => (
    <div key={title}>
      <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-[#F0F0F0] bg-[#FAFAFA] px-3 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#616161]">{title}</span>
        <span className="text-[10.5px] text-[#9E9E9E]">{note}</span>
        <span className="ml-auto flex gap-2.5 text-[11px] font-semibold">
          <button type="button" onClick={onAll} disabled={!items} className="text-[#7DA02E] disabled:opacity-40">Select all</button>
          <button type="button" onClick={onNone} disabled={!items} className="text-[#C62828] disabled:opacity-40">Clear</button>
        </span>
      </div>
      {items ? children : <div className="px-3 py-2 text-[12px] text-[#9E9E9E]">{terms.length ? "No match." : "None."}</div>}
    </div>
  );
  const row = ({ key, on, onToggle, name, code, sub }: { key: string; on: boolean; onToggle: () => void; name: string; code: string | null; sub: string }) => (
    <label key={key} className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-[#F5F7F5] ${on ? "bg-[#F1F8F1]" : ""}`}>
      <input type="checkbox" checked={on} onChange={onToggle} className="h-4 w-4 shrink-0 accent-[#7DA02E]" />
      <span className="min-w-0 flex-1 truncate">{name}{code ? <span className="ml-1.5 text-[11px] text-[#9E9E9E]">{code}</span> : null}</span>
      <span className="max-w-[45%] shrink-0 truncate text-[11.5px] text-[#757575]" title={sub}>{sub}</span>
    </label>
  );

  return (
    <div ref={box} className="relative mt-1.5">
      {/* Selected tiles */}
      <div className="rounded-[10px] border border-[#E0E0E0] bg-white p-2">
        {chips.length ? (
          <div className="flex flex-wrap gap-1.5">
            {shownChips.map((c) => (
              <span key={c.key} title={c.whole ? "Works the whole campaign" : "Works their own store's farmers"}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-[8px] border py-1 pl-2.5 pr-1 text-[12px] ${c.campaigner ? "border-[#B2EBF2] bg-[#E0F7FA] text-[#00695C]" : c.whole ? "border-[#E1BEE7] bg-[#F3E5F5] text-[#6A1B9A]" : "border-[#E9F2CF] bg-[#F5F9EA] text-[#66852A]"}`}>
                <span className="min-w-0">
                  <span className="block truncate font-semibold leading-tight">{c.campaigner ? "📞 " : ""}{c.label}</span>
                  <span className="block truncate text-[10.5px] leading-tight opacity-80">{c.sub}{c.whole && !c.campaigner ? " · whole campaign" : ""}</span>
                </span>
                <button type="button" onClick={c.remove} aria-label={`Remove ${c.label}`} className="rounded-[6px] px-1.5 text-[14px] leading-none hover:bg-black/[0.06]">×</button>
              </span>
            ))}
            {chips.length > CHIP_LIMIT && (
              <button type="button" onClick={() => setShowAllChips((v) => !v)} className="rounded-[8px] border border-dashed border-[#BDBDBD] px-2.5 py-1 text-[12px] font-semibold text-[#616161]">
                {showAllChips ? "Show less" : `+${chips.length - CHIP_LIMIT} more`}
              </button>
            )}
          </div>
        ) : (
          <div className="px-1 py-1 text-[12.5px] text-[#C62828]">Nobody selected — pick at least one person to work this campaign.</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#F5F5F5] pt-2">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="rounded-[8px] border-[1.5px] border-[#7DA02E] px-3 py-1 text-[12px] font-semibold text-[#7DA02E] hover:bg-[#F5F9EA]">
            {open ? "Done" : "+ Add / remove people"}
          </button>
          <button type="button" onClick={() => onChange({ officerIds: defaultOfficerIds, campaignerIds: [] })}
            className="text-[11.5px] font-semibold text-[#757575] hover:text-[#7DA02E]">Reset to store officers</button>
          <span className="ml-auto text-[11.5px] text-[#757575]">{value.officerIds.length} officer{value.officerIds.length === 1 ? "" : "s"} · {value.campaignerIds.length} campaigner{value.campaignerIds.length === 1 ? "" : "s"} · {total} total</span>
        </div>
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-[10px] border border-[#E0E0E0] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <div className="border-b border-[#F0F0F0] p-2">
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, code or store…"
              className="w-full rounded-md border border-[#E0E0E0] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#7DA02E]" />
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {group({
              title: "Officers of this campaign's stores", note: "call their own store's farmers", items: local.length,
              onAll: () => addOfficers(local.map((o) => o.id)), onNone: () => dropOfficers(local.map((o) => o.id)),
              children: local.map((o) => row({ key: `o${o.id}`, on: offSel.has(o.id), onToggle: () => toggleOfficer(o.id), name: o.name, code: o.code, sub: shortStore(o.storeName) })),
            })}
            {group({
              title: "Other officers", note: "work the whole campaign", items: other.length,
              onAll: () => addOfficers(other.map((o) => o.id)), onNone: () => dropOfficers(other.map((o) => o.id)),
              children: other.map((o) => row({ key: `o${o.id}`, on: offSel.has(o.id), onToggle: () => toggleOfficer(o.id), name: o.name, code: o.code, sub: o.storeName ? shortStore(o.storeName) : "No store" })),
            })}
            {group({
              title: "Campaigners", note: "work the whole campaign", items: cams.length,
              onAll: () => addCampaigners(cams.map((c) => c.id)), onNone: () => dropCampaigners(cams.map((c) => c.id)),
              children: cams.map((c) => row({ key: `c${c.id}`, on: camSel.has(c.id), onToggle: () => toggleCampaigner(c.id), name: c.name, code: c.code, sub: "Campaigner" })),
            })}
          </div>
        </div>
      )}
      <p className="mt-1.5 text-[10.5px] text-[#9E9E9E]">
        <span className="font-semibold text-[#66852A]">Green</span> = calls their own store's farmers · <span className="font-semibold text-[#6A1B9A]">purple</span> / <span className="font-semibold text-[#00695C]">teal</span> = works the whole campaign. Unselected officers won't see it. RMs always see campaigns in their stores.
      </p>
    </div>
  );
}
