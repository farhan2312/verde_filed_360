"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRole } from "@/lib/session";
import { BUG_SEVERITIES, BUG_STATUSES, BUG_KINDS, type BugVM } from "@/lib/bug-constants";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** File a bug from the "Report a Bug" modal. Any signed-in user may report. */
export async function createBug(input: {
  title: string; description?: string; kind?: string; severity?: string; page?: string; screenshot?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "A title is required." };
  const kind = BUG_KINDS.includes((input.kind ?? "") as never) ? input.kind! : "BUG";
  const severity = BUG_SEVERITIES.includes((input.severity ?? "") as never) ? input.severity! : "MEDIUM";
  // Guard against oversized screenshots (server-action body limit).
  const screenshot = input.screenshot && input.screenshot.length < 3_500_000 ? input.screenshot : null;
  try {
    const session = await getSession();
    let reporter: string | null = null, reporterCode: string | null = null;
    if (session?.userId) {
      const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, employeeCode: true } });
      reporter = u?.name ?? null; reporterCode = u?.employeeCode ?? null;
    }
    await prisma.bug.create({
      data: {
        title: title.slice(0, 200),
        description: (input.description ?? "").trim().slice(0, 4000) || null,
        kind,
        severity,
        page: (input.page ?? "").slice(0, 200) || null,
        reporter, reporterCode, screenshot,
      },
    });
    revalidatePath("/bugs");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit the report." };
  }
}

/** All bugs for the tracker (sysadmin only). */
export async function listBugs(): Promise<BugVM[]> {
  if ((await getRole()) !== "sysadmin") return [];
  try {
    const rows = await prisma.bug.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    return rows.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description ?? "",
      kind: b.kind,
      severity: b.severity,
      status: b.status,
      page: b.page ?? "",
      reporter: b.reporter ?? "—",
      reporterCode: b.reporterCode ?? "",
      hasScreenshot: !!b.screenshot,
      resolution: b.resolution ?? "",
      createdAt: iso(b.createdAt)!,
      resolvedAt: iso(b.resolvedAt),
    }));
  } catch {
    return [];
  }
}

/** The screenshot data URL for one bug (sysadmin only) — loaded on demand, not in the list. */
export async function getBugScreenshot(id: number): Promise<string | null> {
  if ((await getRole()) !== "sysadmin") return null;
  try {
    const b = await prisma.bug.findUnique({ where: { id }, select: { screenshot: true } });
    return b?.screenshot ?? null;
  } catch {
    return null;
  }
}

/** Move a bug across the pipeline (sysadmin only). Stamps resolvedAt on FIXED/CLOSED. */
export async function updateBugStatus(id: number, status: string): Promise<{ ok: boolean; error?: string }> {
  if ((await getRole()) !== "sysadmin") return { ok: false, error: "Not authorised." };
  if (!BUG_STATUSES.includes(status as never)) return { ok: false, error: "Invalid status." };
  try {
    const resolved = status === "FIXED" || status === "CLOSED";
    await prisma.bug.update({
      where: { id },
      data: { status, resolvedAt: resolved ? new Date() : null },
    });
    revalidatePath("/bugs");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

/** Save the admin's resolution notes; optionally close the bug in the same action (sysadmin only). */
export async function saveBugResolution(id: number, resolution: string, close: boolean): Promise<{ ok: boolean; error?: string }> {
  if ((await getRole()) !== "sysadmin") return { ok: false, error: "Not authorised." };
  try {
    const data: { resolution: string | null; status?: string; resolvedAt?: Date } = {
      resolution: resolution.trim().slice(0, 4000) || null,
    };
    if (close) { data.status = "CLOSED"; data.resolvedAt = new Date(); }
    await prisma.bug.update({ where: { id }, data });
    revalidatePath("/bugs");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

/** Switch a report between Bug and Feature (sysadmin only). */
export async function updateBugKind(id: number, kind: string): Promise<{ ok: boolean }> {
  if ((await getRole()) !== "sysadmin") return { ok: false };
  if (!BUG_KINDS.includes(kind as never)) return { ok: false };
  try { await prisma.bug.update({ where: { id }, data: { kind } }); revalidatePath("/bugs"); return { ok: true }; }
  catch { return { ok: false }; }
}

export async function updateBugSeverity(id: number, severity: string): Promise<{ ok: boolean }> {
  if ((await getRole()) !== "sysadmin") return { ok: false };
  if (!BUG_SEVERITIES.includes(severity as never)) return { ok: false };
  try { await prisma.bug.update({ where: { id }, data: { severity } }); revalidatePath("/bugs"); return { ok: true }; }
  catch { return { ok: false }; }
}

export async function deleteBug(id: number): Promise<{ ok: boolean }> {
  if ((await getRole()) !== "sysadmin") return { ok: false };
  try { await prisma.bug.delete({ where: { id } }); revalidatePath("/bugs"); return { ok: true }; }
  catch { return { ok: false }; }
}
