"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { ADMIN_ROLE_CHOICES } from "@/lib/roles";
import { createUserAction, saveUser } from "@/app/actions/users";
import { listAssignableCampaigns, getCampaignerCampaignIds, setCampaignerCampaigns, type AssignableCampaign } from "@/app/actions/campaigners";
import type { UserRow } from "./types";

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted mb-1.5";
const inputCls =
  "w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-brand-500";

/**
 * System-Admin user form — creates a new account (user == null) or edits an
 * existing one. Mounted only while open, so state resets each time.
 */
export function UserFormModal({
  user,
  onClose,
}: {
  user: UserRow | null;
  onClose: () => void;
}) {
  const isEdit = !!user;
  const [employeeCode, setEmployeeCode] = useState(user?.employeeCode ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [roleKey, setRoleKey] = useState(user?.roleKey || "officer");
  const [mobile, setMobile] = useState(user?.mobile ?? "");
  const [workEmail, setWorkEmail] = useState(user?.workEmail ?? "");
  const [territory, setTerritory] = useState(user?.territory ?? "");
  const [active, setActive] = useState((user?.status ?? "Active") === "Active");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Campaigner-only: which campaigns this call-team user is assigned to.
  const isCampaigner = roleKey === "campaigner";
  const [campaigns, setCampaigns] = useState<AssignableCampaign[] | null>(null);
  const [assigned, setAssigned] = useState<Set<number>>(new Set());

  // Load the assignable-campaign list (once we first need it) + this user's existing assignments.
  useEffect(() => {
    if (!isCampaigner) return;
    if (campaigns === null) listAssignableCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    if (isEdit && user) getCampaignerCampaignIds(user.id).then((ids) => setAssigned(new Set(ids))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCampaigner]);

  const toggleCampaign = (id: number) =>
    setAssigned((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function submit() {
    setErr(null);
    start(async () => {
      const payload = { employeeCode, name, roleKey, mobile, workEmail, territory, active, password };
      const res = isEdit ? await saveUser({ id: user!.id, ...payload }) : await createUserAction(payload);
      if (!res.ok) { setErr(res.error ?? "Something went wrong."); return; }
      // Persist campaign assignments for campaigners (create returns the new id; edit uses the row id).
      if (isCampaigner) {
        const uid = isEdit ? user!.id : (res as { id?: number }).id;
        if (uid) {
          const a = await setCampaignerCampaigns(uid, [...assigned]);
          if (!a.ok) { setErr(a.error ?? "Saved the user, but assigning campaigns failed."); return; }
        }
      }
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose}>
      <ModalHeader
        eyebrow={isEdit ? "SYSTEM ADMIN · EDIT" : "SYSTEM ADMIN · NEW USER"}
        title={isEdit ? `Edit User — ${user!.name}` : "Add User"}
        subtitle={isEdit ? user!.email : "Create a login-ready account"}
        onClose={onClose}
      />
      <div className="px-6 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Employee Code *</label>
            <input
              className={inputCls}
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="e.g. VERDE1234"
            />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select className={inputCls} value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {ADMIN_ROLE_CHOICES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Full Name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Mobile</label>
            <input
              className={inputCls}
              inputMode="numeric"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              className={inputCls}
              value={active ? "Active" : "Inactive"}
              onChange={(e) => setActive(e.target.value === "Active")}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Work Email</label>
            <input className={inputCls} value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Territory / Zone</label>
            <input className={inputCls} value={territory} onChange={(e) => setTerritory(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{isEdit ? "Reset Password" : "Default Password"}</label>
            <input
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "leave blank to keep current password" : "blank = their mobile number"}
            />
            <div className="mt-1 text-[10.5px] text-ink-muted">
              {isEdit
                ? "Setting a password re-forces a change on their next login."
                : "The user is prompted to change it on first login."}
            </div>
          </div>

          {isCampaigner && (
            <div className="col-span-2">
              <label className={labelCls}>Assigned campaigns</label>
              <div className="rounded-[10px] border border-line bg-surface-50">
                {campaigns === null ? (
                  <div className="px-3 py-3 text-[12px] text-ink-muted">Loading campaigns…</div>
                ) : campaigns.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-ink-muted">No campaigns yet. Create one first, then assign it here.</div>
                ) : (
                  <div className="max-h-[190px] overflow-y-auto p-1.5">
                    {campaigns.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 hover:bg-surface-150">
                        <input type="checkbox" className="h-4 w-4 accent-[#00838F]" checked={assigned.has(c.id)} onChange={() => toggleCampaign(c.id)} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{c.name}</span>
                        <span className="shrink-0 rounded-full bg-surface-150 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-muted">{c.status}</span>
                        <span className="shrink-0 text-[10.5px] text-ink-muted">{c.startDate} → {c.endDate}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-1 text-[10.5px] text-ink-muted">
                Campaigners can only see and call the campaigns you tick here — nothing else in the portal.
              </div>
            </div>
          )}
        </div>

        {err && <div className="mt-3 text-[12px] text-danger">{err}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-[10px] border border-line bg-white px-[18px] py-[9px] text-[13px] font-semibold text-ink-600 hover:bg-surface-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-[10px] bg-[#678722] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#516A1B] disabled:opacity-50"
          >
            {pending ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
