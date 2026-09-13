"use client";

import { useState } from "react";
import { Modal, ModalHeader } from "@/components/interactive";

export function DataManagementCard() {
  const [confirmPurge, setConfirmPurge] = useState(false);

  return (
    <div className="rounded-[14px] border border-black/[0.03] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-4 text-base font-bold text-ink">Data Management</div>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          className="flex items-center justify-between rounded-[10px] bg-neutral-50 px-4 py-3 text-left transition-colors hover:bg-neutral-100"
        >
          <span className="text-[13px] font-semibold text-ink">Export All Data (CSV)</span>
          <span className="text-lg text-neutral-400">↓</span>
        </button>

        <button
          type="button"
          className="flex items-center justify-between rounded-[10px] bg-neutral-50 px-4 py-3 text-left transition-colors hover:bg-neutral-100"
        >
          <span className="text-[13px] font-semibold text-ink">Import Farmer Data</span>
          <span className="text-lg text-neutral-400">↑</span>
        </button>

        <button
          type="button"
          onClick={() => setConfirmPurge(true)}
          className="flex items-center justify-between rounded-[10px] bg-orange-50 px-4 py-3 text-left transition-colors hover:bg-orange-100"
        >
          <span className="text-[13px] font-semibold text-orange-800">Purge Old Data (&gt;2 yr)</span>
          <span className="text-lg text-orange-800">⚠</span>
        </button>
      </div>

      <Modal open={confirmPurge} onClose={() => setConfirmPurge(false)}>
        <ModalHeader
          eyebrow="SYSTEM ADMIN · DESTRUCTIVE"
          title="Purge Old Data"
          subtitle="This permanently deletes visit and audit records older than 2 years."
          onClose={() => setConfirmPurge(false)}
        />
        <div className="px-6 py-5">
          <p className="text-[13px] text-ink-600">
            Are you sure you want to purge all data older than 2 years? This action cannot be
            undone.
          </p>
          <div className="mt-6 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmPurge(false)}
              className="rounded-[8px] border border-line bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-600 hover:bg-surface-150"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmPurge(false)}
              className="rounded-[8px] px-4 py-2 text-[12.5px] font-semibold text-white"
              style={{ background: "#E65100" }}
            >
              Purge Data
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
