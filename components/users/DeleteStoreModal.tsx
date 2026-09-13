"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import {
  getStoreDeleteImpactAction,
  deleteStoreAction,
  type DeleteImpact,
} from "@/app/actions/stores";
import type { StoreMgmtRow } from "./types";

/** Impact-aware store delete: shows what detaches, then gates the button by farmer count. */
export function DeleteStoreModal({
  store,
  onClose,
}: {
  store: StoreMgmtRow;
  onClose: () => void;
}) {
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    startLoad(async () => setImpact(await getStoreDeleteImpactAction(store.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id]);

  const farmers = impact?.farmers ?? 0;
  const large = farmers >= 500;
  const needsAck = farmers > 0 && farmers < 500;
  const canDelete =
    !!impact?.ok &&
    !deleting &&
    (farmers === 0 ||
      (needsAck && ack) ||
      (large && typed.trim().toUpperCase() === store.code.toUpperCase()));

  const confirm = () => {
    if (!impact?.ok) return;
    setErr(null);
    startDelete(async () => {
      const res = await deleteStoreAction(store.id, { confirmFarmers: impact.farmers });
      if (res.ok) onClose();
      else setErr(res.error ?? "Delete failed");
    });
  };

  return (
    <Modal open onClose={onClose}>
      <ModalHeader
        eyebrow="SYSTEM ADMIN · DELETE"
        eyebrowColor="#C62828"
        title={`Delete ${store.shortName}?`}
        subtitle={store.code}
        onClose={onClose}
      />
      <div className="px-6 py-5">
        {loading || !impact ? (
          <div className="text-[13px] text-ink-muted">Checking what this affects…</div>
        ) : !impact.ok ? (
          <div className="text-[13px] text-danger">{impact.error ?? "Could not load impact."}</div>
        ) : (
          <>
            <div className="text-[13px] leading-[1.6] text-ink-600">
              Deleting this store keeps all records — they&apos;re just <b>detached</b>:
            </div>
            <ul className="mt-2 space-y-1 text-[12.5px] text-ink-600">
              <li>• <b>{impact.officers}</b> agri officer(s) will be unassigned (accounts kept).</li>
              <li>• <b>{impact.farmers.toLocaleString("en-IN")}</b> farmer(s) detached (records kept, store cleared).</li>
              <li>• <b>{impact.visits}</b> visit &amp; <b>{impact.employees}</b> employee record(s) detached.</li>
            </ul>

            {large && (
              <div className="mt-4 rounded-[10px] border border-[#F8D9A3] bg-[#FEF6E9] px-3 py-2.5 text-[12px] leading-[1.6] text-[#795548]">
                This is a large store. Consider setting its status to <b>Closed</b> (a non-destructive
                edit) instead. To delete anyway, type the store code <b>{store.code}</b>:
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={store.code}
                  className="mt-2 w-full rounded-[8px] border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-brand-500"
                />
              </div>
            )}
            {needsAck && (
              <label className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-600">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I understand {farmers} farmer(s) will be unmapped from this store.
              </label>
            )}
          </>
        )}

        {err && <div className="mt-3 text-[12px] text-danger">{err}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-[10px] border border-line bg-white px-[18px] py-[9px] text-[13px] font-semibold text-ink-600 hover:bg-surface-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canDelete}
            className="rounded-[10px] bg-[#C62828] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#B71C1C] disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete Store"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
