"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, getActor, type Scope } from "@/lib/scope";
import { canAccess } from "@/lib/roles";
import { notifyUsers } from "@/lib/notify";
import { allRmStores } from "@/lib/rm-stores";
import { buildStyledWorkbookB64 } from "@/lib/xlsx-styled";
import { shortStoreName } from "@/lib/store-utils";
import { runVisual, scopeStoreIds, type RunOpts } from "@/lib/custom-analytics/engine";
import { TEMPLATES } from "@/lib/custom-analytics/templates";
import { fieldMeta, valueLabel, valueFormat } from "@/lib/custom-analytics/model";
import { dimLabel } from "@/lib/custom-analytics/format";
import { VISUAL_META, type ReportDoc, type Visual, type PageFilters, type CrossFilter, type VisualResult } from "@/lib/custom-analytics/types";

/**
 * Custom analytics (Analytics → My analytics / Shared with me). Everyone with Analytics access except
 * campaigners can build. Reports are view-only for people they're shared with; data always resolves in
 * the VIEWER's scope (engine.ts), so a shared report never shows anyone more than they could see anyway.
 */

export interface ReportCard {
  id: number; title: string; description: string; ownerName: string; updatedAt: string;
  pages: number; visuals: number; shares: number; isOwner: boolean;
}
export interface ReportFull {
  id: number; title: string; description: string; doc: ReportDoc; ownerName: string; isOwner: boolean;
  shares: { userId: number; name: string; role: string }[]; pinned: boolean; updatedAt: string;
}
export interface ShareCandidate { id: number; name: string; code: string | null; role: string; store: string | null }
/** Page-filter options in the viewer's scope. RMs are user ACCOUNTS — see getFilterOptions. */
export interface FilterOptions {
  stores: { id: number; name: string; zone: string | null }[];
  regions: string[];
  rms: { id: number; name: string }[];
}

const ROLE_LABEL: Record<string, string> = { ASR: "Agri Officer", STORE_MANAGER: "Agri Officer", REGIONAL: "Regional Manager", CENTRAL: "Central Admin", SYSADMIN: "System Admin" };
const pinKey = (userId: number) => `customReport.pin:${userId}`;

async function me(): Promise<{ scope: Scope; userId: number; name: string } | null> {
  const scope = await getScope();
  if (scope.userId == null || scope.role === "campaigner" || !canAccess("analytics", scope.role)) return null;
  const actor = await getActor();
  return { scope, userId: scope.userId, name: actor.name };
}

/** Light structural clean-up of a saved doc: bounded sizes, known visual types, sane grid positions. */
function sanitize(doc: ReportDoc): ReportDoc {
  const pages = (Array.isArray(doc?.pages) ? doc.pages : []).slice(0, 20).map((p, i) => ({
    id: String(p.id || `p${i}`).slice(0, 20),
    name: String(p.name || `Page ${i + 1}`).slice(0, 60),
    filters: (p.filters ?? {}) as PageFilters,
    visuals: (Array.isArray(p.visuals) ? p.visuals : []).filter((v) => v && VISUAL_META[v.type]).slice(0, 40).map((v) => ({
      ...v,
      id: String(v.id).slice(0, 20),
      title: v.title ? String(v.title).slice(0, 120) : undefined,
      values: (v.values ?? []).slice(0, 6),
      dims: v.dims?.slice(0, 4),
      layout: {
        x: Math.max(0, Math.min(11, Math.round(v.layout?.x ?? 0))),
        y: Math.max(0, Math.min(500, Math.round(v.layout?.y ?? 0))),
        w: Math.max(2, Math.min(12, Math.round(v.layout?.w ?? 6))),
        h: Math.max(2, Math.min(30, Math.round(v.layout?.h ?? 6))),
      },
    })),
  }));
  return { version: 1, pages: pages.length ? pages : [{ id: "p0", name: "Page 1", filters: {}, visuals: [] }] };
}

function card(r: { id: number; title: string; description: string | null; ownerName: string | null; updatedAt: Date; doc: unknown; _count?: { shares: number } }, isOwner: boolean): ReportCard {
  const doc = r.doc as ReportDoc;
  return {
    id: r.id, title: r.title, description: r.description ?? "", ownerName: r.ownerName ?? "—", updatedAt: r.updatedAt.toISOString(),
    pages: doc?.pages?.length ?? 0, visuals: doc?.pages?.reduce((a, p) => a + (p.visuals?.length ?? 0), 0) ?? 0,
    shares: r._count?.shares ?? 0, isOwner,
  };
}

export async function listMyReports(): Promise<ReportCard[]> {
  const u = await me(); if (!u) return [];
  const rows = await prisma.customReport.findMany({ where: { ownerId: u.userId }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { shares: true } } } });
  return rows.map((r) => card(r, true));
}

export async function listSharedReports(): Promise<ReportCard[]> {
  const u = await me(); if (!u) return [];
  const rows = await prisma.customReport.findMany({ where: { shares: { some: { userId: u.userId } }, NOT: { ownerId: u.userId } }, orderBy: { updatedAt: "desc" } });
  return rows.map((r) => card(r, false));
}

/** A report the current user owns or has been shared. */
async function accessible(id: number, userId: number) {
  return prisma.customReport.findFirst({ where: { id, OR: [{ ownerId: userId }, { shares: { some: { userId } } }] } });
}

export async function getReport(id: number): Promise<ReportFull | null> {
  const u = await me(); if (!u) return null;
  const r = await accessible(id, u.userId);
  if (!r) return null;
  const isOwner = r.ownerId === u.userId;
  const [shares, pin] = await Promise.all([
    isOwner ? prisma.customReportShare.findMany({ where: { reportId: id }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    prisma.setting.findUnique({ where: { key: pinKey(u.userId) } }),
  ]);
  const users = shares.length ? await prisma.user.findMany({ where: { id: { in: shares.map((s) => s.userId) } }, select: { id: true, name: true, role: true } }) : [];
  const byId = new Map(users.map((x) => [x.id, x]));
  return {
    id: r.id, title: r.title, description: r.description ?? "", doc: sanitize(r.doc as unknown as ReportDoc), ownerName: r.ownerName ?? "—", isOwner,
    shares: shares.map((s) => ({ userId: s.userId, name: byId.get(s.userId)?.name ?? `User #${s.userId}`, role: ROLE_LABEL[String(byId.get(s.userId)?.role)] ?? "" })),
    pinned: pin?.value === String(r.id), updatedAt: r.updatedAt.toISOString(),
  };
}

export async function saveReport(input: { id?: number | null; title: string; description?: string; doc: ReportDoc }): Promise<{ ok: boolean; id?: number; error?: string }> {
  const u = await me(); if (!u) return { ok: false, error: "You don't have access to custom analytics." };
  const title = (input.title ?? "").trim().slice(0, 120);
  if (!title) return { ok: false, error: "Give the report a name." };
  const doc = sanitize(input.doc) as unknown as Prisma.InputJsonValue;
  const description = input.description?.trim().slice(0, 300) || null;
  try {
    if (input.id) {
      const r = await prisma.customReport.findUnique({ where: { id: input.id }, select: { ownerId: true } });
      if (!r) return { ok: false, error: "Report not found." };
      if (r.ownerId !== u.userId) return { ok: false, error: "Only the owner can change this report — make a copy to edit your own." };
      await prisma.customReport.update({ where: { id: input.id }, data: { title, description, doc } });
      revalidatePath("/analytics");
      return { ok: true, id: input.id };
    }
    const created = await prisma.customReport.create({ data: { ownerId: u.userId, ownerName: u.name, title, description, doc } });
    revalidatePath("/analytics");
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

export async function deleteReport(id: number): Promise<{ ok: boolean; error?: string }> {
  const u = await me(); if (!u) return { ok: false, error: "No access." };
  const r = await prisma.customReport.findUnique({ where: { id }, select: { ownerId: true } });
  if (!r || r.ownerId !== u.userId) return { ok: false, error: "Only the owner can delete this report." };
  await prisma.customReport.delete({ where: { id } });
  revalidatePath("/analytics");
  return { ok: true };
}

export async function copyReport(id: number): Promise<{ ok: boolean; id?: number; error?: string }> {
  const u = await me(); if (!u) return { ok: false, error: "No access." };
  const r = await accessible(id, u.userId);
  if (!r) return { ok: false, error: "Report not found." };
  const created = await prisma.customReport.create({
    data: { ownerId: u.userId, ownerName: u.name, title: `Copy of ${r.title}`.slice(0, 120), description: r.description, doc: r.doc as Prisma.InputJsonValue },
  });
  revalidatePath("/analytics");
  return { ok: true, id: created.id };
}

export async function createFromTemplate(templateId: string): Promise<{ ok: boolean; id?: number; error?: string }> {
  const u = await me(); if (!u) return { ok: false, error: "No access." };
  const t = TEMPLATES.find((x) => x.id === templateId);
  if (!t) return { ok: false, error: "Template not found." };
  const created = await prisma.customReport.create({
    data: { ownerId: u.userId, ownerName: u.name, title: t.title, description: t.description, doc: t.build() as unknown as Prisma.InputJsonValue },
  });
  revalidatePath("/analytics");
  return { ok: true, id: created.id };
}

/** Existing active users who can open Analytics (everyone but campaigners), excluding yourself. */
export async function getShareCandidates(): Promise<ShareCandidate[]> {
  const u = await me(); if (!u) return [];
  const [users, stores] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, approvalStatus: "APPROVED", role: { in: ["ASR", "STORE_MANAGER", "REGIONAL", "CENTRAL", "SYSADMIN"] }, NOT: { id: u.userId } },
      select: { id: true, name: true, employeeCode: true, role: true, storeId: true }, orderBy: { name: "asc" },
    }),
    prisma.store.findMany({ select: { id: true, name: true } }),
  ]);
  const sName = new Map(stores.map((s) => [s.id, shortStoreName(s.name) || s.name]));
  return users.map((x) => ({ id: x.id, name: x.name, code: x.employeeCode, role: ROLE_LABEL[x.role] ?? x.role, store: x.storeId != null ? sName.get(x.storeId) ?? null : null }));
}

/** Replace who a report is shared with (owner only). Newly added people get a bell notification. */
export async function setReportShares(reportId: number, userIds: number[]): Promise<{ ok: boolean; error?: string }> {
  const u = await me(); if (!u) return { ok: false, error: "No access." };
  const r = await prisma.customReport.findUnique({ where: { id: reportId }, select: { ownerId: true, title: true } });
  if (!r || r.ownerId !== u.userId) return { ok: false, error: "Only the owner can share this report." };
  const want = [...new Set(userIds.filter((x) => Number.isInteger(x) && x !== u.userId))].slice(0, 200);
  const valid = await prisma.user.findMany({ where: { id: { in: want }, active: true, approvalStatus: "APPROVED", NOT: { role: "CAMPAIGNER" } }, select: { id: true } });
  const ids = valid.map((x) => x.id);
  const before = new Set((await prisma.customReportShare.findMany({ where: { reportId }, select: { userId: true } })).map((s) => s.userId));
  await prisma.$transaction([
    prisma.customReportShare.deleteMany({ where: { reportId, userId: { notIn: ids } } }),
    prisma.customReportShare.createMany({ data: ids.map((userId) => ({ reportId, userId, sharedByName: u.name })), skipDuplicates: true }),
  ]);
  const added = ids.filter((x) => !before.has(x));
  if (added.length) await notifyUsers(added, { type: "GENERIC", title: `${u.name} shared a report with you: ${r.title}`, body: "Open it under Analytics → Shared with me.", href: `/analytics/custom/${reportId}` });
  revalidatePath("/analytics");
  return { ok: true };
}

/** Pin a report so Analytics opens on it (one per user); null unpins. */
export async function pinReport(id: number | null): Promise<{ ok: boolean; error?: string }> {
  const u = await me(); if (!u) return { ok: false, error: "No access." };
  if (id == null) { await prisma.setting.deleteMany({ where: { key: pinKey(u.userId) } }); revalidatePath("/analytics"); return { ok: true }; }
  if (!(await accessible(id, u.userId))) return { ok: false, error: "Report not found." };
  await prisma.setting.upsert({ where: { key: pinKey(u.userId) }, update: { value: String(id) }, create: { key: pinKey(u.userId), value: String(id) } });
  revalidatePath("/analytics");
  return { ok: true };
}

export async function getPinnedReport(): Promise<ReportFull | null> {
  const u = await me(); if (!u) return null;
  const pin = await prisma.setting.findUnique({ where: { key: pinKey(u.userId) } });
  const id = Number(pin?.value);
  return Number.isInteger(id) && id > 0 ? getReport(id) : null;
}

/** Store / region / RM options for page filters — only what the viewer can see. */
export async function getFilterOptions(): Promise<FilterOptions> {
  const u = await me(); if (!u) return { stores: [], regions: [], rms: [] };
  const ids = scopeStoreIds(u.scope);
  if (ids === "none") return { stores: [], regions: [], rms: [] };
  const [stores, allRms] = await Promise.all([
    prisma.store.findMany({ where: { source: "REAL", ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true, zone: true }, orderBy: { name: "asc" } }),
    allRmStores(),
  ]);
  const regions = [...new Set(stores.map((s) => s.zone?.trim()).filter((z): z is string => !!z))].sort();
  // RM options are REGIONAL user ACCOUNTS (a store can have several managers, and `Store.regionalManager`
  // is only a comma-joined display label). Only managers of a store the viewer can see are offered.
  const visible = new Set(stores.map((s) => s.id));
  const rms = allRms.filter((r) => r.storeIds.some((id) => visible.has(id))).map((r) => ({ id: r.userId, name: r.name }));
  return { stores: stores.map((s) => ({ id: s.id, name: shortStoreName(s.name) || s.name, zone: s.zone })), regions, rms };
}

// Results are cached ~5 min per scope + visual definition (layout and title don't affect data).
const cachedRun = unstable_cache(
  async (scopeJson: string, specJson: string) => {
    const scope = JSON.parse(scopeJson) as Scope;
    const { v, f, cf, o } = JSON.parse(specJson) as { v: Visual; f: PageFilters; cf: CrossFilter | null; o: RunOpts };
    return runVisual(scope, v, f, cf, o);
  },
  ["custom-analytics-visual"],
  { revalidate: 300 },
);

function dataKey(v: Visual): Visual {
  return { ...v, title: undefined, layout: { x: 0, y: 0, w: 0, h: 0 } };
}

export async function runReportVisual(v: Visual, filters: PageFilters, cf: CrossFilter | null, opts: RunOpts = {}): Promise<VisualResult> {
  const u = await me(); if (!u) return { ok: false, error: "No access.", rows: [] };
  const s = u.scope;
  const scopeJson = JSON.stringify({ role: s.role, userId: s.userId, storeId: s.storeId, zone: s.zone, managedStoreIds: s.managedStoreIds });
  const cfKey = cf ? { ...cf, label: "", sourceVisual: "" } : null; // cosmetic fields don't change the data
  return cachedRun(scopeJson, JSON.stringify({ v: dataKey(v), f: filters ?? {}, cf: cfKey, o: { ...opts, exportAll: false } }));
}

/** Download the data behind one visual (in the viewer's scope) as a styled Excel sheet. */
export async function exportVisualXlsx(v: Visual, filters: PageFilters, cf: CrossFilter | null, title: string): Promise<{ ok: boolean; b64?: string; filename?: string; error?: string }> {
  const u = await me(); if (!u) return { ok: false, error: "No access." };
  const res = await runVisual(u.scope, v, filters ?? {}, cf ?? null, { exportAll: true });
  if (!res.ok) return { ok: false, error: res.error };
  const ds = v.dataset;
  const dims = v.type === "table" ? v.dims ?? [] : ([v.axis, v.split].filter(Boolean) as NonNullable<Visual["axis"]>[]);
  const values = v.values;
  const header = [...dims.map((d) => fieldMeta(ds, d.field)?.label ?? d.field), ...values.map((x) => valueLabel(ds, x))];
  const rows = res.rows.filter((r) => r.d0 !== "__total" && r.d1 !== "__total").map((r) => [
    ...dims.map((d, i) => dimLabel(r[`d${i}`] as string | null, fieldMeta(ds, d.field)?.format ?? "text", d.grain)),
    ...values.map((_, i) => (r[`m${i}`] as number | null) ?? null),
  ]);
  const numFmt: Record<number, string> = {};
  values.forEach((x, i) => { const f = valueFormat(ds, x); numFmt[dims.length + i] = f === "pct" || f === "rating" ? "0.0" : f === "inr" || f === "int" ? "#,##0" : "#,##0.00"; });
  const name = (title || "Visual").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
  const b64 = await buildStyledWorkbookB64([{ name, rows: [header, ...rows], numFmt, leftCols: dims.map((_, i) => i) }]);
  return { ok: true, b64, filename: `${name}.xlsx` };
}
