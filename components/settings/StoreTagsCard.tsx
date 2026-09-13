"use client";

import { useState, useTransition } from "react";
import { createStoreTag, updateStoreTag, deleteStoreTag, type StoreTagVM } from "@/app/actions/store-tags";
import { useConfirm } from "@/components/ConfirmDialog";

const PALETTE = ["#7DA02E", "#1565C0", "#E65100", "#6A1B9A", "#00838F", "#C62828", "#EDA942", "#546E7A"];

/** Settings → Store tags catalog. Create / rename / recolor / delete the tags RMs & admins assign to stores. */
export function StoreTagsCard({ initial }: { initial: StoreTagVM[] }) {
  const [tags, setTags] = useState(initial);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const { confirm, dialog } = useConfirm();

  const add = () => start(async () => {
    setErr(null);
    const r = await createStoreTag(name, color);
    if (!r.ok) { setErr(r.error ?? "Failed."); return; }
    setName("");
    // Optimistic-ish: append a temp; a refresh action would be heavier. Reload the row from server list instead.
    setTags((t) => [...t, { id: Math.max(0, ...t.map((x) => x.id)) + 1, name: name.trim(), color, sortOrder: t.length }]);
  });
  const recolor = (id: number, c: string) => start(async () => {
    setTags((t) => t.map((x) => (x.id === id ? { ...x, color: c } : x)));
    await updateStoreTag(id, { color: c });
  });
  const rename = (id: number, nm: string) => start(async () => {
    const r = await updateStoreTag(id, { name: nm });
    if (!r.ok) setErr(r.error ?? "Rename failed.");
    else setTags((t) => t.map((x) => (x.id === id ? { ...x, name: nm } : x)));
  });
  const remove = (tag: StoreTagVM) => start(async () => {
    if (!(await confirm({ title: "Delete this tag?", confirmLabel: "Delete tag", message: <><b>{tag.name}</b> will be removed from the catalog and unassigned from every store. This can’t be undone.</> }))) return;
    const r = await deleteStoreTag(tag.id);
    if (r.ok) setTags((t) => t.filter((x) => x.id !== tag.id)); else setErr(r.error ?? "Delete failed.");
  });

  const inputCls = "rounded-[10px] border border-[#E0E0E0] px-3 py-2 text-[13px] outline-none focus:border-[#0B8A3D]";

  return (
    <div className="rounded-2xl border border-black/[0.03] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {dialog}
      <div className="mb-1 text-[15px] font-bold text-[#1A1C1A]">Store tags</div>
      <p className="mb-4 text-[12px] text-[#9E9E9E]">Define the tags that Regional Managers &amp; admins can assign to stores (from the Map). Tags power the store-tag filter across analytics. A store can carry several.</p>

      {/* Add */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-[#ECEFEC] bg-[#FAFBFA] p-3">
        <input className={`${inputCls} min-w-[160px] flex-1`} placeholder="New tag name (e.g. Priority)" value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) add(); }} />
        <div className="flex items-center gap-1">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} title={c}
              className="h-6 w-6 rounded-full border-2" style={{ background: c, borderColor: color === c ? "#1A1C1A" : "transparent" }} />
          ))}
        </div>
        <button type="button" onClick={add} disabled={busy || !name.trim()}
          className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#66852A] disabled:opacity-50">Add tag</button>
      </div>
      {err && <div className="mb-2 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}

      {/* List */}
      {tags.length === 0 ? (
        <div className="rounded-[10px] bg-[#FAFBFA] px-3 py-6 text-center text-[12.5px] text-[#9E9E9E]">No tags yet — add one above.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {tags.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#F0F0F0] px-3 py-2">
              <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: t.color }} />
              <input defaultValue={t.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) rename(t.id, v); }}
                className="min-w-0 flex-1 rounded-[8px] border border-transparent px-2 py-1 text-[13px] font-semibold text-[#1A1C1A] hover:border-[#E0E0E0] focus:border-[#0B8A3D] outline-none" />
              <div className="flex items-center gap-1">
                {PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => recolor(t.id, c)} title={c}
                    className="h-5 w-5 rounded-full border-2" style={{ background: c, borderColor: t.color === c ? "#1A1C1A" : "transparent" }} />
                ))}
              </div>
              <button type="button" onClick={() => remove(t)} disabled={busy} className="text-[11.5px] font-semibold text-[#C62828] hover:underline disabled:opacity-50">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
