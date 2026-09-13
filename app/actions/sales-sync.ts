"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { getActor } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { previewImportDeletion, deleteImportData } from "@/lib/sales-import-delete";
import { activeSyncRun, getSyncSettings, parseProgress, SYNC_SETTING_KEYS, type SyncProgress } from "@/lib/sales-sync";

export interface ActiveRun { id: number; fromDate: string | null; toDate: string | null; trigger: string | null; startedBy: string | null; startedAt: string; progress: SyncProgress | null }

/** The run in flight (if any) — polled by the Run card while a sync is working. */
export async function getActiveSalesSync(): Promise<ActiveRun | null> {
  const r = await activeSyncRun();
  if (!r) return null;
  return { id: r.id, fromDate: r.fromDate, toDate: r.toDate, trigger: r.trigger, startedBy: r.uploadedBy, startedAt: r.createdAt.toISOString(), progress: parseProgress(r.progress) };
}

/** A finished run's summary — used to show the outcome of a run that finished while the card was polling. */
export async function getSalesSyncRun(id: number): Promise<{ status: string; error: string | null; progress: SyncProgress | null; durationMs: number | null } | null> {
  const r = await prisma.salesImport.findUnique({ where: { id }, select: { status: true, error: true, progress: true, durationMs: true } });
  return r ? { status: r.status, error: r.error, progress: parseProgress(r.progress), durationMs: r.durationMs } : null;
}

export async function updateSalesSyncSettings(input: { lookbackDays?: number; enabled?: boolean }): Promise<{ ok: boolean; error?: string; settings?: { lookbackDays: number; enabled: boolean } }> {
  if ((await getRole()) !== "sysadmin") return { ok: false, error: "System admins only." };
  const writes: { key: string; value: string }[] = [];
  if (input.lookbackDays != null) {
    const n = Math.round(input.lookbackDays);
    if (!Number.isFinite(n) || n < 1 || n > 31) return { ok: false, error: "Lookback must be 1–31 days." };
    writes.push({ key: SYNC_SETTING_KEYS.lookbackDays, value: String(n) });
  }
  if (input.enabled != null) writes.push({ key: SYNC_SETTING_KEYS.enabled, value: input.enabled ? "true" : "false" });
  for (const w of writes) await prisma.setting.upsert({ where: { key: w.key }, update: { value: w.value }, create: w });
  if (writes.length) await logAudit("Setting", "CONFIG", `Sales sync setting changed: ${writes.map((w) => `${w.key}=${w.value}`).join(", ")}`);
  revalidatePath("/settings");
  revalidatePath("/sales-sync");
  return { ok: true, settings: await getSyncSettings() };
}

/** Count what rolling back a run would remove — shown in the confirm dialog before the destructive call. */
export async function previewSalesRunDeletion(id: number): Promise<{ ok: boolean; sales?: number; farmers?: number; mode?: string; error?: string }> {
  if ((await getRole()) !== "sysadmin") return { ok: false, error: "System admins only." };
  const imp = await prisma.salesImport.findUnique({ where: { id }, select: { id: true, rangeStart: true, rangeEnd: true, createdAt: true, status: true } });
  if (!imp) return { ok: false, error: "Run not found." };
  if (imp.status === "RUNNING") return { ok: false, error: "That run is still in progress." };
  const r = await previewImportDeletion(imp);
  return { ok: true, sales: r.sales, farmers: r.farmers, mode: r.mode };
}

/** Permanently roll back a run and everything it created (sysadmin only). */
export async function deleteSalesRun(id: number): Promise<{ ok: boolean; sales?: number; farmers?: number; error?: string }> {
  if ((await getRole()) !== "sysadmin") return { ok: false, error: "System admins only." };
  const imp = await prisma.salesImport.findUnique({ where: { id }, select: { filename: true, status: true } });
  if (!imp) return { ok: false, error: "Run not found." };
  if (imp.status === "RUNNING") return { ok: false, error: "That run is still in progress." };

  const res = await deleteImportData(id);
  if (!res.ok) return { ok: false, error: res.error ?? "Rollback failed." };

  await logAudit("Sale", "DELETE", `Rolled back sales run "${imp.filename}" — removed ${res.sales} sales, ${res.farmers} new-customer farmers`, (await getActor()).name);
  revalidatePath("/sales-sync");
  return { ok: true, sales: res.sales, farmers: res.farmers };
}
