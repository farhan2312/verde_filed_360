"use client";

import { useState } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { saveKpiAction, type KpiData } from "@/app/actions/dashboard";

const FIELDS: { key: keyof KpiData; label: string }[] = [
  { key: "visits", label: "Total Visits" },
  { key: "farmers", label: "Farmers Registered" },
  { key: "convRate", label: "Conversion Rate" },
  { key: "followups", label: "Pending Follow-ups" },
];

export function EditKpiButton({ kpi }: { kpi: KpiData }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<KpiData>(kpi);
  const [saving, setSaving] = useState(false);

  function openModal() {
    setDraft(kpi);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    await saveKpiAction(draft);
    setSaving(false);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="mb-[18px] inline-flex cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-[#F5CE8E] bg-[#FFF3E0] px-[18px] py-2 text-xs font-semibold text-[#E65100] transition-colors hover:bg-[#F5CE8E]"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          stroke="#E65100"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 2l2 2-7 7H3v-2l7-7z" />
        </svg>
        Edit KPI Values
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader
          eyebrow="SYSTEM ADMIN · EDIT"
          title="Edit KPI Values"
          subtitle="Override the headline dashboard metrics"
          onClose={() => setOpen(false)}
        />
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-500">
                {f.label}
              </span>
              <input
                type="text"
                value={draft[f.key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                }
                className="rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-400"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-[10px] border border-line px-4 py-2 text-[13px] font-semibold text-ink-600 hover:bg-surface-150"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-[10px] bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </Modal>
    </>
  );
}
