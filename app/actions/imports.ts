"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { getActor } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { previewImportDeletion, deleteImportData } from "@/lib/sales-import-delete";

/** Count what deleting an import would remove — shown in the confirm dialog before the destructive call. */
export async function previewSalesImportDeletion(id: number): Promise<{ ok: boolean; sales?: number; farmers?: number; mode?: string; error?: string }> {
  if ((await getRole()) !== "sysadmin") return { ok: false, error: "System admins only." };
  const imp = await prisma.salesImport.findUnique({ where: { id }, select: { id: true, rangeStart: true, rangeEnd: true, createdAt: true } });
  if (!imp) return { ok: false, error: "Import not found." };
  const r = await previewImportDeletion(imp);
  return { ok: true, sales: r.sales, farmers: r.farmers, mode: r.mode };
}

/** Permanently delete an import and everything it created (sysadmin only). */
export async function deleteSalesImport(id: number): Promise<{ ok: boolean; sales?: number; farmers?: number; error?: string }> {
  if ((await getRole()) !== "sysadmin") return { ok: false, error: "System admins only." };
  const imp = await prisma.salesImport.findUnique({ where: { id }, select: { filename: true } });
  if (!imp) return { ok: false, error: "Import not found." };

  const res = await deleteImportData(id);
  if (!res.ok) return { ok: false, error: res.error ?? "Delete failed." };

  await logAudit("Sale", "DELETE", `Deleted sales import "${imp.filename}" — removed ${res.sales} sales, ${res.farmers} new-customer farmers`, (await getActor()).name);
  revalidatePath("/imports");
  return { ok: true, sales: res.sales, farmers: res.farmers };
}
