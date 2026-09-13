"use client";

import { useState, useTransition } from "react";
import { PERSONAS, ROLE_ORDER, type RoleKey } from "@/lib/roles";
import { initials } from "@/lib/format";
import { Card } from "@/components/ui";
import { approveUserAction, rejectUserAction } from "@/app/actions/users";

export interface PendingUser {
  id: number;
  name: string;
  code: string;
  requestedRoleKey: RoleKey;
  requestedRoleLabel: string;
  when: string;
}

export function PendingApprovals({ pending }: { pending: PendingUser[] }) {
  if (pending.length === 0) return null;
  return (
    <Card className="mb-5 overflow-hidden border-gold-200 bg-gold-50/40 p-0">
      <div className="flex items-center gap-2 border-b border-gold-200/70 px-5 py-3.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-[12px] font-bold text-white">
          {pending.length}
        </span>
        <div className="text-[14px] font-bold text-ink">Pending access requests</div>
        <div className="text-[12px] text-ink-muted">· awaiting your approval</div>
      </div>
      <div className="divide-y divide-line">
        {pending.map((u) => (
          <PendingRow key={u.id} user={u} />
        ))}
      </div>
    </Card>
  );
}

function PendingRow({ user }: { user: PendingUser }) {
  const [role, setRole] = useState<RoleKey>(user.requestedRoleKey);
  const [pending, start] = useTransition();

  const approve = () => start(() => void approveUserAction(user.id, role));
  const reject = () => start(() => void rejectUserAction(user.id));

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
        style={{ background: PERSONAS[user.requestedRoleKey].color }}
      >
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-ink">{user.name}</div>
        <div className="truncate text-[12px] font-medium text-ink-muted">
          <span className="text-ink-500">Code:</span> {user.code || "—"}
        </div>
      </div>
      <div className="hidden text-[11.5px] text-ink-500 sm:block">
        Requested: <span className="font-medium text-ink-700">{user.requestedRoleLabel}</span>
        <span className="text-ink-400"> · {user.when}</span>
      </div>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as RoleKey)}
        disabled={pending}
        className="rounded-lg border border-line bg-white px-2.5 py-2 text-[12.5px] font-medium text-ink outline-none focus:border-brand-400"
      >
        {ROLE_ORDER.map((k) => (
          <option key={k} value={k}>
            {PERSONAS[k].role}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={approve}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={reject}
        disabled={pending}
        className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-ink-600 transition-colors hover:bg-danger-50 hover:text-danger disabled:opacity-60"
      >
        Reject
      </button>
    </div>
  );
}
