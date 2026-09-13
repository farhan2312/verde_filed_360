"use client";

import { useMemo, useState, useTransition } from "react";
import { ROLE_META, USER_STATUS_META } from "@/lib/status";
import { EmptyState } from "@/components/ui";
import { Modal, ModalHeader } from "@/components/interactive";
import { deleteUserAction } from "@/app/actions/users";
import { EditPencil } from "./EditPencil";
import { UserFormModal } from "./UserFormModal";
import { UserDetailModal } from "./UserDetailModal";
import type { UserRow } from "./types";

const GRID =
  "grid grid-cols-[1.35fr_0.9fr_0.9fr_0.85fr_0.75fr_0.55fr_0.5fr_120px] gap-2 px-[22px] items-center";

/** Sentinel for the "no store mapped" filter option (a real store can never be named this). */
const NO_STORE = "__none__";

/** Role filter chips — same order as the default sort (admins → officers). */
const ROLE_FILTERS: { key: string; label: string }[] = [
  { key: "sysadmin", label: "System Admin" },
  { key: "central", label: "Central Admin" },
  { key: "regional", label: "Regional Manager" },
  { key: "officer", label: "Agri Officer" },
];

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Whole user row is dimmed when inactive; visits text greyed. */
function rowColors(status: string) {
  const inactive = status === "Inactive";
  return {
    opacity: inactive ? 0.5 : 1,
    visitsColor: inactive ? "#9E9E9E" : "#1A1C1A",
  };
}

/** Orange when the user has not been active recently (string contains "day"). */
function lastActiveColor(s: string) {
  return /day/i.test(s) ? "#E65100" : "#757575";
}

const ROLE_CARDS: { accent: string; title: string; body: string }[] = [
  {
    accent: "#678722",
    title: "Regional Manager",
    body: "All views, analytics, farmer data, action planner, lead management",
  },
  {
    accent: "#1565C0",
    title: "Agri Officer",
    body: "Personal dashboard, new visits, assigned farmers, lead pipeline",
  },
  {
    accent: "#7B1FA2",
    title: "Central Admin",
    body: "Cross-region analytics, all farmers, action planner, user management",
  },
  {
    accent: "#E65100",
    title: "System Admin",
    body: "User management, system settings, master data, audit logs",
  },
];

export function UsersTab({
  rows,
  canEdit,
}: {
  rows: UserRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [viewing, setViewing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [delPending, startDelete] = useTransition();
  // Filters — rows arrive pre-sorted by role then name; filtering preserves that order.
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("");
  const [fStore, setFStore] = useState("");
  const [fStatus, setFStatus] = useState("");

  const storeOptions = useMemo(
    () => [...new Set(rows.map((r) => r.storeName).filter((s) => s && s !== "—"))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!fRole || r.roleKey === fRole) &&
      // NO_STORE is the audit case: "which officers aren't mapped to a store?"
      (!fStore || (fStore === NO_STORE ? r.storeName === "—" : r.storeName === fStore)) &&
      (!fStatus || r.status === fStatus) &&
      (!needle ||
        [r.name, r.employeeCode, r.storeName, r.territory, r.zone, r.mobile, r.roleLabel]
          .some((v) => v?.toLowerCase().includes(needle))));
  }, [rows, q, fRole, fStore, fStatus]);
  const filtered = Boolean(q.trim() || fRole || fStore || fStatus);
  const clearAll = () => { setQ(""); setFRole(""); setFStore(""); setFStatus(""); };

  const confirmDelete = () => {
    if (!deleting) return;
    setDelErr(null);
    startDelete(async () => {
      const res = await deleteUserAction(deleting.id);
      if (res.ok) setDeleting(null);
      else setDelErr(res.error ?? "Delete failed");
    });
  };

  return (
    <div>
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[13px] text-[#757575]">
          Manage user accounts, roles, stores, and territory assignments
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="cursor-pointer rounded-[10px] bg-[#678722] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#516A1B]"
          >
            + Add User
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, employee code, store, district…"
            className="w-full max-w-[380px] rounded-xl border-[1.5px] border-[#E0E0E0] bg-white px-[16px] py-[9px] text-[13px] outline-none focus:border-[#678722] focus:shadow-[0_0_0_3px_rgba(46,125,50,0.1)]"
          />
          <button
            type="button"
            onClick={() => setFRole("")}
            className="rounded-full border-[1.5px] px-3.5 py-[6px] text-[11.5px] font-semibold"
            style={{ background: fRole === "" ? "#424242" : "#fff", color: fRole === "" ? "#fff" : "#616161", borderColor: fRole === "" ? "transparent" : "#E0E0E0" }}
          >
            All roles
          </button>
          {ROLE_FILTERS.map((r) => {
            const meta = ROLE_META[r.label] ?? { bg: "#F5F5F5", c: "#616161" };
            const on = fRole === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setFRole(on ? "" : r.key)}
                className="rounded-full border-[1.5px] px-3.5 py-[6px] text-[11.5px] font-semibold"
                style={{ background: on ? meta.c : "#fff", color: on ? "#fff" : meta.c, borderColor: on ? "transparent" : "#E0E0E0" }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={fStore}
            onChange={(e) => setFStore(e.target.value)}
            className="rounded-xl border-[1.5px] border-[#E0E0E0] bg-white px-3 py-[7px] text-[12.5px] text-[#424242] outline-none focus:border-[#678722]"
          >
            <option value="">All stores</option>
            <option value={NO_STORE}>— No store mapped</option>
            {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="rounded-xl border-[1.5px] border-[#E0E0E0] bg-white px-3 py-[7px] text-[12.5px] text-[#424242] outline-none focus:border-[#678722]"
          >
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <span className="text-[12px] text-[#9E9E9E]">
            {shown.length.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")} users
          </span>
          {filtered && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-full border-[1.5px] border-[#E0E0E0] bg-white px-3.5 py-[6px] text-[11.5px] font-semibold text-[#C62828]"
            >
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-[14px] border border-black/[0.03] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
        <div className="min-w-[1000px] xl:min-w-0">
        <div
          className={`${GRID} border-b border-[#F0F0F0] bg-[#FAFAFA] py-[14px] text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[#9E9E9E]`}
        >
          <div>User</div>
          <div>Role</div>
          <div>Store</div>
          <div>Territory</div>
          <div>Last Active</div>
          <div>Visits MTD</div>
          <div>Status</div>
          <div />
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No users yet" hint="Seed the database to see users." />
        ) : shown.length === 0 ? (
          <EmptyState title="No users match these filters" hint="Try a different role, store, or search term." />
        ) : (
          shown.map((ur) => {
            const role = ROLE_META[ur.roleLabel] ?? { bg: "#F5F5F5", c: "#757575" };
            const st = USER_STATUS_META[ur.status] ?? { bg: "#F5F5F5", c: "#757575" };
            const { opacity, visitsColor } = rowColors(ur.status);
            return (
              <div
                key={ur.id}
                className={`${GRID} border-b border-[#F8F8F8] py-[14px]`}
                style={{ opacity }}
              >
                {/* User — click to open the detail + audit-trail popup */}
                <button
                  type="button"
                  onClick={() => setViewing(ur)}
                  className="flex items-center gap-[10px] rounded-lg -mx-1 px-1 py-0.5 text-left hover:bg-[#F5FBF5]"
                  title="View employee details & activity"
                >
                  <div
                    className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: ur.grad }}
                  >
                    {ur.init}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[#1A1C1A]">
                      {ur.name}
                    </div>
                    <div className="truncate text-[10.5px] text-[#BDBDBD]">{ur.email}</div>
                  </div>
                </button>
                {/* Role */}
                <div>
                  <span
                    className="inline-block rounded-[20px] px-[10px] py-[3px] text-[10.5px] font-semibold"
                    style={{ background: role.bg, color: role.c }}
                  >
                    {ur.roleLabel}
                  </span>
                </div>
                {/* Store — the officer's mapped Verde Agrotech */}
                <div className="truncate pr-2 text-[12px] font-semibold" style={{ color: ur.storeName === "—" ? "#BDBDBD" : "#1565C0" }} title={ur.storeName}>
                  {ur.storeName}
                </div>
                {/* Territory */}
                <div className="truncate pr-2 text-[12px] text-[#616161]" title={ur.territory || ur.zone}>{ur.territory || ur.zone}</div>
                {/* Last Active */}
                <div className="text-[12px]" style={{ color: lastActiveColor(ur.lastActive) }}>
                  {ur.lastActive}
                </div>
                {/* Visits MTD */}
                <div className="text-[13px] font-bold" style={{ color: visitsColor }}>
                  {ur.visitsMtd}
                </div>
                {/* Status */}
                <div>
                  <span
                    className="inline-block rounded-[20px] px-[10px] py-[3px] text-[10px] font-semibold"
                    style={{ background: st.bg, color: st.c }}
                  >
                    {ur.status}
                  </span>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(ur)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#F5F7F5] px-[10px] py-[5px] text-[11px] font-semibold text-[#678722] hover:bg-[#F3F8E6]"
                      >
                        <EditPencil />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDelErr(null); setDeleting(ur); }}
                        aria-label={`Delete ${ur.name}`}
                        title="Delete user"
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#FDECEA] px-[8px] py-[6px] text-[#C62828] hover:bg-[#F9DCD8]"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        </div>
        </div>
      </div>

      {/* Role permissions summary */}
      <div className="mt-5 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_CARDS.map((c) => (
          <div
            key={c.title}
            className="rounded-xl border border-black/[0.03] bg-white p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            style={{ borderTop: `3px solid ${c.accent}` }}
          >
            <div
              className="mb-2 text-[12px] font-bold"
              style={{ color: c.accent }}
            >
              {c.title}
            </div>
            <div className="text-[11px] leading-[1.7] text-[#616161]">{c.body}</div>
          </div>
        ))}
      </div>

      {creating && <UserFormModal user={null} onClose={() => setCreating(false)} />}
      {editing && <UserFormModal user={editing} onClose={() => setEditing(null)} />}
      {viewing && <UserDetailModal user={viewing} onClose={() => setViewing(null)} />}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)}>
          <ModalHeader
            eyebrow="SYSTEM ADMIN · DELETE"
            eyebrowColor="#C62828"
            title={`Delete ${deleting.name}?`}
            subtitle={deleting.email}
            onClose={() => setDeleting(null)}
          />
          <div className="px-6 py-5">
            <div className="text-[13px] leading-[1.6] text-ink-600">
              This permanently removes the account and its login access. This can&apos;t be undone.
            </div>
            {delErr && <div className="mt-3 text-[12px] text-danger">{delErr}</div>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={delPending}
                className="rounded-[10px] border border-line bg-white px-[18px] py-[9px] text-[13px] font-semibold text-ink-600 hover:bg-surface-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={delPending}
                className="rounded-[10px] bg-[#C62828] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#B71C1C] disabled:opacity-50"
              >
                {delPending ? "Deleting…" : "Delete User"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
