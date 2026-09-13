"use client";

import { useEffect, useState } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { ROLE_META } from "@/lib/status";
import { getUserActivity, type UserActivityRow } from "@/app/actions/users";
import type { UserRow } from "./types";

const ACTION_COLOR: Record<string, string> = {
  CREATE: "#678722", UPDATE: "#1565C0", CONFIG: "#7B1FA2", EXPORT: "#00838F", DELETE: "#C62828", LOGIN: "#616161",
};

function Field({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-[10px] bg-[#F7F9F7] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold" style={{ color: accent ?? "#1A1C1A" }}>{value || "—"}</div>
    </div>
  );
}

export function UserDetailModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [activity, setActivity] = useState<UserActivityRow[] | null>(null);
  useEffect(() => { getUserActivity(user.name).then(setActivity); }, [user.name]);
  const role = ROLE_META[user.roleLabel] ?? { bg: "#F5F5F5", c: "#616161" };

  return (
    <Modal open onClose={onClose} className="max-w-[680px]">
      <ModalHeader eyebrow={user.employeeCode || "Employee"} eyebrowColor={role.c} title={user.name}
        subtitle={`${user.roleLabel}${user.storeName && user.storeName !== "—" ? ` · ${user.storeName}` : ""}`} onClose={onClose} />
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
        {/* Basic info */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Employee code" value={user.employeeCode} />
          <Field label="Phone" value={user.mobile} />
          <Field label="Role" value={user.roleLabel} accent={role.c} />
          <Field label="Store" value={user.storeName} />
          <Field label="District / territory" value={user.territory || user.zone} />
          <Field label="Status" value={user.status} accent={user.status === "Active" ? "#678722" : "#9E9E9E"} />
          <Field label="Last active" value={user.lastActive} />
          <Field label="Visits (MTD)" value={user.visitsMtd} />
        </div>

        {/* Audit trail */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-bold text-[#1A1C1A]">Activity &amp; audit trail</div>
            <div className="text-[11px] text-[#9E9E9E]">{activity == null ? "" : `${activity.length} recent event${activity.length === 1 ? "" : "s"}`}</div>
          </div>
          {activity == null ? (
            <div className="py-6 text-center text-[12.5px] text-[#9E9E9E]">Loading…</div>
          ) : activity.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[#E0E0E0] bg-[#FAFAFA] px-4 py-6 text-center text-[12.5px] text-[#9E9E9E]">
              No recorded data-change events for this employee yet. (The audit log captures creates, edits, deletes, sends, config changes and exports. “Last active” above reflects their most recent app usage.)
            </div>
          ) : (
            <div className="overflow-hidden rounded-[10px] border border-[#F0F0F0]">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 border-b border-[#F5F5F5] px-3 py-2 last:border-0">
                  <span className="mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: ACTION_COLOR[a.action] ?? "#757575" }}>{a.action}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-[#1A1C1A]">{a.detail || a.entity || "—"}</div>
                    <div className="text-[10.5px] text-[#9E9E9E]">{a.ts}{a.ip ? ` · ${a.ip}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
