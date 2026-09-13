"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/components/interactive";
import { completeAction, reopenAction, createAction, searchFarmersForAction, addActionComment, getActionComments, type ActionCommentVM } from "@/app/actions/action-registry";
import { FOLLOWUP_REASONS, type ActionVM, type FarmerPick } from "@/lib/action-constants";
import type { RoleKey } from "@/lib/roles";

type Tab = "OPEN" | "OVERDUE" | "DONE" | "ALL";
const TABS: { key: Tab; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "DONE", label: "Done" },
  { key: "ALL", label: "All" },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.03] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-none" style={{ color: color ?? "#1A1C1A" }}>{value}</div>
    </div>
  );
}

export function ActionRegistry({
  initial, role, myStoreId, stores,
}: {
  initial: ActionVM[]; role: RoleKey; myStoreId: number | null; stores: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [actions, setActions] = useState(initial);
  const [tab, setTab] = useState<Tab>("OPEN");
  const [q, setQ] = useState("");
  const [storeFilter, setStoreFilter] = useState<number | "">("");
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState<ActionVM | null>(null);
  const [doneNote, setDoneNote] = useState("");
  const [commentsFor, setCommentsFor] = useState<ActionVM | null>(null);
  const [comments, setComments] = useState<ActionCommentVM[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [savingComment, startComment] = useTransition();
  const [, start] = useTransition();

  const openComments = (a: ActionVM) => {
    setCommentsFor(a); setComments([]); setNewComment(""); setLoadingComments(true);
    getActionComments(a.id).then((c) => { setComments(c); setLoadingComments(false); });
  };
  const submitComment = () => {
    if (!commentsFor || !newComment.trim()) return;
    const id = commentsFor.id, text = newComment.trim();
    startComment(async () => {
      const r = await addActionComment(id, text);
      if (!r.ok) { alert(r.error ?? "Failed."); return; }
      if (r.comment) setComments((cs) => [r.comment!, ...cs]);
      setNewComment("");
      setActions((as) => as.map((a) => a.id === id ? { ...a, workingComment: text } : a));
    });
  };

  const isOfficer = role === "officer";

  const counts = useMemo(() => ({
    open: actions.filter((a) => a.status === "OPEN").length,
    overdue: actions.filter((a) => a.overdue).length,
    done: actions.filter((a) => a.status === "DONE").length,
  }), [actions]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return actions.filter((a) =>
      (tab === "ALL" || (tab === "OVERDUE" ? a.overdue : a.status === tab)) &&
      (storeFilter === "" || a.storeId === storeFilter) &&
      (!t || `${a.farmerName} ${a.reason} ${a.farmerMobile} ${a.storeName}`.toLowerCase().includes(t)));
  }, [actions, tab, q, storeFilter]);

  const confirmDone = () => {
    if (!completing) return;
    const id = completing.id, note = doneNote.trim();
    const prev = actions;
    setActions((as) => as.map((a) => a.id === id ? { ...a, status: "DONE", overdue: false, completedAt: new Date().toISOString(), completionNote: note } : a));
    setCompleting(null); setDoneNote("");
    start(async () => { const r = await completeAction(id, note); if (!r.ok) { setActions(prev); alert(r.error ?? "Failed."); } });
  };
  const reopen = (id: number) => {
    const prev = actions;
    setActions((as) => as.map((a) => a.id === id ? { ...a, status: "OPEN", completedAt: null } : a));
    start(async () => { const r = await reopenAction(id); if (!r.ok) setActions(prev); });
  };

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi label="Open" value={counts.open} color="#1565C0" />
        <Kpi label="Overdue" value={counts.overdue} color="#C62828" />
        <Kpi label="Done" value={counts.done} color="#7DA02E" />
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search farmer / reason…"
          className="min-w-[200px] flex-1 rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-[7px] text-[12.5px] outline-none focus:border-[#7DA02E]" />
        {!isOfficer && stores.length > 1 && (
          <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value ? Number(e.target.value) : "")}
            className="rounded-[10px] border border-[#E0E0E0] bg-white px-3 py-[7px] text-[12.5px] text-[#424242] outline-none focus:border-[#7DA02E]">
            <option value="">All stores</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button type="button" onClick={() => setAdding(true)}
          className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A]">
          + New action
        </button>
      </div>

      {/* Table */}
      {shown.length === 0 ? (
        <div className="rounded-[14px] border border-black/[0.03] bg-white px-6 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="text-[30px]">✅</div>
          <div className="mt-2 text-[15px] font-bold text-[#1A1C1A]">Nothing here</div>
          <div className="mt-1 text-[12.5px] text-[#9E9E9E]">Follow-ups from visits and manual actions show up here.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[#EEE] text-left text-[10.5px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">
                <th className="px-4 py-3">Due</th><th className="px-4 py-3">Farmer</th><th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Reason</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-b border-[#F5F5F5] last:border-0 hover:bg-[#FAFBFA]">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={a.overdue ? "font-bold text-[#C62828]" : "text-[#333]"}>{fmtDate(a.dueDate)}</span>
                    {a.overdue && <span className="ml-1.5 rounded-full bg-[#FDECEA] px-1.5 py-0.5 text-[9px] font-bold text-[#C62828]">OVERDUE</span>}
                  </td>
                  <td className="px-4 py-3">
                    {a.farmerId
                      ? <Link href={`/farmers/${a.farmerId}`} className="font-semibold text-[#1565C0] hover:underline">{a.farmerName}</Link>
                      : <span className="text-[#9E9E9E]">—</span>}
                    {a.farmerVillage && <div className="text-[10.5px] text-[#9E9E9E]">{a.farmerVillage}{a.farmerMobile ? ` · ${a.farmerMobile}` : ""}</div>}
                  </td>
                  <td className="px-4 py-3 text-[#616161]">{a.storeName || <span className="text-[#BDBDBD]">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-[#616161]">{a.reason || "—"}{a.note && <div className="text-[10.5px] text-[#9E9E9E]">{a.note}</div>}</td>
                  <td className="px-4 py-3">
                    {a.visitId
                      ? <Link href={`/visits/${a.visitId}`} className="text-[#7DA02E] hover:underline">Visit ↗</Link>
                      : <span className="text-[#9E9E9E]">Manual</span>}
                  </td>
                  <td className="px-4 py-3 text-[#9E9E9E]">{a.createdBy || "—"}</td>
                  <td className="px-4 py-3">
                    {a.status === "DONE"
                      ? <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[10.5px] font-bold text-[#7DA02E]" title={a.completionNote || undefined}>Done{a.completionNote ? " 📝" : ""}</span>
                      : <span className="rounded-full bg-[#E3F2FD] px-2 py-0.5 text-[10.5px] font-bold text-[#1565C0]">Open</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => openComments(a)} title="Working comments" className="rounded-md bg-[#F3E5F5] px-2 py-1 text-[11px] font-semibold text-[#6A1B9A] hover:bg-[#E9D5F0]">✎ Edit{a.workingComment ? " 💬" : ""}</button>
                      {a.status === "DONE"
                        ? <button type="button" onClick={() => reopen(a.id)} className="rounded-md bg-[#F5F5F5] px-2.5 py-1 text-[11px] font-semibold text-[#616161] hover:bg-[#EEE]">Reopen</button>
                        : <button type="button" onClick={() => { setCompleting(a); setDoneNote(""); }} className="rounded-md bg-[#7DA02E] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#66852A]">Mark done</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <NewActionModal
          role={role} myStoreId={myStoreId} stores={stores}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); router.refresh(); }}
        />
      )}

      {/* Mark done — capture an optional completion note */}
      <Modal open={completing != null} onClose={() => setCompleting(null)} className="max-w-[480px]">
        {completing && (
          <>
            <ModalHeader eyebrow="Complete action" eyebrowColor="#7DA02E" title={`Mark done — ${completing.farmerName}`} onClose={() => setCompleting(null)} />
            <div className="px-5 py-4">
              <div className="mb-3 text-[12.5px] text-[#616161]">
                {completing.reason || "Follow-up"} · due {fmtDate(completing.dueDate)}
                {completing.storeName ? ` · ${completing.storeName}` : ""}
              </div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Closing summary <span className="text-[#C62828]">*</span></label>
              <textarea value={doneNote} onChange={(e) => setDoneNote(e.target.value)} rows={3} autoFocus
                placeholder="Required — what was the outcome / how was it resolved?"
                className="mt-1 w-full resize-y rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setCompleting(null)} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Cancel</button>
                <button type="button" onClick={confirmDone} disabled={!doneNote.trim()}
                  className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A] disabled:opacity-50">Mark done</button>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Working comments — add + full audit history (who / when) */}
      <Modal open={commentsFor != null} onClose={() => setCommentsFor(null)} className="max-w-[560px]">
        {commentsFor && (
          <>
            <ModalHeader eyebrow="Working comments" eyebrowColor="#6A1B9A" title={commentsFor.farmerName} onClose={() => setCommentsFor(null)} />
            <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
              <div className="mb-3 text-[12.5px] text-[#616161]">
                {commentsFor.reason || "Follow-up"} · due {fmtDate(commentsFor.dueDate)}{commentsFor.storeName ? ` · ${commentsFor.storeName}` : ""}
              </div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Add a comment</label>
              <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} autoFocus
                placeholder="Progress note, next step, what you're waiting on…"
                className="mt-1 w-full resize-y rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#6A1B9A]" />
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={submitComment} disabled={savingComment || !newComment.trim()}
                  className="rounded-[10px] bg-[#6A1B9A] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#4A148C] disabled:opacity-50">
                  {savingComment ? "Adding…" : "Add comment"}
                </button>
              </div>

              <div className="mt-4 border-t border-[#F0F0F0] pt-3">
                <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">History</div>
                {loadingComments ? <div className="py-4 text-center text-[12px] text-[#9E9E9E]">Loading…</div>
                  : comments.length === 0 ? <div className="py-4 text-[12.5px] text-[#9E9E9E]">No comments yet.</div>
                  : (
                    <ol className="flex flex-col gap-2.5">
                      {comments.map((c) => (
                        <li key={c.id} className="rounded-[10px] border border-[#EEE] bg-[#FAFAFA] px-3 py-2">
                          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#333]">{c.text}</div>
                          <div className="mt-1 text-[10.5px] text-[#9E9E9E]">
                            {c.author || "—"}{c.authorCode ? ` (${c.authorCode})` : ""} · {new Date(c.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function NewActionModal({
  role, myStoreId, stores, onClose, onCreated,
}: {
  role: RoleKey; myStoreId: number | null; stores: { id: number; name: string }[];
  onClose: () => void; onCreated: () => void;
}) {
  const isOfficer = role === "officer";
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<FarmerPick[]>([]);
  const [picked, setPicked] = useState<FarmerPick | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [storeId, setStoreId] = useState<number | "">(isOfficer ? (myStoreId ?? "") : (myStoreId ?? ""));
  const [err, setErr] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  const search = (v: string) => {
    setTerm(v);
    if (v.trim().length < 2) { setResults([]); return; }
    startSearch(async () => setResults(await searchFarmersForAction(v)));
  };

  const submit = () => {
    setErr(null);
    if (!picked) { setErr("Pick a farmer."); return; }
    if (!dueDate) { setErr("Pick a due date."); return; }
    if (!isOfficer && !storeId) { setErr("Pick a store."); return; }
    startSave(async () => {
      const r = await createAction({
        farmerId: picked.id, dueDate, reason: reason || undefined, note: note || undefined,
        storeId: isOfficer ? undefined : (storeId === "" ? null : Number(storeId)),
      });
      if (!r.ok) { setErr(r.error ?? "Failed to create."); return; }
      onCreated();
    });
  };

  return (
    <Modal open onClose={onClose} className="max-w-[560px]">
      <ModalHeader eyebrow="Action Registry" eyebrowColor="#7DA02E" title="New follow-up action" onClose={onClose} />
      <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
        {/* Farmer */}
        <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Farmer</label>
        {picked ? (
          <div className="mt-1 flex items-center justify-between rounded-[10px] border border-[#E9F2CF] bg-[#F1F8F1] px-3 py-2">
            <div><div className="text-[13px] font-semibold text-[#66852A]">{picked.name}</div>
              <div className="text-[11px] text-[#66857A]">{picked.village}{picked.mobile ? ` · ${picked.mobile}` : ""}{picked.storeName ? ` · ${picked.storeName}` : ""}</div></div>
            <button type="button" onClick={() => { setPicked(null); setResults([]); setTerm(""); }} className="text-[12px] font-semibold text-[#C62828]">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input value={term} onChange={(e) => search(e.target.value)} placeholder="Search by name or mobile…"
              className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
            {(searching || results.length > 0) && (
              <div className="absolute z-10 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[10px] border border-[#E0E0E0] bg-white shadow-lg">
                {searching && <div className="px-3 py-2 text-[12px] text-[#9E9E9E]">Searching…</div>}
                {results.map((f) => (
                  <button key={f.id} type="button" onClick={() => { setPicked(f); if (!isOfficer && f.storeId) setStoreId(f.storeId); }}
                    className="block w-full px-3 py-2 text-left hover:bg-[#F5F7F5]">
                    <div className="text-[12.5px] font-semibold text-[#1A1C1A]">{f.name}</div>
                    <div className="text-[11px] text-[#9E9E9E]">{f.village}{f.mobile ? ` · ${f.mobile}` : ""}{f.storeName ? ` · ${f.storeName}` : ""}</div>
                  </button>
                ))}
                {!searching && term.trim().length >= 2 && results.length === 0 && <div className="px-3 py-2 text-[12px] text-[#9E9E9E]">No farmers found.</div>}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]">
              <option value="">Select…</option>
              {FOLLOWUP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {!isOfficer && (
          <div className="mt-4">
            <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Assign to store</label>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]">
              <option value="">Select a store…</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">Note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="mt-1 w-full resize-y rounded-[10px] border border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
        </div>

        {err && <div className="mt-3 rounded-[8px] bg-[#FDECEA] px-3 py-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[12.5px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Cancel</button>
          <button type="button" onClick={submit} disabled={saving}
            className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#66852A] disabled:opacity-50">
            {saving ? "Creating…" : "Create action"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
