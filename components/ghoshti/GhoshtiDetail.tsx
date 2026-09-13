"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/components/interactive";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  addGhoshtiAttendees, removeGhoshtiAttendee, approveGhoshti, rejectGhoshti,
  getGhoshti, lookupGhoshtiFarmer, type GhoshtiDetailVM,
} from "@/app/actions/ghoshti";
import type { RoleKey } from "@/lib/roles";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: "#FFF3E0", fg: "#E65100", label: "Pending approval" },
  APPROVED: { bg: "#F5F9EA", fg: "#7DA02E", label: "Approved" },
  REJECTED: { bg: "#FDECEA", fg: "#C62828", label: "Rejected" },
};

export function GhoshtiDetail({ initial, role }: { initial: GhoshtiDetailVM; role: RoleKey }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [g, setG] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [, start] = useTransition();

  const st = STATUS_STYLE[g.status] ?? STATUS_STYLE.PENDING;
  const existingCount = useMemo(() => g.attendees.filter((a) => a.isExisting).length, [g.attendees]);

  const reload = async () => { const fresh = await getGhoshti(g.id); if (fresh) setG(fresh); };

  const approve = async () => {
    if (!(await confirm({ title: "Approve this Ghoshti?", message: `${g.attendees.length} attendee(s); ${existingCount} matched existing farmer(s) will be flagged as having attended a Ghoshti.`, confirmLabel: "Approve" }))) return;
    start(async () => { const r = await approveGhoshti(g.id); if (!r.ok) { alert(r.error ?? "Failed."); return; } reload(); });
  };
  const doReject = () => {
    start(async () => {
      const r = await rejectGhoshti({ ghoshtiId: g.id, note: rejectNote || undefined });
      if (!r.ok) { alert(r.error ?? "Failed."); return; }
      setRejecting(false); setRejectNote(""); reload();
    });
  };
  const removeAttendee = async (id: number, label: string) => {
    if (!(await confirm({ title: "Remove attendee?", message: label, confirmLabel: "Remove" }))) return;
    const prev = g.attendees;
    setG((x) => ({ ...x, attendees: x.attendees.filter((a) => a.id !== id) }));
    start(async () => { const r = await removeGhoshtiAttendee({ ghoshtiId: g.id, attendeeId: id }); if (!r.ok) { setG((x) => ({ ...x, attendees: prev })); alert(r.error ?? "Failed."); } });
  };

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {dialog}

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/ghoshti" className="text-[12.5px] font-semibold text-[#7DA02E] hover:underline">← All meetups</Link>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
      </div>

      {/* Summary card */}
      <div className="rounded-[14px] border border-black/[0.03] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[19px] font-bold text-[#1A1C1A]">{g.topic || "Farmer Ghoshti"}</div>
            <div className="mt-1 text-[13px] text-[#616161]">
              {fmtDate(g.date)} · {g.storeName}{g.zone ? ` · ${g.zone}` : ""}
            </div>
            {g.locationNote && <div className="mt-0.5 text-[12.5px] text-[#9E9E9E]">📍 {g.locationNote}</div>}
          </div>
          <div className="text-right text-[11.5px] text-[#9E9E9E]">
            <div>Organised by <b className="text-[#616161]">{g.createdBy}</b>{g.createdByCode ? ` (${g.createdByCode})` : ""}</div>
            <div>{fmtDateTime(g.createdAt)}</div>
          </div>
        </div>

        {g.notes && <div className="mt-3 rounded-[10px] bg-[#FAFAFA] px-3.5 py-2.5 text-[12.5px] text-[#424242]">{g.notes}</div>}

        {g.status === "APPROVED" && g.approvedBy && (
          <div className="mt-3 rounded-[10px] bg-[#F1F8F1] px-3.5 py-2 text-[12px] text-[#7DA02E]">
            ✓ Approved by <b>{g.approvedBy}</b>{g.approvedAt ? ` · ${fmtDateTime(g.approvedAt)}` : ""}
          </div>
        )}
        {g.status === "REJECTED" && (
          <div className="mt-3 rounded-[10px] bg-[#FDECEA] px-3.5 py-2 text-[12px] text-[#C62828]">
            ✗ Rejected by <b>{g.approvedBy ?? "—"}</b>{g.approvedAt ? ` · ${fmtDateTime(g.approvedAt)}` : ""}{g.rejectionNote ? ` — ${g.rejectionNote}` : ""}
          </div>
        )}

        {/* Approval actions */}
        {g.canApprove && (
          <div className="mt-4 flex items-center gap-2 border-t border-[#F0F0F0] pt-4">
            <button type="button" onClick={approve}
              className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A]">✓ Approve meetup</button>
            <button type="button" onClick={() => setRejecting(true)}
              className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#C62828] hover:bg-[#FDECEA]">Reject</button>
          </div>
        )}
      </div>

      {/* Attendees */}
      <div className="mt-4 rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F0] px-5 py-3.5">
          <div>
            <span className="text-[14px] font-bold text-[#1A1C1A]">Attendees</span>
            <span className="ml-2 text-[12px] text-[#9E9E9E]">{g.attendees.length} total · {existingCount} existing farmer(s) · {g.attendees.length - existingCount} new</span>
          </div>
          {g.canRecordAttendance ? (
            <button type="button" onClick={() => setAdding(true)}
              className="rounded-[10px] bg-[#7DA02E] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#66852A]">+ Add attendees</button>
          ) : g.status === "PENDING" && g.canEdit ? (
            <span className="rounded-full bg-[#FFF3E0] px-3 py-1.5 text-[11.5px] font-semibold text-[#E65100]">🔒 Locked until approved</span>
          ) : null}
        </div>

        {/* Attendance is gated on approval — spell it out for the organiser. */}
        {g.status === "PENDING" && g.canEdit && (
          <div className="border-b border-[#F0F0F0] bg-[#FFFBF5] px-5 py-2.5 text-[12px] text-[#8D5A00]">
            ⏳ Awaiting approval — attendance can be recorded only after this meetup is approved by the RM/BDM or central.
          </div>
        )}

        {g.attendees.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-[26px]">👥</div>
            <div className="mt-2 text-[13.5px] font-bold text-[#1A1C1A]">No attendees recorded</div>
            <div className="mt-1 text-[12px] text-[#9E9E9E]">Add attendees by their mobile number.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="border-b border-[#EEE] text-left text-[10.5px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">
                  <th className="px-5 py-3">Mobile</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Remarks</th>{g.canRecordAttendance && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {g.attendees.map((a) => (
                  <tr key={a.id} className="border-b border-[#F5F5F5] last:border-0 hover:bg-[#FAFBFA]">
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-[#333]">{a.mobile}</td>
                    <td className="px-4 py-3">
                      {a.isExisting && a.matchedFarmerId
                        ? <Link href={`/farmers/${a.matchedFarmerId}`} className="font-semibold text-[#1565C0] hover:underline">{a.name || "View farmer"}</Link>
                        : <span className="text-[#616161]">{a.name || "—"}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {a.isExisting
                        ? <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[10.5px] font-bold text-[#7DA02E]">Existing</span>
                        : <span className="rounded-full bg-[#FFF3E0] px-2 py-0.5 text-[10.5px] font-bold text-[#E65100]">New</span>}
                    </td>
                    <td className="px-4 py-3 text-[#9E9E9E]">{a.remarks || "—"}</td>
                    {g.canRecordAttendance && (
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => removeAttendee(a.id, `${a.mobile}${a.name ? ` · ${a.name}` : ""}`)}
                          className="rounded-md bg-[#FDECEA] px-2 py-1 text-[11px] font-semibold text-[#C62828] hover:bg-[#FADBD8]">Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && (
        <AddAttendeesModal
          ghoshtiId={g.id}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); reload(); router.refresh(); }}
        />
      )}

      {/* Reject reason */}
      <Modal open={rejecting} onClose={() => setRejecting(false)} className="max-w-[460px]">
        <ModalHeader eyebrow="Reject Ghoshti" eyebrowColor="#C62828" title="Reason for rejection" onClose={() => setRejecting(false)} />
        <div className="px-5 py-4">
          <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} autoFocus
            placeholder="Optional — tell the organiser why this was rejected."
            className="w-full resize-y rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#C62828]" />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setRejecting(false)} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Cancel</button>
            <button type="button" onClick={doReject} className="rounded-[10px] bg-[#C62828] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#B71C1C]">Reject meetup</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface AttendeeRow { id: number; mobile: string; name: string; remarks: string; status: "idle" | "checking" | "found" | "new" }
const blankRow = (id: number): AttendeeRow => ({ id, mobile: "", name: "", remarks: "", status: "idle" });

function AddAttendeesModal({
  ghoshtiId, onClose, onAdded,
}: {
  ghoshtiId: number; onClose: () => void; onAdded: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const nextId = useRef(2);
  const [rows, setRows] = useState<AttendeeRow[]>([blankRow(1)]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const patch = (id: number, p: Partial<AttendeeRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow(nextId.current++)]);

  // Phone → farmer lookup: when a valid 10-digit number is entered, auto-fill the name if it's a farmer.
  const onMobile = (id: number, val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 10);
    patch(id, { mobile: digits, status: "idle" });
    if (/^[6-9]\d{9}$/.test(digits)) {
      patch(id, { status: "checking" });
      lookupGhoshtiFarmer(digits).then((r) => {
        setRows((rs) => rs.map((row) => {
          if (row.id !== id || row.mobile !== digits) return row; // ignore stale responses
          return { ...row, status: r.found ? "found" : "new", name: r.found && !row.name.trim() ? (r.name ?? "") : row.name };
        }));
      });
    }
  };

  const removeRow = async (row: AttendeeRow) => {
    const hasData = !!(row.mobile.trim() || row.name.trim() || row.remarks.trim());
    if (hasData) {
      const ok = await confirm({ title: "Remove this attendee?", confirmLabel: "Remove", message: <>{row.mobile || "(no number)"}{row.name ? <> · <b>{row.name}</b></> : null}</> });
      if (!ok) return;
    }
    setRows((rs) => (rs.length === 1 ? [blankRow(nextId.current++)] : rs.filter((r) => r.id !== row.id)));
  };

  const submit = () => {
    setErr(null); setMsg(null);
    const clean = rows
      .map((r) => ({ mobile: r.mobile.trim(), name: r.name.trim() || undefined, remarks: r.remarks.trim() || undefined }))
      .filter((r) => /^[6-9]\d{9}$/.test(r.mobile));
    if (clean.length === 0) { setErr("Add at least one valid 10-digit mobile (starts 6, 7, 8 or 9)."); return; }
    startSave(async () => {
      const r = await addGhoshtiAttendees({ ghoshtiId, rows: clean });
      if (!r.ok) { setErr(r.error ?? "Failed to add."); return; }
      setMsg(`Added ${r.added} attendee(s) — ${r.existing} matched existing farmers${r.skipped ? `, ${r.skipped} skipped (duplicate/invalid)` : ""}.`);
      if ((r.added ?? 0) > 0) setTimeout(onAdded, 900);
    });
  };

  const inputCls = "rounded-[10px] border border-[#E0E0E0] px-3 py-2 text-[13px] outline-none focus:border-[#7DA02E]";

  return (
    <Modal open onClose={onClose} className="max-w-[600px]">
      {dialog}
      <ModalHeader eyebrow="Attendees" eyebrowColor="#7DA02E" title="Add attendees" onClose={onClose} />
      <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
        {/* Column headers */}
        <div className="mb-1.5 hidden gap-2 px-0.5 text-[10px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E] sm:flex">
          <div className="w-[130px]">Phone number</div>
          <div className="flex-1">Name</div>
          <div className="flex-1">Remarks</div>
          <div className="w-[26px]" />
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
              <div className="w-[130px]">
                <input value={row.mobile} onChange={(e) => onMobile(row.id, e.target.value)} inputMode="numeric" maxLength={10}
                  placeholder="10-digit" className={`${inputCls} w-full tracking-[0.5px]`} />
                {row.status === "checking" && <div className="mt-0.5 text-[10px] text-[#9E9E9E]">Checking…</div>}
                {row.status === "found" && <div className="mt-0.5 text-[10px] font-semibold text-[#7DA02E]">✓ Existing farmer</div>}
                {row.status === "new" && <div className="mt-0.5 text-[10px] font-semibold text-[#E65100]">New number</div>}
              </div>
              <input value={row.name} onChange={(e) => patch(row.id, { name: e.target.value })}
                placeholder="Name" className={`${inputCls} min-w-0 flex-1`} />
              <input value={row.remarks} onChange={(e) => patch(row.id, { remarks: e.target.value })}
                placeholder="Remarks (optional)" className={`${inputCls} min-w-0 flex-1`} />
              <button type="button" onClick={() => removeRow(row)} aria-label="Remove attendee"
                className="mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[#FDECEA] text-[15px] font-bold leading-none text-[#C62828] hover:bg-[#FADBD8]">×</button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow}
          className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border border-dashed border-[#E9F2CF] bg-[#F1F8F1] px-3 py-2 text-[12.5px] font-semibold text-[#7DA02E] hover:bg-[#F5F9EA]">
          + Add attendee
        </button>

        <div className="mt-2 text-[11.5px] text-[#9E9E9E]">Enter a phone number and the name fills in automatically if they&apos;re an existing farmer. Name &amp; remarks are optional.</div>

        {err && <div className="mt-3 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}
        {msg && <div className="mt-3 rounded-[8px] bg-[#F5F9EA] px-3 py-2 text-[12px] font-semibold text-[#7DA02E]">{msg}</div>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Close</button>
          <button type="button" onClick={submit} disabled={saving}
            className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A] disabled:opacity-50">
            {saving ? "Adding…" : "Add attendees"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
