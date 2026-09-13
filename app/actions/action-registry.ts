"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, getActor, canSignOff, farmerScopeWhere } from "@/lib/scope";
import { FOLLOWUP_REASONS, type ActionVM, type FarmerPick } from "@/lib/action-constants";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const shortStore = (s?: string | null) => (s ? s.replace(/\s*\(.*?\)\s*/g, "").trim() || s : "");
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Row-level scope for actions (officer → own store, RM → their managed stores, central/admin → all). */
function actionScope(scope: Awaited<ReturnType<typeof getScope>>): Prisma.ActionWhereInput | "none" | null {
  if (scope.role === "campaigner") return "none";
  if (scope.role === "officer") return scope.storeId != null ? { storeId: scope.storeId } : "none";
  if (scope.role === "regional") return scope.managedStoreIds && scope.managedStoreIds.length ? { storeId: { in: scope.managedStoreIds } } : "none";
  return null; // central + sysadmin: all
}

function toVM(a: Prisma.ActionGetPayload<{ include: { farmer: { select: { id: true; name: true; mobile: true; village: true } }; store: { select: { name: true; zone: true } } } }>): ActionVM {
  const due = a.dueDate;
  return {
    id: a.id,
    farmerId: a.farmerId,
    farmerName: a.farmer?.name ?? "—",
    farmerMobile: a.farmer?.mobile ?? "",
    farmerVillage: a.farmer?.village ?? "",
    storeId: a.storeId,
    storeName: shortStore(a.store?.name),
    district: a.store?.zone ?? "",
    visitId: a.visitId,
    reason: a.reason ?? "",
    note: a.note ?? "",
    workingComment: a.workingComment ?? "",
    dueDate: due.toISOString().slice(0, 10),
    status: a.status,
    overdue: a.status === "OPEN" && due < startOfToday(),
    createdBy: a.createdByName ?? "",
    createdAt: iso(a.createdAt)!,
    completedBy: a.completedByName ?? "",
    completedAt: iso(a.completedAt),
    completionNote: a.completionNote ?? "",
  };
}

/** Every action in the viewer's scope (newest-due open first, then done). */
export async function listActions(): Promise<ActionVM[]> {
  const scope = await getScope();
  const sw = actionScope(scope);
  if (sw === "none") return [];
  try {
    const rows = await prisma.action.findMany({
      where: sw ?? undefined,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 2000,
      include: {
        farmer: { select: { id: true, name: true, mobile: true, village: true } },
        store: { select: { name: true, zone: true } },
      },
    });
    return rows.map(toVM);
  } catch {
    return [];
  }
}

/** Count of overdue (OPEN + past-due) actions in the viewer's scope — for the sidebar badge. */
export async function countOverdueActions(): Promise<number> {
  const scope = await getScope();
  const sw = actionScope(scope);
  if (sw === "none") return 0;
  try {
    return await prisma.action.count({ where: { AND: [sw ?? {}, { status: "OPEN", dueDate: { lt: startOfToday() } }] } });
  } catch {
    return 0;
  }
}

/** Farmer search for the manual "New action" form — scoped, by name or mobile. */
export async function searchFarmersForAction(q: string): Promise<FarmerPick[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const scope = await getScope();
  const fs = farmerScopeWhere(scope);
  if (fs === "none") return [];
  const conds: Prisma.FarmerWhereInput[] = [
    { source: "REAL" },
    { OR: [{ name: { contains: term, mode: "insensitive" } }, { mobile: { contains: term.replace(/\D/g, "") || term } }] },
  ];
  if (fs) conds.push(fs);
  try {
    const rows = await prisma.farmer.findMany({
      where: { AND: conds },
      select: { id: true, name: true, mobile: true, village: true, storeId: true, store: { select: { name: true } } },
      take: 20, orderBy: { name: "asc" },
    });
    return rows.map((f) => ({
      id: f.id, name: f.name, mobile: f.mobile ?? "", village: f.village ?? "",
      storeId: f.storeId, storeName: shortStore(f.store?.name),
    }));
  } catch {
    return [];
  }
}

/** Create a follow-up action manually from the registry. */
export async function createAction(input: {
  farmerId: number; dueDate: string; reason?: string; note?: string; storeId?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  if (actionScope(scope) === "none") return { ok: false, error: "No store or district assigned to your account." };
  const farmerId = Number(input.farmerId);
  if (!farmerId) return { ok: false, error: "Pick a farmer." };
  const due = input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
  if (!due || Number.isNaN(due.getTime())) return { ok: false, error: "Pick a valid due date." };
  const reason = input.reason && FOLLOWUP_REASONS.includes(input.reason as never) ? input.reason : (input.reason?.trim() || null);

  // Store: officers are pinned to their own store; RM/central/admin choose one.
  let storeId: number | null;
  if (scope.role === "officer") storeId = scope.storeId;
  else storeId = input.storeId ?? null;

  const actor = await getActor();
  try {
    await prisma.action.create({
      data: {
        farmerId, storeId, dueDate: due, reason, note: (input.note ?? "").trim().slice(0, 2000) || null,
        status: "OPEN", createdByName: actor.name, createdByCode: actor.code,
      },
    });
    revalidatePath("/action-registry");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the action." };
  }
}

/** Mark an action done — a closing summary is required. */
export async function completeAction(id: number, note?: string): Promise<{ ok: boolean; error?: string }> {
  const scope = await getScope();
  if (actionScope(scope) === "none") return { ok: false, error: "Not authorised." };
  const closing = (note ?? "").trim();
  if (!closing) return { ok: false, error: "A closing summary is required to mark an action done." };
  const actor = await getActor();
  // Only the creator, the RM who manages that store, or a central/sysadmin may complete it.
  const target = await prisma.action.findUnique({ where: { id }, select: { storeId: true, createdByCode: true } });
  if (!target) return { ok: false, error: "Action not found." };
  if (!canSignOff(scope, actor.code, { storeId: target.storeId, byCode: target.createdByCode }))
    return { ok: false, error: "You can only complete actions you created, or (as their RM/admin) ones in your stores." };
  try {
    await prisma.action.update({
      where: { id },
      data: {
        status: "DONE", completedAt: new Date(), completedByName: actor.name, completedByCode: actor.code,
        completionNote: closing.slice(0, 2000),
      },
    });
    revalidatePath("/action-registry");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

export interface ActionCommentVM { id: number; text: string; author: string; authorCode: string; at: string }

/** The working-comment audit history for one action (newest first). */
export async function getActionComments(id: number): Promise<ActionCommentVM[]> {
  const scope = await getScope();
  const sw = actionScope(scope);
  if (sw === "none") return [];
  try {
    // Confirm the action is in scope before exposing its comments.
    const inScope = await prisma.action.findFirst({ where: { AND: [{ id }, sw ?? {}] }, select: { id: true } });
    if (!inScope) return [];
    const rows = await prisma.actionComment.findMany({ where: { actionId: id }, orderBy: { id: "desc" }, take: 200 });
    return rows.map((c) => ({ id: c.id, text: c.text, author: c.authorName ?? "", authorCode: c.authorCode ?? "", at: c.createdAt.toISOString() }));
  } catch {
    return [];
  }
}

/** Add a working comment to an action (append-only audit log; also updates the latest for the list). */
export async function addActionComment(id: number, text: string): Promise<{ ok: boolean; error?: string; comment?: ActionCommentVM }> {
  const scope = await getScope();
  const sw = actionScope(scope);
  if (sw === "none") return { ok: false, error: "Not authorised." };
  const t = (text ?? "").trim();
  if (!t) return { ok: false, error: "Comment is empty." };
  try {
    const inScope = await prisma.action.findFirst({ where: { AND: [{ id }, sw ?? {}] }, select: { id: true } });
    if (!inScope) return { ok: false, error: "Action not found or out of your scope." };
    const actor = await getActor();
    const c = await prisma.actionComment.create({
      data: { actionId: id, text: t.slice(0, 2000), authorName: actor.name, authorCode: actor.code },
    });
    await prisma.action.update({ where: { id }, data: { workingComment: t.slice(0, 2000) } });
    revalidatePath("/action-registry");
    return { ok: true, comment: { id: c.id, text: c.text, author: c.authorName ?? "", authorCode: c.authorCode ?? "", at: c.createdAt.toISOString() } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the comment." };
  }
}

/** Re-open a completed action. */
export async function reopenAction(id: number): Promise<{ ok: boolean }> {
  const scope = await getScope();
  if (actionScope(scope) === "none") return { ok: false };
  try {
    await prisma.action.update({ where: { id }, data: { status: "OPEN", completedAt: null, completedByName: null, completedByCode: null, completionNote: null } });
    revalidatePath("/action-registry");
    return { ok: true };
  } catch { return { ok: false }; }
}
