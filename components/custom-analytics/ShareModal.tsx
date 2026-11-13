"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { getShareCandidates, setReportShares, type ShareCandidate } from "@/app/actions/custom-analytics";

/** Pick the existing users a report is shared with (view-only; they see it in their own scope). */
export function ShareModal({ reportId, title, initial, onClose, onSaved }: { reportId: number; title: string; initial: number[]; onClose: () => void; onSaved: (ids: number[]) => void }) {
  const [cands, setCands] = useState<ShareCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set(initial));
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, start] = useTransition();
  useEffect(() => { getShareCandidates().then(setCands); }, []);

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (cands ?? []).filter((c) => terms.every((t) => `${c.name} ${c.code ?? ""} ${c.role} ${c.store ?? ""}`.toLowerCase().includes(t)));
  const chips = (cands ?? []).filter((c) => picked.has(c.id));
  const toggle = (id: number) => setPicked((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const save = () => start(async () => {
    setErr(null);
    const r = await setReportShares(reportId, [...picked]);
    if (r.ok) onSaved([...picked]); else setErr(r.error ?? "Couldn't share.");
  });

  return (
    <Modal open onClose={onClose} className="max-w-[520px]">
      <ModalHeader eyebrow="Share report" eyebrowColor="#1565C0" title={title} subtitle="They can view it (and make their own copy) — numbers are always limited to what each person is allowed to see." onClose={onClose} />
      <div className="px-6 py-4">
        {chips.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[#E3F2FD] py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-[#1565C0]">
                {c.name}
                <button type="button" onClick={() => toggle(c.id)} aria-label={`Remove ${c.name}`} className="rounded-full px-1 leading-none hover:bg-[#BBDEFB]">×</button>
              </span>
            ))}
          </div>
        )}
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name, code, role or store…"
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px] outline-none focus:border-[#1565C0]" />
        <div className="mt-2 max-h-[300px] overflow-y-auto rounded-[10px] border border-[#F0F0F0]">
          {!cands ? <div className="px-3 py-4 text-center text-[12.5px] text-[#9E9E9E]">Loading people…</div>
            : !shown.length ? <div className="px-3 py-4 text-center text-[12.5px] text-[#9E9E9E]">Nobody matches "{q}".</div>
            : shown.map((c) => (
              <label key={c.id} className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#F5F9FF] ${picked.has(c.id) ? "bg-[#F1F7FE]" : ""}`}>
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-[#1565C0]" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-[#1A1C1A]">{c.name}</span>{c.code ? <span className="text-[#9E9E9E]"> · {c.code}</span> : null}
                  <span className="block truncate text-[11px] text-[#757575]">{c.role}{c.store ? ` · ${c.store}` : ""}</span>
                </span>
              </label>
            ))}
        </div>
        {err && <div className="mt-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12px] text-[#757575]">{picked.size} {picked.size === 1 ? "person" : "people"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-[10px] bg-[#1565C0] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save sharing"}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
