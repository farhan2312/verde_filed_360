"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { assignOfficerAction, unassignOfficerAction } from "@/app/actions/stores";
import type { StoreMgmtRow, OfficerLite } from "./types";

function Avatar({ o }: { o: OfficerLite }) {
  return (
    <div
      className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ background: o.grad, opacity: o.active ? 1 : 0.5 }}
    >
      {o.init}
    </div>
  );
}

/**
 * Officer↔store mapping. Assigned officers can be unassigned; any ASR officer can
 * be assigned (moving them if they're mapped elsewhere — 1:1 set-overwrite).
 * Stays open so the admin can fix many relations quickly; each action persists
 * immediately and the page refreshes with the new truth.
 */
export function MapOfficersModal({
  store,
  allOfficers,
  storeNameById,
  onClose,
}: {
  store: StoreMgmtRow;
  allOfficers: OfficerLite[];
  storeNameById: Record<number, string>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const assigned = store.officers;
  const assignedIds = useMemo(() => new Set(assigned.map((o) => o.id)), [assigned]);

  const available = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allOfficers
      .filter((o) => !assignedIds.has(o.id))
      .filter(
        (o) => !term || o.name.toLowerCase().includes(term) || o.code.toLowerCase().includes(term),
      )
      .sort((a, b) => {
        // same-zone first, then free officers, then the rest — alphabetical within.
        const az = a.zone === store.zone ? 0 : 1;
        const bz = b.zone === store.zone ? 0 : 1;
        if (az !== bz) return az - bz;
        const af = a.storeId == null ? 0 : 1;
        const bf = b.storeId == null ? 0 : 1;
        if (af !== bf) return af - bf;
        return a.name.localeCompare(b.name);
      });
  }, [allOfficers, q, assignedIds, store.zone]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setErr(res.error ?? "Action failed");
    });
  };

  const assign = (o: OfficerLite) => {
    if (o.storeId != null && o.storeId !== store.id && confirmMove !== o.id) {
      setConfirmMove(o.id);
      return;
    }
    setConfirmMove(null);
    run(() => assignOfficerAction(o.id, store.id));
  };

  return (
    <Modal open onClose={onClose} className="max-w-[560px]">
      <ModalHeader
        eyebrow="SYSTEM ADMIN · OFFICER MAPPING"
        title={`Manage Officers — ${store.shortName}`}
        subtitle={`${store.code} · ${store.zone || "No region"}`}
        onClose={onClose}
      />
      <div className="px-6 py-5">
        {/* Assigned */}
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted">
          Assigned to this store ({assigned.length})
        </div>
        {assigned.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-muted">
            No officers mapped yet — add one below.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {assigned.map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded-[10px] border border-line px-2.5 py-2">
                <Avatar o={o} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">
                    {o.name}
                    {!o.active && <span className="ml-1.5 text-[10px] font-semibold text-[#E65100]">· deactivated</span>}
                  </div>
                  <div className="text-[11px] text-ink-muted">{o.code || "—"}</div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => unassignOfficerAction(o.id))}
                  className="rounded-lg bg-[#FDECEA] px-2.5 py-1.5 text-[11px] font-semibold text-[#C62828] hover:bg-[#F9DCD8] disabled:opacity-50"
                >
                  × Unassign
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add */}
        <div className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted">
          Add an officer
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search officers by name or code…"
          className="mb-2 w-full rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand-500"
        />
        <div className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto">
          {available.length === 0 ? (
            <div className="px-2 py-3 text-center text-[12px] text-ink-muted">No matching officers.</div>
          ) : (
            available.map((o) => {
              const elsewhere = o.storeId != null && o.storeId !== store.id;
              const moving = confirmMove === o.id;
              return (
                <div key={o.id} className="flex items-center gap-2 rounded-[10px] border border-[#F0F0F0] px-2.5 py-2">
                  <Avatar o={o} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-ink">{o.name}</div>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-ink-muted">
                      <span>{o.code || "—"}</span>
                      {o.zone === store.zone && o.zone && (
                        <span className="rounded-[20px] bg-[#F3F8E6] px-1.5 py-px font-semibold text-[#678722]">same zone</span>
                      )}
                      {o.storeId == null ? (
                        <span className="rounded-[20px] bg-[#F3F8E6] px-1.5 py-px font-semibold text-[#678722]">free</span>
                      ) : elsewhere ? (
                        <span className="rounded-[20px] bg-[#FFF3E0] px-1.5 py-px font-semibold text-[#E65100]">
                          @ {storeNameById[o.storeId] ?? "another store"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => assign(o)}
                    className={
                      moving
                        ? "rounded-lg bg-[#E65100] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#D84315] disabled:opacity-50"
                        : "rounded-lg bg-[#F3F8E6] px-3 py-1.5 text-[11px] font-semibold text-[#678722] hover:bg-[#E4EFC9] disabled:opacity-50"
                    }
                  >
                    {moving ? "Confirm move" : "Assign"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {err && <div className="mt-3 text-[12px] text-danger">{err}</div>}

        <div className="mt-3 text-[10.5px] text-ink-muted">
          Officers inherit this store&apos;s region on assignment. Changes save instantly — close when done.
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] bg-[#678722] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#516A1B]"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
