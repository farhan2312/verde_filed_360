"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/components/interactive";
import { useConfirm } from "@/components/ConfirmDialog";
import { createGhoshti, deleteGhoshti, type GhoshtiListItem, type GhoshtiStoreOption } from "@/app/actions/ghoshti";
import type { RoleKey } from "@/lib/roles";

type Tab = "all" | "PENDING" | "APPROVED" | "REJECTED";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: "#FFF3E0", fg: "#E65100", label: "Pending approval" },
  APPROVED: { bg: "#F5F9EA", fg: "#7DA02E", label: "Approved" },
  REJECTED: { bg: "#FDECEA", fg: "#C62828", label: "Rejected" },
};

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.03] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-none" style={{ color: color ?? "#1A1C1A" }}>{value}</div>
    </div>
  );
}

export function GhoshtiScreen({
  initial, role, storeOptions,
}: {
  initial: GhoshtiListItem[];
  role: RoleKey;
  storeOptions: { locked: boolean; stores: GhoshtiStoreOption[] };
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();

  const canCreate = storeOptions.stores.length > 0;

  const counts = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    approved: rows.filter((r) => r.status === "APPROVED").length,
    attendees: rows.reduce((s, r) => s + r.attendees, 0),
  }), [rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (tab === "all" || r.status === tab) &&
      (!t || `${r.storeName} ${r.topic ?? ""} ${r.zone ?? ""} ${r.createdBy}`.toLowerCase().includes(t)));
  }, [rows, tab, q]);

  const remove = async (g: GhoshtiListItem) => {
    if (!(await confirm({ title: "Delete this Ghoshti?", message: `${g.storeName} · ${fmtDate(g.date)} · ${g.attendees} attendee(s). This permanently removes the meetup and its attendee list.`, confirmLabel: "Delete Ghoshti" }))) return;
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== g.id));
    start(async () => { const r = await deleteGhoshti(g.id); if (!r.ok) { setRows(prev); alert(r.error ?? "Failed."); } });
  };

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {dialog}

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Meetups" value={counts.total} />
        <Kpi label="Pending" value={counts.pending} color="#E65100" />
        <Kpi label="Approved" value={counts.approved} color="#7DA02E" />
        <Kpi label="Attendees" value={counts.attendees} color="#1565C0" />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
          {TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className="rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{ background: tab === key ? "#fff" : "transparent", color: tab === key ? "#7DA02E" : "#9E9E9E", boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store / topic / organiser…"
          className="min-w-[200px] flex-1 rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-[7px] text-[12.5px] outline-none focus:border-[#7DA02E]" />
        {canCreate && (
          <button type="button" onClick={() => setAdding(true)}
            className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A]">
            + New Ghoshti
          </button>
        )}
      </div>

      {/* Table */}
      {shown.length === 0 ? (
        <div className="rounded-[14px] border border-black/[0.03] bg-white px-6 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[30px]">🌾</div>
          <div className="mt-2 text-[15px] font-bold text-[#1A1C1A]">No meetups yet</div>
          <div className="mt-1 text-[12.5px] text-[#9E9E9E]">Record a farmer Ghoshti to capture who attended.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[#EEE] text-left text-[10.5px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Store</th><th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3 text-center">Attendees</th><th className="px-4 py-3">Organiser</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => {
                const st = STATUS_STYLE[g.status] ?? STATUS_STYLE.PENDING;
                return (
                  <tr key={g.id} className="border-b border-[#F5F5F5] last:border-0 hover:bg-[#FAFBFA]">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/ghoshti/${g.id}`} className="font-semibold text-[#1565C0] hover:underline">{fmtDate(g.date)}</Link>
                    </td>
                    <td className="px-4 py-3 text-[#333]">{g.storeName}{g.zone && <div className="text-[10.5px] text-[#9E9E9E]">{g.zone}</div>}</td>
                    <td className="px-4 py-3 text-[#616161]">{g.topic || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-[#1A1C1A]">{g.attendees}</span>
                      {g.existingCount > 0 && <span className="ml-1 text-[10.5px] text-[#7DA02E]">({g.existingCount} existing)</span>}
                    </td>
                    <td className="px-4 py-3 text-[#9E9E9E]">{g.createdBy}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                      {g.canApprove && <span className="ml-1.5 rounded-full bg-[#FEF6E9] px-1.5 py-0.5 text-[9px] font-bold text-[#8D6E00]">NEEDS YOU</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/ghoshti/${g.id}`} className="rounded-md bg-[#E3F2FD] px-2.5 py-1 text-[11px] font-semibold text-[#1565C0] hover:bg-[#D0E8FB]">Open</Link>
                        <button type="button" onClick={() => remove(g)} className="rounded-md bg-[#FDECEA] px-2 py-1 text-[11px] font-semibold text-[#C62828] hover:bg-[#FADBD8]">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <NewGhoshtiModal
          storeOptions={storeOptions}
          onClose={() => setAdding(false)}
          onCreated={(id) => { setAdding(false); router.push(`/ghoshti/${id}`); }}
        />
      )}
    </div>
  );
}

function NewGhoshtiModal({
  storeOptions, onClose, onCreated,
}: {
  storeOptions: { locked: boolean; stores: GhoshtiStoreOption[] };
  onClose: () => void; onCreated: (id: number) => void;
}) {
  const only = storeOptions.stores.length === 1 ? storeOptions.stores[0] : null;
  const [date, setDate] = useState("");
  const [storeId, setStoreId] = useState<number | "">(only ? only.id : "");
  const [topic, setTopic] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const submit = () => {
    setErr(null);
    if (!date) { setErr("Pick the meetup date."); return; }
    if (!storeId) { setErr("Pick the host store."); return; }
    startSave(async () => {
      const r = await createGhoshti({ date, storeId: Number(storeId), topic: topic || undefined, locationNote: locationNote || undefined, notes: notes || undefined });
      if (!r.ok || !r.id) { setErr(r.error ?? "Failed to create."); return; }
      onCreated(r.id);
    });
  };

  return (
    <Modal open onClose={onClose} className="max-w-[520px]">
      <ModalHeader eyebrow="Ghoshti" eyebrowColor="#7DA02E" title="New farmer meetup" onClose={onClose} />
      <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Date <span className="text-[#C62828]">*</span></label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Host store <span className="text-[#C62828]">*</span></label>
            {only ? (
              <div className="mt-1 rounded-[10px] border border-[#E9F2CF] bg-[#F1F8F1] px-3.5 py-2.5 text-[13px] font-semibold text-[#66852A]">{only.name}</div>
            ) : (
              <select value={storeId} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]">
                <option value="">Select a store…</option>
                {storeOptions.stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.zone ? ` · ${s.zone}` : ""}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Topic (optional)</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Kharif crop advisory"
            className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
        </div>
        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Location / venue (optional)</label>
          <input value={locationNote} onChange={(e) => setLocationNote(e.target.value)} placeholder="e.g. Village panchayat hall"
            className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
        </div>
        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full resize-y rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
        </div>

        <div className="mt-3 rounded-[8px] bg-[#F5F7F5] px-3 py-2 text-[11.5px] text-[#66857A]">
          After creating, add attendees by mobile number. The meetup stays <b>pending</b> until approved.
        </div>

        {err && <div className="mt-3 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Cancel</button>
          <button type="button" onClick={submit} disabled={saving}
            className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A] disabled:opacity-50">
            {saving ? "Creating…" : "Create Ghoshti"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
