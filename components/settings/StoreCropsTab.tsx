"use client";

import { useState, useTransition } from "react";
import { cropLabel } from "@/lib/crops";
import { shortStoreName } from "@/lib/store-utils";
import { updateStoreCrops, type StoreCropRow } from "@/app/actions/store-crops";
import { CROP_SOURCE_TINT } from "@/lib/crop-sources";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const STORE_CROP = CROP_SOURCE_TINT.store; // store-region crops wear gold everywhere
const n = (x: number) => x.toLocaleString("en-IN");

/**
 * Settings → Store crops (System admin). Set the crops generally grown around each store; every farmer
 * attached to the store is treated as growing them (cluster "Store region" source + Farmer 360).
 * One store at a time (chips + "add crop"), or tick several stores / a whole region and add, remove
 * or replace crops in one go.
 */
export function StoreCropsTab({ initial, cropOptions }: { initial: StoreCropRow[]; cropOptions: { crop: string; count: number }[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulkCrops, setBulkCrops] = useState<string[]>([]);
  const [cropQ, setCropQ] = useState("");
  const [custom, setCustom] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Every crop known anywhere: sales/visit crops + crops already set on stores.
  const allCrops = [...new Set([...cropOptions.map((c) => c.crop), ...rows.flatMap((r) => r.crops)])].sort((a, b) => cropLabel(a).localeCompare(cropLabel(b)));
  const zones = [...new Set(rows.map((r) => r.zone).filter((z): z is string => !!z))].sort();
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => (!zone || r.zone === zone) && terms.every((t) => `${r.code} ${r.name} ${r.zone ?? ""} ${r.crops.join(" ")}`.toLowerCase().includes(t)));
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  const apply = (storeIds: number[], crops: string[], mode: "add" | "remove" | "replace", done?: () => void) => {
    setMsg(null);
    start(async () => {
      const res = await updateStoreCrops(storeIds, crops, mode);
      if (!res.ok || !res.updated) { setMsg({ ok: false, text: res.error ?? "Save failed." }); return; }
      const next = new Map(res.updated.map((u) => [u.id, u.crops]));
      setRows((list) => list.map((r) => (next.has(r.id) ? { ...r, crops: next.get(r.id)! } : r)));
      if (storeIds.length > 1) setMsg({ ok: true, text: `Updated ${storeIds.length} stores.` });
      done?.();
    });
  };

  const togglePick = (id: number) => setPicked((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const pickShown = () => setPicked((s) => { const x = new Set(s); if (allShownPicked) shown.forEach((r) => x.delete(r.id)); else shown.forEach((r) => x.add(r.id)); return x; });
  const toggleBulkCrop = (c: string) => setBulkCrops((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  const addCustom = () => { const c = custom.trim(); if (c && !bulkCrops.includes(c)) setBulkCrops((l) => [...l, c]); setCustom(""); };
  const cropShown = allCrops.filter((c) => cropLabel(c).toLowerCase().includes(cropQ.trim().toLowerCase()));
  const sel = [...picked];
  const tagged = rows.filter((r) => r.crops.length).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-[18px]">
      <div className={`${CARD} p-5`}>
        <div className="text-[15px] font-bold text-[#1A1C1A]">Store crops</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#616161]">
          The crops generally grown around each store. Every farmer attached to a store is treated as growing them —
          the cluster builder can match on them (the <b>Store region</b> source) and Farmer 360 shows them in
          <span className="mx-1 rounded-full px-1.5 py-px text-[11px] font-semibold" style={{ background: STORE_CROP.bg, color: STORE_CROP.color }}>amber</span>
          next to sales (green) and visit (blue) crops. Farmers with no store get none.
          They don&apos;t change the Farmers page crop filter or analytics.
        </p>
        <div className="mt-2 text-[12px] text-[#9E9E9E]">{n(tagged)} of {n(rows.length)} stores have crops set.</div>
      </div>

      {/* Bulk editor — appears once stores are ticked */}
      {sel.length > 0 && (
        <div className={`${CARD} sticky top-2 z-10 border-[#EDA942]/40 p-4`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-[#1A1C1A]">{sel.length} store{sel.length > 1 ? "s" : ""} selected</span>
            <button type="button" onClick={() => setPicked(new Set())} className="text-[12px] font-semibold text-[#757575] hover:underline">Clear selection</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={cropQ} onChange={(e) => setCropQ(e.target.value)} placeholder="Search crops…"
              className="w-[180px] rounded-lg border border-[#E0E0E0] px-2.5 py-1.5 text-[12.5px]" />
            <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} placeholder="Other crop…"
              className="w-[150px] rounded-lg border border-[#E0E0E0] px-2.5 py-1.5 text-[12.5px]" />
            <button type="button" onClick={addCustom} disabled={!custom.trim()} className="rounded-lg border border-[#E0E0E0] px-2.5 py-1.5 text-[12px] font-semibold text-[#616161] disabled:opacity-40">+ Add</button>
          </div>
          <div className="mt-2 flex max-h-[140px] flex-wrap gap-1.5 overflow-y-auto">
            {[...new Set([...bulkCrops, ...cropShown])].map((c) => {
              const on = bulkCrops.includes(c);
              return (
                <button key={c} type="button" onClick={() => toggleBulkCrop(c)}
                  className="rounded-full border-[1.5px] px-2.5 py-0.5 text-[12px] font-semibold"
                  style={{ background: on ? STORE_CROP.bg : "#fff", color: on ? STORE_CROP.color : "#616161", borderColor: on ? STORE_CROP.ring : "#E0E0E0" }}>
                  {on ? "✓ " : ""}{cropLabel(c)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={pending || !bulkCrops.length} onClick={() => apply(sel, bulkCrops, "add", () => setBulkCrops([]))}
              className="rounded-[10px] bg-brand-600 px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-40">Add to {sel.length} store{sel.length > 1 ? "s" : ""}</button>
            <button type="button" disabled={pending || !bulkCrops.length} onClick={() => apply(sel, bulkCrops, "remove", () => setBulkCrops([]))}
              className="rounded-[10px] border border-danger bg-white px-3.5 py-2 text-[12.5px] font-bold text-danger disabled:opacity-40">Remove from {sel.length}</button>
            <button type="button" disabled={pending} onClick={() => apply(sel, bulkCrops, "replace", () => setBulkCrops([]))}
              title={bulkCrops.length ? "Set exactly these crops on the selected stores" : "Clear all crops from the selected stores"}
              className="rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2 text-[12.5px] font-bold text-[#455A64] disabled:opacity-40">{bulkCrops.length ? `Replace on ${sel.length}` : `Clear crops on ${sel.length}`}</button>
          </div>
        </div>
      )}

      {msg && <div className={`rounded-[10px] px-3 py-2 text-[12.5px] font-semibold ${msg.ok ? "bg-brand-50 text-brand-700" : "bg-danger-50 text-danger"}`}>{msg.text}</div>}

      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#F0F0F0] p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store, code or crop…"
            className="min-w-[200px] flex-1 rounded-lg border border-[#E0E0E0] px-2.5 py-1.5 text-[13px]" />
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[13px]">
            <option value="">All regions</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <button type="button" onClick={pickShown} disabled={!shown.length} className="rounded-lg border border-[#E0E0E0] px-3 py-1.5 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F7F5] disabled:opacity-40">
            {allShownPicked ? "Untick shown" : `Tick all ${shown.length} shown`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="bg-[#FAFAFA] text-left text-[10.5px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]">
                <th className="w-8 px-3 py-2"><input type="checkbox" checked={allShownPicked} onChange={pickShown} className="h-4 w-4 accent-[#7DA02E]" aria-label="Tick all shown" /></th>
                <th className="px-2 py-2">Store</th>
                <th className="px-2 py-2">Region</th>
                <th className="px-2 py-2 text-right">Farmers</th>
                <th className="px-2 py-2">Crops grown around the store</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`border-t border-[#F5F5F5] align-top ${picked.has(r.id) ? "bg-[#FEFBF2]" : ""}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={picked.has(r.id)} onChange={() => togglePick(r.id)} className="h-4 w-4 accent-[#7DA02E]" aria-label={`Select ${r.name}`} /></td>
                  <td className="px-2 py-2">
                    <div className="font-semibold text-[#1A1C1A]">{shortStoreName(r.name) || r.name}</div>
                    <div className="text-[10.5px] text-[#9E9E9E]">{r.code}</div>
                  </td>
                  <td className="px-2 py-2 text-[#616161]">{r.zone ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[#616161]">{n(r.farmers)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {r.crops.map((c) => (
                        <span key={c} className="inline-flex items-center gap-0.5 rounded-full py-0.5 pl-2 pr-1 text-[11.5px] font-semibold" style={{ background: STORE_CROP.bg, color: STORE_CROP.color }}>
                          {cropLabel(c)}
                          <button type="button" disabled={pending} onClick={() => apply([r.id], [c], "remove")} aria-label={`Remove ${cropLabel(c)}`}
                            className="rounded-full px-1 leading-none hover:bg-black/5 disabled:opacity-40">×</button>
                        </span>
                      ))}
                      <select value="" disabled={pending} onChange={(e) => { if (e.target.value) apply([r.id], [e.target.value], "add"); }}
                        className="rounded-full border border-dashed border-[#BDBDBD] bg-white px-2 py-0.5 text-[11.5px] text-[#757575]" aria-label={`Add crop to ${r.name}`}>
                        <option value="">+ crop</option>
                        {allCrops.filter((c) => !r.crops.includes(c)).map((c) => <option key={c} value={c}>{cropLabel(c)}</option>)}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[13px] text-[#9E9E9E]">No store matches.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
