"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { shortStoreName } from "@/lib/store-utils";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS } from "@/lib/campaign-segments";
import { inr } from "@/lib/format";
import type { Prisma } from "@prisma/client";
import {
  parseCriteria, resolveClusterCount, resolveClusterIds, scopedCriteriaWhere,
  hasConditions, type ClusterCriteria,
} from "@/lib/cluster-rules";
import { getScope, canManage, getActor, farmerScopeWhere } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { cropLabel } from "@/lib/crops";
import { buildWorkbookB64 } from "@/lib/xlsx-export";
import { sendSms, zapConfig, listSmsTemplates, type SmsTemplate } from "@/lib/zapsms";
import { sendWhatsApp, waConfig, waCreateTemplate } from "@/lib/whatsapp";
import { SAMPLE_VARS, resolveVars, fillDltTemplate, fillWaTemplate, positionalParams, countDltVars, VAR_LABEL, type FarmerVarSource } from "@/lib/campaign-vars";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
async function requireManager(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { role } = await getScope();
  return canManage(role) ? { ok: true } : { ok: false, error: "Only the central team can create or change this." };
}

export type CropFilter = string; // "all" or a canonical crop name (see lib/crops.ts)
export type CropSource = "any" | "sales" | "visit"; // which labelled crop set to match

function cropColumn(source: CropSource): string {
  return source === "sales" ? `"salesCropTags"` : source === "visit" ? `"visitCropTags"` : `"cropTags"`;
}
function cropClause(crop: CropFilter, source: CropSource): string {
  if (!crop || crop === "all") return "";
  const safe = crop.replace(/[^a-z_]/gi, ""); // canonical crops are [a-z_]
  return safe ? `AND '${safe}' = ANY(${cropColumn(source)})` : "";
}

/** Distinct crops present across farmers (union of sales + visit), most common first. */
export async function getCropOptions(): Promise<{ crop: string; count: number }[]> {
  const rows = await prisma.$queryRawUnsafe<{ crop: string; n: number }[]>(
    `SELECT unnest("cropTags") crop, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' AND array_length("cropTags",1) > 0 GROUP BY 1 ORDER BY 2 DESC`,
  );
  return rows.map((r) => ({ crop: r.crop, count: Number(r.n) }));
}

/** Distinct Target Pests/Diseases/Weeds across farmers (item-code derived), most common first. */
export async function getPestOptions(): Promise<{ pest: string; count: number }[]> {
  const rows = await prisma.$queryRawUnsafe<{ pest: string; n: number }[]>(
    `SELECT unnest("pestTags") pest, COUNT(*)::int n FROM "Farmer" WHERE source='REAL' AND array_length("pestTags",1) > 0 GROUP BY 1 ORDER BY 2 DESC LIMIT 200`,
  );
  return rows.map((r) => ({ pest: r.pest, count: Number(r.n) }));
}

/* The old unscoped store×segment matrix + its drill-down (`getSegmentMatrix`,
   `getSegmentCustomers`) were removed with the officer/RM RBAC work: the analytics
   workbench replaced them, and as "use server" exports they stayed callable by any
   signed-in user — returning farmers (with phone numbers) from ANY store. The scoped
   equivalents live in app/actions/analytics-segments.ts (getWorkbench*). */

/* ─────────────────────────── Clusters (Step 1) ─────────────────────────── */

export interface ClusterVM {
  id: number;
  name: string;
  description: string;
  count: number;
  origin: string;
  mode: string;
  createdBy: string;
  createdByCode: string;
  createdAt: string; // ISO — when the cluster was created
}

/** All saved clusters with LIVE counts (dynamic clusters re-resolve their rule). */
export async function listClustersWithCounts(): Promise<ClusterVM[]> {
  // RBAC: regional managers see clusters through their region only — the count is the
  // in-region membership, and clusters with nobody in their region are hidden entirely.
  const scope = await getScope();
  const fScope = farmerScopeWhere(scope);
  if (fScope === "none") return [];

  const clusters = await prisma.cluster.findMany({
    where: { source: "REAL" }, // demo clusters must not be bundleable into real projects/campaigns
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, description: true, criteria: true, mode: true, origin: true, farmerIds: true, createdBy: true, createdByCode: true, createdAt: true },
  });
  const rows = await mapLimit(clusters, 8, async (c) => {
    const crit = c.mode === "dynamic" ? parseCriteria(c.criteria) : null;
    const base: Prisma.FarmerWhereInput = crit ? scopedCriteriaWhere(crit) : { source: "REAL", id: { in: c.farmerIds } };
    const count = fScope
      ? await prisma.farmer.count({ where: { AND: [base, fScope] } })
      : crit
        ? await resolveClusterCount(crit)
        : c.farmerIds.length;
    return {
      id: c.id,
      name: c.name,
      description: c.description ?? "—",
      count,
      origin: c.origin ?? "map",
      mode: c.mode,
      createdBy: c.createdBy ?? "",
      createdByCode: c.createdByCode ?? "",
      createdAt: c.createdAt.toISOString(),
    };
  });
  return fScope ? rows.filter((r) => r.count > 0) : rows;
}

/** Live count preview for the cluster rule builder (0 for an empty rule). */
export async function previewClusterCount(criteria: ClusterCriteria): Promise<number> {
  if (!hasConditions(criteria)) return 0;
  return resolveClusterCount(criteria);
}

export async function deleteCluster(id: number): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm; // RMs/officers may view clusters, not delete them
  try {
    await prisma.cluster.delete({ where: { id } });
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

/* ─────────────────────────── Projects (Step 2) ─────────────────────────── */

type ClusterRow = { id: number; name: string; criteria: string | null; mode: string; farmerIds: number[] };

// Upper bound for a single campaign's enrolment. Comfortably above the whole
// ~106k REAL-farmer table, so realistic audiences enrol in full; hitting it means
// the audience is pathologically large and createCampaign refuses rather than
// silently dropping members (the count shown to the user is uncapped).
const ENROLL_CAP = 200_000;

/** A cluster's live Farmer `where` (dynamic → rule; static/legacy → frozen ids, REAL-scoped so a demo cluster can't leak demo farmers). */
function clusterWhere(c: ClusterRow): Prisma.FarmerWhereInput {
  const crit = c.mode === "dynamic" ? parseCriteria(c.criteria) : null;
  return crit ? scopedCriteriaWhere(crit) : { source: "REAL", id: { in: c.farmerIds } };
}
function clusterCountOf(c: ClusterRow): Promise<number> {
  const crit = c.mode === "dynamic" ? parseCriteria(c.criteria) : null;
  return crit ? resolveClusterCount(crit) : Promise.resolve(c.farmerIds.length);
}
function clusterIdsOf(c: ClusterRow, cap = ENROLL_CAP): Promise<number[]> {
  const crit = c.mode === "dynamic" ? parseCriteria(c.criteria) : null;
  // REAL-scope the static/legacy branch too (resolveClusterIds already scopes dynamic).
  return crit
    ? resolveClusterIds(crit, cap)
    : prisma.farmer.findMany({ where: { source: "REAL", id: { in: c.farmerIds } }, select: { id: true }, take: cap }).then((r) => r.map((x) => x.id));
}

/** Run an async fn over items with bounded concurrency (protects the pooled Azure DB). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  });
  await Promise.all(workers);
  return out;
}

export interface ProjectClusterVM { id: number; name: string; count: number }
export interface ProjectVM { id: number; name: string; status: string; audienceCount: number; startDate: string | null; endDate: string | null; clusters: ProjectClusterVM[] }

/** Projects with their clusters + de-duplicated live audience (union across clusters). */
export async function listProjects(): Promise<ProjectVM[]> {
  const projects = await prisma.project.findMany({
    where: { source: "REAL" }, // pipeline projects only; legacy/DEMO (Action Planner) projects are dateless and not campaign targets
    orderBy: { createdAt: "desc" }, take: 100,
    include: { clusters: { select: { id: true, name: true, criteria: true, mode: true, farmerIds: true } } },
  });
  // Resolve each DISTINCT cluster's live count ONCE (clusters are reusable across projects),
  // with bounded concurrency so one page load can't flood the connection-limited pool.
  const distinct = new Map<number, ClusterRow>();
  for (const p of projects) for (const c of p.clusters) distinct.set(c.id, c);
  const distinctRows = [...distinct.values()];
  const counts = await mapLimit(distinctRows, 8, (c) => clusterCountOf(c));
  const countById = new Map(distinctRows.map((c, i) => [c.id, counts[i]]));
  // Union audience per project (one OR-count that dedupes overlap), also concurrency-bounded.
  const audiences = await mapLimit(projects, 8, (p) =>
    p.clusters.length ? prisma.farmer.count({ where: { OR: p.clusters.map(clusterWhere) } }) : Promise.resolve(0),
  );
  return projects.map((p, i) => ({
    id: p.id, name: p.title, status: p.status, audienceCount: audiences[i],
    startDate: iso(p.startDate), endDate: iso(p.endDate),
    clusters: p.clusters.map((c) => ({ id: c.id, name: c.name, count: countById.get(c.id) ?? 0 })),
  }));
}

export async function createProject(name: string, clusterIds: number[], startDate?: string, endDate?: string): Promise<{ ok: boolean; id?: number; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  const t = name.trim();
  if (!t) return { ok: false, error: "Give the project a name." };
  if (!clusterIds.length) return { ok: false, error: "Add at least one cluster." };
  if (!startDate || !endDate) return { ok: false, error: "Set a project start and end date." };
  const s = new Date(startDate), e = new Date(endDate);
  if (!(s <= e)) return { ok: false, error: "End date must be on or after the start date." };
  try {
    const p = await prisma.project.create({
      data: { title: t, status: "PLANNED", source: "REAL", startDate: s, endDate: e, clusters: { connect: clusterIds.map((id) => ({ id })) } },
    });
    revalidatePath("/projects"); revalidatePath("/campaigns");
    return { ok: true, id: p.id };
  } catch (e2) { return { ok: false, error: e2 instanceof Error ? e2.message : "Create failed" }; }
}

/** Extend a project's end date (central only). Campaigns can then be extended up to the new end. */
export async function extendProject(projectId: number, newEndDate: string): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { endDate: true } });
  if (!p) return { ok: false, error: "Project not found." };
  const nd = new Date(newEndDate);
  if (p.endDate && !(nd > p.endDate)) return { ok: false, error: `New end must be after the current end (${iso(p.endDate)}).` };
  try {
    await prisma.project.update({ where: { id: projectId }, data: { endDate: nd } });
    revalidatePath("/projects"); revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Extend failed" }; }
}

export async function setProjectClusters(projectId: number, clusterIds: number[]): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  try {
    await prisma.project.update({ where: { id: projectId }, data: { clusters: { set: clusterIds.map((id) => ({ id })) } } });
    revalidatePath("/projects"); revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Update failed" }; }
}

export async function deleteProject(id: number): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  try { await prisma.project.delete({ where: { id } }); revalidatePath("/projects"); revalidatePath("/campaigns"); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Delete failed" }; }
}

/* ─────────────────────────── WF3 · Communication plan ─────────────────────────── */

export interface CommTemplatePatch {
  name?: string; language?: string; promoType?: string;
  segments?: string[]; // target segments (value + lifecycle); EMPTY = All
  medium?: string; offer?: string; timingLabel?: string; template?: string;
  dltTemplateId?: string | null;
  waTemplateName?: string | null;
  waLanguage?: string | null;
  waVariables?: string[];
  smsVariables?: string[];
}

/** Keep the legacy single `segment` column in sync with segments[0] (or a sensible default). */
const legacySeg = (segments?: string[]) => (segments && segments.length ? segments[0] : "REGULAR");

export async function saveCommTemplate(id: number, patch: CommTemplatePatch): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm; // central-only config (read-only for officers/RMs)
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "Give the comm plan a name." };
  try {
    const data: Prisma.CommTemplateUpdateInput = { ...patch };
    if (patch.segments !== undefined) data.segment = legacySeg(patch.segments);
    await prisma.commTemplate.update({ where: { id }, data });
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

export async function createCommTemplate(data: Required<CommTemplatePatch>): Promise<{ ok: boolean; id?: number; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  if (!data.name.trim()) return { ok: false, error: "Give the comm plan a name." };
  const dup = await prisma.commTemplate.findFirst({ where: { name: data.name.trim() }, select: { id: true } });
  if (dup) return { ok: false, error: "A comm plan with that name already exists." };
  try {
    const row = await prisma.commTemplate.create({ data: { ...data, segment: legacySeg(data.segments), name: data.name.trim(), priority: 5 } });
    revalidatePath("/campaigns");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Create failed" };
  }
}

export interface SmsTemplateVM extends SmsTemplate {}
/** Approved DLT SMS templates from the ZapSMS account (for the Comm Plan picker). Manager-only. */
export async function getSmsTemplates(): Promise<{ ok: boolean; templates: SmsTemplateVM[]; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return { ok: false, templates: [], error: perm.error };
  const r = await listSmsTemplates();
  // Prefer approved-and-active first, then approved, then the rest — all usable, but the good ones lead.
  const rank = (t: SmsTemplate) => (t.approved && t.active ? 0 : t.approved ? 1 : 2);
  const templates = [...r.templates].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { ok: r.ok, templates, error: r.error };
}

export async function deleteCommTemplate(id: number): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  try {
    await prisma.commTemplate.delete({ where: { id } });
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

/* ─────────────────────────── WF4 · Campaigns & tracking ─────────────────────────── */

export interface CreateCampaignInput {
  name: string;
  startDate: string; // ISO date
  endDate: string;
  projectId: number; // Step 3: campaign runs on a project…
  clusterId?: number | null; // …or one specific cluster within it (null = whole project)
  commPlans: string[]; // comm-plan names this campaign is tagged with (1+ required)
  testPct?: number;
}

const CLUSTER_SELECT = { id: true, name: true, criteria: true, mode: true, farmerIds: true } as const;

export async function createCampaign(input: CreateCampaignInput): Promise<{ ok: boolean; id?: number; members?: number; skipped?: number; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  try {
    if (!input.name.trim()) return { ok: false, error: "Name is required." };
    if (!input.projectId) return { ok: false, error: "Pick a project." };
    if (!input.startDate || !input.endDate) return { ok: false, error: "Set the campaign start and end date." };
    // Every campaign must carry its communication plan(s) — tagged by comm-plan name.
    const commPlans = [...new Set((input.commPlans ?? []).map((s) => s.trim()).filter(Boolean))];
    if (!commPlans.length) return { ok: false, error: "Tag at least one comm plan." };

    // Load the project (its duration + segments).
    const project = await prisma.project.findUnique({ where: { id: input.projectId }, include: { clusters: { select: CLUSTER_SELECT } } });
    if (!project) return { ok: false, error: "Project not found." };
    // A campaign must sit inside a real project window — reject dateless (legacy/DEMO) projects outright.
    if (project.source !== "REAL" || !project.startDate || !project.endDate)
      return { ok: false, error: "This project has no start/end dates set. Set the project's dates first." };

    // Campaign window must sit inside the project's duration.
    const cs = new Date(input.startDate), ce = new Date(input.endDate);
    if (!(cs <= ce)) return { ok: false, error: "Campaign end must be on or after its start." };
    if (project.startDate && cs < project.startDate) return { ok: false, error: `Campaign can't start before the project (${iso(project.startDate)}).` };
    if (project.endDate && ce > project.endDate) return { ok: false, error: `Campaign can't end after the project (${iso(project.endDate)}). Extend the project first.` };

    // Resolve the audience id-set — a single segment, or the union of the project's segments.
    let ids: number[];
    if (input.clusterId) {
      const c = project.clusters.find((x) => x.id === input.clusterId);
      if (!c) return { ok: false, error: "That cluster is not part of the selected project." };
      ids = await clusterIdsOf(c);
    } else {
      if (!project.clusters.length) return { ok: false, error: "This project has no clusters." };
      const sets = await Promise.all(project.clusters.map((c) => clusterIdsOf(c)));
      ids = [...new Set(sets.flat())]; // de-duplicate farmers shared across segments
    }
    if (!ids.length) return { ok: false, error: "The selected audience is empty right now." };

    // Cross-campaign de-dup: never enrol a farmer already in ANOTHER campaign of this project
    // (one project = one contact per farmer, so later campaigns don't spam them).
    // NOTE: this is an app-level check-then-insert, not transactional. The create button is
    // pending-disabled so a single user can't double-submit; two managers creating campaigns on
    // the SAME project at the exact same moment is the only residual race (rare, manager-gated).
    const already = await prisma.campaignMember.findMany({ where: { campaign: { projectId: input.projectId } }, select: { farmerId: true }, distinct: ["farmerId"] });
    const alreadySet = new Set(already.map((a) => a.farmerId));
    const gross = ids.length;
    ids = ids.filter((id) => !alreadySet.has(id));
    const skipped = gross - ids.length;
    if (!ids.length) return { ok: false, error: "Every farmer here is already enrolled in another campaign of this project." };
    if (ids.length >= ENROLL_CAP) return { ok: false, error: `Audience is too large to enrol in one campaign (${ENROLL_CAP.toLocaleString("en-IN")}+). Narrow the project first.` };

    const camp = await prisma.campaign.create({
      data: { name: input.name.trim(), startDate: cs, endDate: ce, projectId: input.projectId, clusterId: input.clusterId ?? null, commPlans, testPct: input.testPct ?? 75, status: "ACTIVE" },
    });

    // Enrol snapshot; store/zone denormalized so officers/RMs see only their own farmers. 75/25 test/control.
    const controlEvery = Math.max(2, Math.round(100 / (100 - (input.testPct ?? 75)))); // ~4 for 75/25
    let total = 0;
    for (let i = 0; i < ids.length; i += 5000) {
      const slice = ids.slice(i, i + 5000);
      const farmers = await prisma.farmer.findMany({ where: { id: { in: slice } }, select: { id: true, campaignSegment: true, valueSegment: true, lifecycleSegment: true, cropTags: true, storeId: true, zone: true } });
      const members = farmers.map((f) => ({
        campaignId: camp.id, farmerId: f.id, segment: f.campaignSegment ?? "OTHER",
        valueSegment: f.valueSegment, lifecycleSegment: f.lifecycleSegment,
        crop: f.cropTags[0] ?? null, storeId: f.storeId ?? null, zone: f.zone ?? null,
        group: f.id % controlEvery === 0 ? "CONTROL" : "TEST",
      }));
      const res = await prisma.campaignMember.createMany({ data: members, skipDuplicates: true });
      total += res.count;
    }
    await logAudit("Campaign", "CREATE", `Created campaign "${camp.name}" — ${total} farmers enrolled${skipped ? `, ${skipped} skipped` : ""}`);
    revalidatePath("/campaigns");
    return { ok: true, id: camp.id, members: total, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Create failed" };
  }
}

/** Extend a campaign's end date (central only). Cannot exceed the project's end — extend the project first. */
export async function extendCampaign(campaignId: number, newEndDate: string): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true, endDate: true, projectId: true } });
  if (!camp) return { ok: false, error: "Campaign not found." };
  const nd = new Date(newEndDate);
  if (!(nd > camp.endDate)) return { ok: false, error: `New end must be after the current end (${iso(camp.endDate)}).` };
  if (camp.projectId) {
    const p = await prisma.project.findUnique({ where: { id: camp.projectId }, select: { endDate: true } });
    if (p?.endDate && nd > p.endDate) return { ok: false, error: `Can't extend past the project end (${iso(p.endDate)}). Extend the project first.` };
  }
  try {
    await prisma.campaign.update({ where: { id: campaignId }, data: { endDate: nd } });
    await logAudit("Campaign", "UPDATE", `Extended campaign "${camp.name}" end date → ${iso(nd)}`);
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Extend failed" }; }
}

/**
 * Submit a WhatsApp comm plan's message to Meta as a template for approval (manager-only). The plan's
 * message body IS the template; {{n}} example values come from the variable mapping's samples. On success
 * the derived Meta template name + language are stored back on the plan.
 */
export async function submitCommPlanForApproval(id: number): Promise<{ ok: boolean; status?: string; name?: string; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  const t = await prisma.commTemplate.findUnique({ where: { id } });
  if (!t) return { ok: false, error: "Comm plan not found." };
  const body = (t.template ?? "").trim();
  if (!body) return { ok: false, error: "Add a message before submitting for approval." };
  const metaName = (t.name || `plan_${id}`).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const language = (t.waLanguage || (t.language === "hi" ? "hi" : "en")).trim();
  const category = t.promoType === "Reminder" ? "UTILITY" : "MARKETING";
  // Example values for each {{n}}, from the mapped farmer field's sample (Meta requires an example per variable).
  const examples = (t.waVariables ?? []).map((tok) => SAMPLE_VARS[tok] ?? "Sample");
  const res = await waCreateTemplate({ name: metaName, language, category, body, examples });
  if (!res.ok) return { ok: false, error: res.error ?? "Meta rejected the submission." };
  await prisma.commTemplate.update({ where: { id }, data: { waTemplateName: metaName, waLanguage: language } });
  revalidatePath("/campaigns");
  return { ok: true, status: res.status, name: metaName };
}

/** Add/remove the comm plans a campaign is tagged with (manager-only). Must keep at least one. */
export async function updateCampaignCommPlans(campaignId: number, commPlans: string[]): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } });
  if (!camp) return { ok: false, error: "Campaign not found." };
  const clean = [...new Set((commPlans ?? []).map((s) => s.trim()).filter(Boolean))];
  if (!clean.length) return { ok: false, error: "Tag at least one comm plan." };
  try {
    await prisma.campaign.update({ where: { id: campaignId }, data: { commPlans: clean } });
    await logAudit("Campaign", "UPDATE", `Updated comm plans for "${camp.name}": ${clean.join(", ")}`);
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Update failed" }; }
}

/**
 * Delete a campaign and everything scoped to it: members, phases, phase-advances and caller
 * assignments cascade at the DB; broadcasts (+ their recipients) are cleared explicitly since they
 * key off campaignId without an FK. SMS/WhatsApp audit logs are KEPT (real message history).
 */
export async function deleteCampaign(campaignId: number): Promise<{ ok: boolean; error?: string }> {
  const perm = await requireManager(); if (!perm.ok) return perm;
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } });
  if (!camp) return { ok: false, error: "Campaign not found." };
  try {
    await prisma.broadcastRecipient.deleteMany({ where: { broadcast: { campaignId } } });
    await prisma.broadcast.deleteMany({ where: { campaignId } });
    await prisma.campaign.delete({ where: { id: campaignId } }); // cascades members/phases/advances/callers
    await logAudit("Campaign", "DELETE", `Deleted campaign "${camp.name}"`);
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Delete failed" }; }
}

export interface CampaignListItem {
  id: number; name: string; status: string; startDate: string; endDate: string;
  target: string; members: number;
  commPlans: string[]; // comm-plan names the campaign is tagged with
}

/** Member `where` for the current user's scope (officer→their store, RM→their managed stores). null = see all. */
async function memberScopeWhere(): Promise<Prisma.CampaignMemberWhereInput | null | "none"> {
  const { role, storeId, managedStoreIds } = await getScope();
  if (role === "officer") return storeId == null ? "none" : { storeId };
  if (role === "regional") return managedStoreIds && managedStoreIds.length ? { storeId: { in: managedStoreIds } } : "none";
  return null; // central / sysadmin / campaigner (campaigner is gated at the campaign level, see below)
}

/**
 * Campaign ids a Campaigner is assigned to call. Returns `null` when the current user is NOT a
 * campaigner (i.e. don't apply campaign-level gating); an array (possibly empty) when they are.
 */
async function campaignerAssignedIds(): Promise<number[] | null> {
  const { role, userId } = await getScope();
  if (role !== "campaigner") return null;
  if (userId == null) return [];
  const rows = await prisma.campaignCaller.findMany({ where: { userId }, select: { campaignId: true } });
  return rows.map((r) => r.campaignId);
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  const assigned = await campaignerAssignedIds();
  if (assigned && assigned.length === 0) return []; // campaigner with no campaigns assigned yet
  const scope = await memberScopeWhere();
  if (scope === "none") return []; // officer/RM with no store/zone → nothing to show
  const camps = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    where: assigned
      ? { id: { in: assigned } } // campaigner: only the campaigns assigned to them
      : scope ? { members: { some: scope } } : undefined, // officer/RM: campaigns that reach my store/zone
    include: { _count: { select: { members: scope ? { where: scope } : true } } }, // scoped member count
  });
  // Batch-resolve target names (loose ids — campaigns don't relation-load project/cluster).
  const projIds = [...new Set(camps.map((c) => c.projectId).filter((x): x is number => x != null))];
  const clusIds = [...new Set(camps.map((c) => c.clusterId).filter((x): x is number => x != null))];
  const [projs, clus] = await Promise.all([
    projIds.length ? prisma.project.findMany({ where: { id: { in: projIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
    clusIds.length ? prisma.cluster.findMany({ where: { id: { in: clusIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const pName = new Map(projs.map((p) => [p.id, p.title]));
  const cName = new Map(clus.map((c) => [c.id, c.name]));
  return camps.map((c) => ({
    id: c.id, name: c.name, status: c.status,
    startDate: c.startDate.toISOString().slice(0, 10),
    endDate: c.endDate.toISOString().slice(0, 10),
    commPlans: c.commPlans,
    target: c.clusterId
      ? `Cluster · ${cName.get(c.clusterId) ?? "removed"}`
      : c.projectId
        ? `Project · ${pName.get(c.projectId) ?? "removed"}`
        : c.targetSegments.map((s) => segMeta(s).label).join(", ") || "—", // legacy segment campaigns
    members: c._count.members,
  }));
}

/** Scoped enrolled-farmer list for a campaign — TEST group only (the CONTROL holdout is never contacted). */
export interface CampaignMemberVM {
  id: number; name: string; mobile: string | null; village: string | null; store: string | null;
  segment: string; reached: boolean; mediums: string[]; comment: string | null; reachedAt: string | null;
  reachedBy: string | null; reachedByCode: string | null;
  response: string | null; responseCrop: string | null; // interest outcome + the crop when OTHER_CROP
  broadcastMediums: string[]; // channels DELIVERED via mass send (separate from `reached`)
}
// Load the whole TEST group so the outreach counts (to-contact / reached / left) are accurate — the old
// 1000 default capped a 2k+ campaign's list. Bounded to keep the payload sane; huge campaigns use the matrix.
export async function getCampaignMembers(campaignId: number, limit = 25000): Promise<CampaignMemberVM[]> {
  const assigned = await campaignerAssignedIds();
  if (assigned && !assigned.includes(campaignId)) return []; // campaigner may only open assigned campaigns
  const scope = await memberScopeWhere();
  if (scope === "none") return [];
  const members = await prisma.campaignMember.findMany({
    where: { campaignId, group: "TEST", ...(scope ?? {}) }, // officers/RMs contact only the TEST group
    take: limit, orderBy: { id: "asc" },
    select: { id: true, farmerId: true, segment: true, reached: true, mediums: true, comment: true, reachedAt: true, reachedBy: true, reachedByCode: true, storeId: true, response: true, responseCrop: true, broadcastMediums: true },
  });
  if (!members.length) return [];
  const [farmers, stores] = await Promise.all([
    prisma.farmer.findMany({ where: { id: { in: members.map((m) => m.farmerId) } }, select: { id: true, name: true, mobile: true, village: true } }),
    prisma.store.findMany({ select: { id: true, name: true } }),
  ]);
  const fMap = new Map(farmers.map((f) => [f.id, f]));
  const sMap = new Map(stores.map((s) => [s.id, shortStoreName(s.name)]));
  return members.map((m) => {
    const f = fMap.get(m.farmerId);
    return {
      id: m.id, name: f?.name ?? `Farmer #${m.farmerId}`, mobile: f?.mobile ?? null, village: f?.village ?? null,
      store: m.storeId != null ? sMap.get(m.storeId) ?? null : null,
      segment: m.segment, reached: m.reached, mediums: m.mediums, comment: m.comment, reachedAt: iso(m.reachedAt),
      reachedBy: m.reachedBy, reachedByCode: m.reachedByCode, response: m.response, responseCrop: m.responseCrop,
      broadcastMediums: m.broadcastMediums,
    };
  });
}

/* ── Campaign audience analytics: composition breakdowns + Segment × Store matrix ── */
export interface SegCol { key: string; label: string; color: string; bg: string }
export interface CampaignAnalytics {
  total: number;
  byValue: (SegCol & { count: number })[];       // value-tier composition (HNI/Potential/Regular)
  byLifecycle: (SegCol & { count: number })[];    // lifecycle composition (New/At Risk/Lapsed)
  byStore: { label: string; count: number }[];
  byVillage: { label: string; count: number }[];
  byCrop: { label: string; count: number }[];
  valueCols: SegCol[];      // matrix value columns
  lifecycleCols: SegCol[];  // matrix lifecycle columns
  /** Merged Store × (Value | Lifecycle) matrix — both count-sets sum to `total` per store. */
  matrix: { store: string; value: Record<string, number>; lifecycle: Record<string, number>; total: number }[];
}

const EMPTY_ANALYTICS: CampaignAnalytics = { total: 0, byValue: [], byLifecycle: [], byStore: [], byVillage: [], byCrop: [], valueCols: [], lifecycleCols: [], matrix: [] };
const colOf = (k: string): SegCol => { const m = segMeta(k); return { key: k, label: m.label, color: m.color, bg: m.bg }; };

/**
 * Composition of a campaign's enrolled farmers — for the "Analytics" button on each campaign row.
 * Scoped like the other member views (officer→store, RM→zone, central→all). Counts every enrolled
 * member (TEST + CONTROL). Returns single-dimension breakdowns + a Segment × Store cross-tab.
 */
export async function getCampaignAnalytics(campaignId: number): Promise<CampaignAnalytics> {
  const scope = await memberScopeWhere();
  if (scope === "none") return EMPTY_ANALYTICS;
  const members = await prisma.campaignMember.findMany({
    where: { campaignId, ...(scope ?? {}) },
    select: { farmerId: true, segment: true, valueSegment: true, lifecycleSegment: true, storeId: true },
    take: 40000, // realistic campaigns are far below this; guards a pathological audience
  });
  if (!members.length) return EMPTY_ANALYTICS;

  const farmerIds = [...new Set(members.map((m) => m.farmerId))];
  const [farmers, stores] = await Promise.all([
    prisma.farmer.findMany({ where: { id: { in: farmerIds } }, select: { id: true, village: true, cropTags: true } }),
    prisma.store.findMany({ select: { id: true, name: true } }),
  ]);
  const fMap = new Map(farmers.map((f) => [f.id, f]));
  const sMap = new Map(stores.map((s) => [s.id, shortStoreName(s.name)]));

  const vcount: Record<string, number> = {}, lcount: Record<string, number> = {};
  const store: Record<string, number> = {};
  const village: Record<string, number> = {};
  const crop: Record<string, number> = {};
  // Store → { value → count, lifecycle → count } cross-tab (both sum to the store's member count).
  const cross = new Map<string, { value: Record<string, number>; lifecycle: Record<string, number>; total: number }>();
  for (const m of members) {
    const f = fMap.get(m.farmerId);
    const storeName = m.storeId != null ? sMap.get(m.storeId) ?? "—" : "—";
    // Fall back to deriving from the legacy collapsed snapshot for pre-split members.
    const v = m.valueSegment ?? (VALUE_SEGMENTS.includes(m.segment as never) ? m.segment : "REGULAR");
    const l = m.lifecycleSegment ?? (LIFECYCLE_SEGMENTS.includes(m.segment as never) ? m.segment : "LAPSED");
    const villageName = f?.village || "—";
    vcount[v] = (vcount[v] ?? 0) + 1;
    lcount[l] = (lcount[l] ?? 0) + 1;
    store[storeName] = (store[storeName] ?? 0) + 1;
    if (villageName !== "—") village[villageName] = (village[villageName] ?? 0) + 1;
    for (const c of (f?.cropTags ?? [])) crop[c] = (crop[c] ?? 0) + 1;
    const row = cross.get(storeName) ?? cross.set(storeName, { value: {}, lifecycle: {}, total: 0 }).get(storeName)!;
    row.value[v] = (row.value[v] ?? 0) + 1;
    row.lifecycle[l] = (row.lifecycle[l] ?? 0) + 1;
    row.total += 1;
  }
  const top = (o: Record<string, number>, k = 12) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([label, count]) => ({ label, count }));
  const matrix = [...cross.entries()].map(([storeName, c]) => ({ store: storeName, value: c.value, lifecycle: c.lifecycle, total: c.total })).sort((a, b) => b.total - a.total);
  return {
    total: members.length,
    byValue: VALUE_SEGMENTS.filter((k) => vcount[k]).map((k) => ({ ...colOf(k), count: vcount[k] })),
    byLifecycle: LIFECYCLE_SEGMENTS.filter((k) => lcount[k]).map((k) => ({ ...colOf(k), count: lcount[k] })),
    byStore: top(store),
    byVillage: top(village),
    byCrop: top(crop).map((x) => ({ label: cropLabel(x.label), count: x.count })),
    valueCols: [...VALUE_SEGMENTS].map(colOf),
    lifecycleCols: [...LIFECYCLE_SEGMENTS].map(colOf),
    matrix,
  };
}

/**
 * Export a campaign's audience to Excel — same two-sheet format as the analytics-page export, scoped
 * to this campaign's enrolled farmers: sheet 1 = the Segment × Store matrix, sheet 2 = the farmer list.
 */
export async function exportCampaignAudienceXlsx(campaignId: number, campaignName: string): Promise<{ ok: boolean; filename?: string; b64?: string; error?: string }> {
  const scope = await memberScopeWhere();
  if (scope === "none") return { ok: false, error: "No store or region is assigned to your account." };
  const members = await prisma.campaignMember.findMany({
    where: { campaignId, ...(scope ?? {}) },
    select: { farmerId: true, segment: true, valueSegment: true, lifecycleSegment: true, storeId: true, group: true },
    take: 100000,
  });
  if (!members.length) return { ok: false, error: "No enrolled farmers in your scope for this campaign." };

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const sMap = new Map(stores.map((s) => [s.id, shortStoreName(s.name)]));

  const V = [...VALUE_SEGMENTS], L = [...LIFECYCLE_SEGMENTS];
  const vseg = (m: { valueSegment: string | null; segment: string }) => m.valueSegment ?? (V.includes(m.segment as never) ? m.segment : "REGULAR");
  const lseg = (m: { lifecycleSegment: string | null; segment: string }) => m.lifecycleSegment ?? (L.includes(m.segment as never) ? m.segment : "LAPSED");
  // Merged Store × (Value | Lifecycle) cross-tab (both count-sets sum to the store total).
  const cross = new Map<string, { value: Record<string, number>; lifecycle: Record<string, number>; total: number }>();
  const vTot: Record<string, number> = {}, lTot: Record<string, number> = {};
  for (const m of members) {
    const storeName = m.storeId != null ? sMap.get(m.storeId) ?? "—" : "—";
    const v = vseg(m), l = lseg(m);
    const row = cross.get(storeName) ?? cross.set(storeName, { value: {}, lifecycle: {}, total: 0 }).get(storeName)!;
    row.value[v] = (row.value[v] ?? 0) + 1; row.lifecycle[l] = (row.lifecycle[l] ?? 0) + 1; row.total += 1;
    vTot[v] = (vTot[v] ?? 0) + 1; lTot[l] = (lTot[l] ?? 0) + 1;
  }
  const mrows = [...cross.entries()].map(([store, c]) => ({ store, ...c })).sort((a, b) => b.total - a.total);

  const matrixSheet: (string | number)[][] = [
    ["Store", ...V.map((s) => segMeta(s).label), "Segment Total", ...L.map((s) => segMeta(s).label), "Lifecycle Total"],
    ["All stores", ...V.map((k) => vTot[k] ?? 0), members.length, ...L.map((k) => lTot[k] ?? 0), members.length],
    ...mrows.map((r) => [r.store, ...V.map((k) => r.value[k] ?? 0), r.total, ...L.map((k) => r.lifecycle[k] ?? 0), r.total]),
  ];
  const safe = (campaignName || "campaign").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 60) || "campaign";
  const b64 = buildWorkbookB64([
    { name: "Value + Lifecycle x Store", rows: matrixSheet },
  ]);
  return { ok: true, filename: `${safe} - audience.xlsx`, b64 };
}

const CONTACT_MEDIA = new Set(["CALL", "WHATSAPP", "SMS", "IN_PERSON"]); // a channel ⇒ reached
const OUTCOMES = new Set([...CONTACT_MEDIA, "UNREACHABLE"]); // valid channel/outcome values (UNREACHABLE = parked, not reached)
const RESPONSES = new Set(["INTERESTED", "NOT_INTERESTED", "OTHER_CROP"]); // interest outcome — any ⇒ reached

/**
 * Officer/RM (or central) records an outreach outcome:
 *   - `mediums`: HOW they were reached — CALL|WHATSAPP|SMS|IN_PERSON (multi-select), or the exclusive
 *     UNREACHABLE (couldn't contact).
 *   - `response`: the INTEREST outcome — INTERESTED | NOT_INTERESTED | OTHER_CROP (+ `responseCrop` for the last).
 * `reached` is DERIVED (never trusted from the client): any channel OR any interest response ⇒ reached.
 * A response and UNREACHABLE are contradictory — recording one clears the other. Scope-guarded to own store/zone.
 */
export async function markCampaignMember(
  memberId: number,
  patch: { mediums?: string[] | null; comment?: string | null; response?: string | null; responseCrop?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { role, storeId, managedStoreIds, userId } = await getScope();
  const member = await prisma.campaignMember.findUnique({ where: { id: memberId }, select: { storeId: true, zone: true, group: true, mediums: true, response: true, campaignId: true } });
  if (!member) return { ok: false, error: "Member not found." };
  // Officers/RMs may only touch members in their own store / managed stores; campaigners only their
  // assigned campaigns; central/sysadmin may touch any.
  if (role === "officer") { if (storeId == null || member.storeId !== storeId) return { ok: false, error: "This farmer isn't in your store." }; }
  else if (role === "regional") { if (member.storeId == null || !(managedStoreIds ?? []).includes(member.storeId)) return { ok: false, error: "This farmer isn't in a store you manage." }; }
  else if (role === "campaigner") {
    const assigned = userId != null ? await prisma.campaignCaller.count({ where: { userId, campaignId: member.campaignId } }) : 0;
    if (!assigned) return { ok: false, error: "This campaign isn't assigned to you." };
  }
  else if (!canManage(role)) return { ok: false, error: "Not authorised." };
  if (member.group !== "TEST") return { ok: false, error: "This farmer is a control holdout — not contacted." };

  const data: Prisma.CampaignMemberUpdateInput = {};
  let effMediums = member.mediums;
  let effResponse: string | null = member.response;
  let outcomeTouched = false;
  let auditLine: string | null = null;
  let auditActor: string | undefined;

  if (patch.mediums !== undefined) {
    // Normalise to a validated, de-duplicated set — the client may send anything.
    const meds = [...new Set((patch.mediums ?? []).map((m) => String(m).trim().toUpperCase()).filter(Boolean))];
    if (meds.some((m) => !OUTCOMES.has(m))) return { ok: false, error: "Pick Call, WhatsApp, SMS, In-person or Unreachable." };
    if (meds.includes("UNREACHABLE") && meds.length > 1) return { ok: false, error: "Unreachable can't be combined with a channel." };
    effMediums = meds; outcomeTouched = true;
  }
  if (patch.response !== undefined) {
    const resp = patch.response ? String(patch.response).trim().toUpperCase() : null;
    if (resp && !RESPONSES.has(resp)) return { ok: false, error: "Pick Interested, Not interested, or Other crop." };
    effResponse = resp; outcomeTouched = true;
    if (resp === "OTHER_CROP") {
      const crop = (patch.responseCrop ?? "").trim().toLowerCase();
      if (!crop) return { ok: false, error: "Pick which crop they're interested in." };
      data.responseCrop = crop;
    } else {
      data.responseCrop = null; // crop only meaningful for OTHER_CROP
    }
  } else if (patch.responseCrop !== undefined && member.response === "OTHER_CROP") {
    // Crop changed while staying on OTHER_CROP.
    const crop = (patch.responseCrop ?? "").trim().toLowerCase();
    if (!crop) return { ok: false, error: "Pick which crop they're interested in." };
    data.responseCrop = crop;
  }

  if (outcomeTouched) {
    // Reconcile the two dimensions: a real response means contact was made (drop UNREACHABLE);
    // marking UNREACHABLE means no conversation (drop any response).
    if (effResponse && RESPONSES.has(effResponse)) effMediums = effMediums.filter((m) => m !== "UNREACHABLE");
    if (effMediums.includes("UNREACHABLE")) effResponse = null;

    data.mediums = effMediums;
    data.response = effResponse;
    if (!effResponse) data.responseCrop = null;

    const reached = effMediums.some((m) => CONTACT_MEDIA.has(m)) || effResponse != null;
    const recorded = effMediums.length > 0 || effResponse != null;
    data.reached = reached;
    data.reachedAt = recorded ? new Date() : null; // when the outcome was recorded
    const actor = await getActor(); // audit: the ACTUAL logged-in user, never the impersonated persona
    data.reachedBy = recorded ? actor.name : null;
    data.reachedByCode = recorded ? actor.code : null;
    if (recorded) { auditActor = actor.name; auditLine = `Recorded campaign outreach: ${effMediums.join(", ") || "—"}${effResponse ? ` · ${effResponse}` : ""}`; }
  }
  if (patch.comment !== undefined) data.comment = patch.comment?.trim() ? patch.comment.trim().slice(0, 500) : null;
  try {
    await prisma.campaignMember.update({ where: { id: memberId }, data });
    if (auditLine) await logAudit("Campaign", "UPDATE", auditLine, auditActor);
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

export interface UpliftRow {
  segment: string;
  test: { farmers: number; reached: number; purchased: number; avg: number };
  control: { farmers: number; purchased: number; avg: number };
  upliftPurchasePct: number; // test%purch − control%purch
  upliftAvg: number;
  incremental: number;
}

/* ── Attribution: which purchases count as "campaign revenue" ── */
interface ProductFilter { crops: string[]; categories: string[]; all: boolean }

/** Mirror a campaign's segment filters into the products that count as campaign-related. */
function productFilterOf(criteria: ClusterCriteria[]): ProductFilter {
  const crops = new Set<string>(), cats = new Set<string>();
  for (const c of criteria) {
    for (const x of c.cropTags ?? []) crops.add(x);
    for (const x of c.salesCrops ?? []) crops.add(x);
    for (const x of c.visitCrops ?? []) crops.add(x);
    if (c.crop) crops.add(c.crop);
    if (c.category) cats.add(c.category);
  }
  return { crops: [...crops], categories: [...cats], all: crops.size === 0 && cats.size === 0 };
}

/** SaleLine `where` for campaign-matched purchases by the given farmers within [start,end]. */
function matchedLineWhere(pf: ProductFilter, farmerIds: number[], start: Date, end: Date): Prisma.SaleLineWhereInput {
  const base: Prisma.SaleLineWhereInput = { farmerId: { in: farmerIds }, soldAt: { gte: start, lte: end } };
  if (pf.all) return base; // segment isn't product-specific → every purchase counts
  const or: Prisma.SaleLineWhereInput[] = [];
  // Prefer the per-line crop captured from the master file's Crops column (covers crops with no
  // crop-specific product, e.g. potato); also match seed products carrying a crop tag.
  if (pf.crops.length) { or.push({ cropTag: { in: pf.crops } }); or.push({ product: { cropTag: { in: pf.crops } } }); }
  if (pf.categories.length) or.push({ mainCategory: { in: pf.categories } });
  return { ...base, OR: or };
}

/** Sum matched line revenue (base/pre-tax = SaleLine.basic) per farmer, chunked to protect the pooled DB. */
async function matchedSpendByFarmer(pf: ProductFilter, farmerIds: number[], start: Date, end: Date): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < farmerIds.length; i += 15000) {
    const slice = farmerIds.slice(i, i + 15000);
    const rows = await prisma.saleLine.groupBy({ by: ["farmerId"], where: matchedLineWhere(pf, slice, start, end), _sum: { basic: true } });
    for (const r of rows) if (r.farmerId != null) out.set(r.farmerId, Math.round(r._sum.basic ?? 0));
  }
  return out;
}

export interface CampaignReach {
  testTotal: number; reached: number;
  byApproach: { CALL: number; WHATSAPP: number; SMS: number; IN_PERSON: number; unspecified: number };
  byResponse: { interested: number; notInterested: number; otherCrop: number; noResponse: number };
  otherCrops: { crop: string; count: number }[]; // crops requested via "interested in another crop"
  byStore: { store: string; reached: number; total: number; broadcast: number }[]; // outreach progress per store (TEST group)
  broadcastDelivered: number; // TEST members a mass send DELIVERED to (separate from individual `reached`)
  byBroadcastChannel: { SMS: number; WHATSAPP: number };
}
export interface CampaignAttribution {
  basisLabel: string; crops: string[]; categories: string[]; all: boolean; noCatalogMatch: boolean;
  windowStart: string; windowEnd: string;
  reachedFarmers: number; payingFarmers: number; matchedRevenue: number; totalRevenue: number;
}
export interface CampaignTracker { reach: CampaignReach; attribution: CampaignAttribution; upliftByValue: UpliftRow[]; upliftByLifecycle: UpliftRow[] }

/**
 * Campaign Tracker (managers only): outreach reach + real attributed revenue + test/control uplift.
 * Attributed revenue = matched purchases (segment-mirrored products) by CONTACTED (reached) TEST farmers,
 * over the window [campaign start, campaign end + 30 days]. Populated as monthly sales are imported.
 */
export async function getCampaignTracker(campaignId: number): Promise<CampaignTracker | null> {
  const { role } = await getScope();
  if (!canManage(role)) return null; // officers/RMs execute via the scoped farmer list, not the tracker
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!camp) return null;

  // Resolve the campaign's segment criteria (one cluster, or every cluster in its project).
  let clusterIds: number[] = camp.clusterId ? [camp.clusterId] : [];
  if (!clusterIds.length && camp.projectId) {
    const proj = await prisma.project.findUnique({ where: { id: camp.projectId }, include: { clusters: { select: { id: true } } } });
    clusterIds = proj?.clusters.map((c) => c.id) ?? [];
  }
  const clusterRows = clusterIds.length ? await prisma.cluster.findMany({ where: { id: { in: clusterIds } }, select: { criteria: true } }) : [];
  const criteria = clusterRows.map((c) => parseCriteria(c.criteria)).filter((x): x is ClusterCriteria => !!x);
  const pf = productFilterOf(criteria);

  // Flag when the campaign's crop matches NO sales data at all (no per-line crop tag and no crop-tagged
  // product) — e.g. before the SaleLine crop backfill has run, or a crop simply absent from sales.
  let noCatalogMatch = false;
  if (!pf.all && pf.crops.length && pf.categories.length === 0) {
    const [line, prod] = await Promise.all([
      prisma.saleLine.findFirst({ where: { cropTag: { in: pf.crops } }, select: { id: true } }),
      prisma.product.findFirst({ where: { cropTag: { in: pf.crops } }, select: { id: true } }),
    ]);
    noCatalogMatch = !line && !prod;
  }

  const start = camp.startDate;
  const end = new Date(camp.endDate); end.setDate(end.getDate() + 30); // +30-day grace tail

  const members = await prisma.campaignMember.findMany({ where: { campaignId }, select: { farmerId: true, segment: true, valueSegment: true, lifecycleSegment: true, group: true, reached: true, mediums: true, response: true, responseCrop: true, storeId: true, broadcastMediums: true } });
  const test = members.filter((m) => m.group === "TEST");
  const reachedMembers = test.filter((m) => m.reached);
  // Approaches are multi-select, so a farmer reached by Call AND WhatsApp counts under both:
  // these buckets can sum to more than `reached` (the UI says so).
  const byApproach = { CALL: 0, WHATSAPP: 0, SMS: 0, IN_PERSON: 0, unspecified: 0 };
  for (const m of reachedMembers) {
    const keys = m.mediums.map((x) => x.toUpperCase()).filter((k): k is "CALL" | "WHATSAPP" | "SMS" | "IN_PERSON" =>
      k === "CALL" || k === "WHATSAPP" || k === "SMS" || k === "IN_PERSON");
    if (keys.length === 0) byApproach.unspecified++;
    else for (const k of keys) byApproach[k]++;
  }
  // Interest response breakdown over the reached TEST farmers + the "other crop" requests.
  const byResponse = { interested: 0, notInterested: 0, otherCrop: 0, noResponse: 0 };
  const otherCropTally = new Map<string, number>();
  for (const m of reachedMembers) {
    if (m.response === "INTERESTED") byResponse.interested++;
    else if (m.response === "NOT_INTERESTED") byResponse.notInterested++;
    else if (m.response === "OTHER_CROP") { byResponse.otherCrop++; if (m.responseCrop) otherCropTally.set(m.responseCrop, (otherCropTally.get(m.responseCrop) ?? 0) + 1); }
    else byResponse.noResponse++;
  }
  const otherCrops = [...otherCropTally.entries()].sort((a, b) => b[1] - a[1]).map(([crop, count]) => ({ crop, count }));

  // Per-store outreach progress + broadcast delivery (TEST group). Store names resolved from Store.
  const storeIds = [...new Set(test.map((m) => m.storeId).filter((x): x is number => x != null))];
  const storeNames = new Map((await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })).map((s) => [s.id, shortStoreName(s.name)]));
  const storeAgg = new Map<string, { store: string; reached: number; total: number; broadcast: number }>();
  const byBroadcastChannel = { SMS: 0, WHATSAPP: 0 };
  let broadcastDelivered = 0;
  for (const m of test) {
    const store = m.storeId != null ? storeNames.get(m.storeId) ?? "—" : "— No store";
    const a = storeAgg.get(store) ?? { store, reached: 0, total: 0, broadcast: 0 };
    a.total++;
    if (m.reached) a.reached++;
    const bc = m.broadcastMediums ?? [];
    if (bc.length) { a.broadcast++; broadcastDelivered++; if (bc.includes("SMS")) byBroadcastChannel.SMS++; if (bc.includes("WHATSAPP")) byBroadcastChannel.WHATSAPP++; }
    storeAgg.set(store, a);
  }
  const byStore = [...storeAgg.values()].sort((a, b) => b.total - a.total || a.store.localeCompare(b.store));

  // Matched spend per farmer for ALL members (uplift needs the control baseline); total spend for reached test (context).
  const allIds = [...new Set(members.map((m) => m.farmerId))];
  const matched = await matchedSpendByFarmer(pf, allIds, start, end);
  const reachedIds = reachedMembers.map((m) => m.farmerId);
  const totalSpend = await matchedSpendByFarmer({ crops: [], categories: [], all: true }, reachedIds, start, end);

  const matchedRevenue = reachedMembers.reduce((s, m) => s + (matched.get(m.farmerId) ?? 0), 0);
  const totalRevenue = [...totalSpend.values()].reduce((a, b) => a + b, 0);
  const payingFarmers = reachedMembers.filter((m) => (matched.get(m.farmerId) ?? 0) > 0).length;

  // Uplift — test vs control on MATCHED spend in window. The value tier and the lifecycle stage are
  // independent (an HNI farmer can be Lapsed), so we build BOTH breakdowns; the UI toggles between them.
  // Segment snapshots fall back to the legacy collapsed `segment` for members enrolled before the split.
  type Acc = { tF: number; tR: number; tP: number; tSum: number; cF: number; cP: number; cSum: number };
  const buildUplift = (keyOf: (m: (typeof members)[number]) => string, order: readonly string[]): UpliftRow[] => {
    const bySeg = new Map<string, Acc>();
    for (const m of members) {
      const k = keyOf(m);
      const a = bySeg.get(k) ?? { tF: 0, tR: 0, tP: 0, tSum: 0, cF: 0, cP: 0, cSum: 0 };
      const spend = matched.get(m.farmerId) ?? 0;
      const bought = spend > 0;
      if (m.group === "TEST") { a.tF++; if (m.reached) a.tR++; if (bought) { a.tP++; a.tSum += spend; } }
      else { a.cF++; if (bought) { a.cP++; a.cSum += spend; } }
      bySeg.set(k, a);
    }
    return order.filter((k) => bySeg.has(k)).map((segment) => {
      const a = bySeg.get(segment)!;
      const testPurchPct = a.tR > 0 ? a.tP / a.tR : a.tF > 0 ? a.tP / a.tF : 0;
      const ctrlPurchPct = a.cF > 0 ? a.cP / a.cF : 0;
      const testAvg = a.tP > 0 ? a.tSum / a.tP : 0;
      const ctrlAvg = a.cP > 0 ? a.cSum / a.cP : 0;
      const upliftPct = testPurchPct - ctrlPurchPct;
      const reachedOrFarmers = a.tR > 0 ? a.tR : a.tF;
      return {
        segment,
        test: { farmers: a.tF, reached: a.tR, purchased: a.tP, avg: Math.round(testAvg) },
        control: { farmers: a.cF, purchased: a.cP, avg: Math.round(ctrlAvg) },
        upliftPurchasePct: Math.round(upliftPct * 1000) / 10,
        upliftAvg: Math.round(testAvg - ctrlAvg),
        incremental: Math.round(reachedOrFarmers * upliftPct * testAvg),
      };
    });
  };
  const upliftByValue = buildUplift(
    (m) => m.valueSegment ?? (VALUE_SEGMENTS.includes(m.segment as never) ? m.segment : "REGULAR"), VALUE_SEGMENTS);
  const upliftByLifecycle = buildUplift(
    (m) => m.lifecycleSegment ?? (LIFECYCLE_SEGMENTS.includes(m.segment as never) ? m.segment : "LAPSED"), LIFECYCLE_SEGMENTS);

  const basisLabel = pf.all
    ? "All purchases (cluster isn't product-specific)"
    : [pf.crops.length ? `Crop: ${pf.crops.map(cropLabel).join(", ")}` : "", pf.categories.length ? `Category: ${pf.categories.join(", ")}` : ""].filter(Boolean).join(" · ");

  return {
    reach: { testTotal: test.length, reached: reachedMembers.length, byApproach, byResponse, otherCrops, byStore, broadcastDelivered, byBroadcastChannel },
    attribution: {
      basisLabel, crops: pf.crops, categories: pf.categories, all: pf.all, noCatalogMatch,
      windowStart: iso(start)!, windowEnd: iso(end)!,
      reachedFarmers: reachedMembers.length, payingFarmers, matchedRevenue, totalRevenue,
    },
    upliftByValue, upliftByLifecycle,
  };
}

/* ─────────────────────────── Campaign SMS (ZapSMS) ─────────────────────────── */

/** Whether the SMS gateway is configured (all env keys present). */
export async function smsConfigStatus(): Promise<{ ready: boolean; missing: string[] }> {
  const { ready, missing } = zapConfig();
  return { ready, missing };
}

/** Fill the comm-plan placeholders with real data; return the text + which slots had no data. */
function fillSmsTemplate(
  template: string,
  d: { name?: string | null; gap?: number | null; lastItem?: string | null; store?: string | null; number?: string | null; date?: string | null },
): { text: string; missing: string[] } {
  const first = (d.name ?? "").trim().split(/\s+/)[0] || "";
  const gapStr = d.gap != null && d.gap > 0 ? Math.round(d.gap).toLocaleString("en-IN") : "";
  const tokens: { re: RegExp; val: string; label: string }[] = [
    { re: /\[(?:name|Naam)\]/gi, val: first, label: "farmer name" },
    { re: /\[gap\]/g, val: gapStr, label: "amount to reach HNI" },
    { re: /\[last item\]/gi, val: (d.lastItem ?? "").trim(), label: "last purchased item" },
    { re: /\[Store name\]/gi, val: (d.store ?? "").trim(), label: "store name" },
    { re: /\[number\]/gi, val: (d.number ?? "").trim(), label: "contact number" },
    { re: /\[date\]/gi, val: (d.date ?? "").trim(), label: "date" },
  ];
  let text = template;
  const missing: string[] = [];
  for (const t of tokens) {
    const present = new RegExp(t.re.source, t.re.flags.replace("g", "")).test(text);
    if (!present) continue;
    if (t.val) text = text.replace(t.re, t.val);
    else if (!missing.includes(t.label)) missing.push(t.label);
  }
  return { text, missing };
}

export interface SmsPrepared {
  ok: boolean; error?: string;
  message?: string; missing?: string[]; mobile?: string | null;
  templateName?: string; smsReady?: boolean; dltReady?: boolean;
}

/** Load a member + comm template, fill placeholders from real data, and report anything missing. */
export async function prepareCampaignSms(input: { memberId: number; commTemplateId: number }): Promise<SmsPrepared> {
  // SMS sending is restricted to admins / super admins (Central Admin + System Admin).
  if (!(await requireManager()).ok) return { ok: false, error: "SMS is available to admins only." };
  const scope = await memberScopeWhere();
  if (scope === "none") return { ok: false, error: "Not authorised." };
  try {
    const member = await prisma.campaignMember.findFirst({
      where: { id: input.memberId, ...(scope ?? {}) },
      select: { farmerId: true, campaign: { select: { endDate: true } } },
    });
    if (!member) return { ok: false, error: "Member not found or out of your scope." };
    const tpl = await prisma.commTemplate.findUnique({ where: { id: input.commTemplateId }, select: { name: true, template: true, dltTemplateId: true, smsVariables: true } });
    if (!tpl) return { ok: false, error: "Comm plan not found." };

    const [farmer, lastSale, actorMobileRow] = await Promise.all([
      prisma.farmer.findUnique({ where: { id: member.farmerId }, select: { name: true, mobile: true, hniGap: true, village: true, crop: true, cropTags: true, store: { select: { name: true } } } }),
      prisma.sale.findFirst({ where: { farmerId: member.farmerId, soldAt: { not: null } }, orderBy: { soldAt: "desc" }, select: { items: true } }),
      (async () => { const s = await getSession(); return s ? prisma.user.findUnique({ where: { id: s.userId }, select: { mobile: true } }) : null; })(),
    ]);
    const store = farmer?.store?.name ? shortStoreName(farmer.store.name) : "";
    const dateStr = member.campaign?.endDate ? new Date(member.campaign.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "";

    // DLT model: locked template with {#var#} positions mapped in smsVariables. Legacy plans: named [slots].
    const isDlt = (tpl.smsVariables?.length ?? 0) > 0 || /\{#var#\}/i.test(tpl.template);
    let text: string, missing: string[];
    if (isDlt) {
      const src: FarmerVarSource = { name: farmer?.name ?? null, mobile: farmer?.mobile ?? null, village: farmer?.village ?? null, hniGap: farmer?.hniGap ?? null, cropTags: farmer?.cropTags ?? [], crop: farmer?.crop ?? null, storeName: farmer?.store?.name ?? null };
      const vars = resolveVars(src, member.campaign?.endDate ?? null);
      text = fillDltTemplate(tpl.template, tpl.smsVariables, vars);
      // Flag mapped positions that resolve empty (e.g. no name/village on file).
      const n = countDltVars(tpl.template);
      missing = Array.from({ length: n }, (_, i) => tpl.smsVariables?.[i]).filter((k): k is string => !!k && !vars[k]).map((k) => VAR_LABEL[k] ?? k);
    } else {
      const r = fillSmsTemplate(tpl.template, { name: farmer?.name, gap: farmer?.hniGap, lastItem: (lastSale?.items ?? "").split(" · ")[0], store, number: actorMobileRow?.mobile, date: dateStr });
      text = r.text; missing = r.missing;
    }
    return { ok: true, message: text, missing, mobile: farmer?.mobile ?? null, templateName: tpl.name, smsReady: zapConfig().ready, dltReady: !!tpl.dltTemplateId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare the message." };
  }
}

/** Send the SMS via ZapSMS, log it, and mark the member reached-by-SMS on success. */
export async function sendCampaignSms(input: { memberId: number; commTemplateId?: number | null; message: string }): Promise<{ ok: boolean; error?: string; providerId?: string }> {
  // SMS sending is restricted to admins / super admins (Central Admin + System Admin).
  if (!(await requireManager()).ok) return { ok: false, error: "SMS is available to admins only." };
  const scope = await memberScopeWhere();
  if (scope === "none") return { ok: false, error: "Not authorised." };
  const message = (input.message ?? "").trim();
  if (!message) return { ok: false, error: "Message is empty." };
  try {
    const member = await prisma.campaignMember.findFirst({
      where: { id: input.memberId, ...(scope ?? {}) },
      select: { id: true, farmerId: true, campaignId: true, mediums: true },
    });
    if (!member) return { ok: false, error: "Member not found or out of your scope." };
    const farmer = await prisma.farmer.findUnique({ where: { id: member.farmerId }, select: { mobile: true } });
    const mobile = farmer?.mobile ?? "";
    if (!mobile) return { ok: false, error: "No phone number on file for this farmer." };

    const tpl = input.commTemplateId
      ? await prisma.commTemplate.findUnique({ where: { id: input.commTemplateId }, select: { dltTemplateId: true } })
      : null;

    const actor = await getActor();
    const { cfg } = zapConfig();
    const res = await sendSms({ mobile, message, templateId: tpl?.dltTemplateId ?? null });

    await prisma.smsLog.create({
      data: {
        farmerId: member.farmerId, campaignId: member.campaignId, memberId: member.id, mobile,
        senderId: cfg.senderId || null, dltTemplateId: tpl?.dltTemplateId ?? null, message,
        ok: res.ok, providerId: res.providerId ?? null, status: res.status ?? null, error: res.error ?? null,
        sentByName: actor.name, sentByCode: actor.code,
      },
    });

    if (res.ok) {
      const mediums = member.mediums.includes("SMS") ? member.mediums : [...member.mediums.filter((m) => m !== "UNREACHABLE"), "SMS"];
      await prisma.campaignMember.update({
        where: { id: member.id },
        data: { reached: true, reachedAt: new Date(), mediums, reachedBy: actor.name, reachedByCode: actor.code },
      });
      await logAudit("SMS", "SEND", `Sent campaign SMS to ${mobile}`, actor.name);
      revalidatePath("/campaigns");
    }
    return { ok: res.ok, error: res.error, providerId: res.providerId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}

/* ─────────────────────────── WhatsApp (Meta Cloud API) ───────────────────────────
 * Mirrors the SMS path: prepare (fill placeholders) → send → log to WhatsAppLog → mark reached.
 * Restricted to admins / super admins. Text send by default; if the comm plan carries a
 * waTemplateName it sends as a template (Meta requires templates for cold outreach). */

export async function waConfigStatus(): Promise<{ ready: boolean; missing: string[] }> {
  const { ready, missing } = waConfig();
  return { ready, missing };
}

export interface WaPrepared {
  ok: boolean; error?: string;
  message?: string; missing?: string[]; mobile?: string | null;
  templateName?: string; waReady?: boolean; hasTemplate?: boolean;
}

/** Load a member + comm template, fill placeholders from real data, and report anything missing. */
export async function prepareCampaignWhatsApp(input: { memberId: number; commTemplateId: number }): Promise<WaPrepared> {
  if (!(await requireManager()).ok) return { ok: false, error: "WhatsApp is available to admins only." };
  const scope = await memberScopeWhere();
  if (scope === "none") return { ok: false, error: "Not authorised." };
  try {
    const member = await prisma.campaignMember.findFirst({
      where: { id: input.memberId, ...(scope ?? {}) },
      select: { farmerId: true, campaign: { select: { endDate: true } } },
    });
    if (!member) return { ok: false, error: "Member not found or out of your scope." };
    const tpl = await prisma.commTemplate.findUnique({ where: { id: input.commTemplateId }, select: { name: true, template: true, waTemplateName: true, waVariables: true } });
    if (!tpl) return { ok: false, error: "Comm plan not found." };

    const farmer = await prisma.farmer.findUnique({ where: { id: member.farmerId }, select: { name: true, mobile: true, hniGap: true, village: true, crop: true, cropTags: true, store: { select: { name: true } } } });
    // WA templates are {{n}}-based: fill positionally from the mapped farmer fields.
    const src: FarmerVarSource = { name: farmer?.name ?? null, mobile: farmer?.mobile ?? null, village: farmer?.village ?? null, hniGap: farmer?.hniGap ?? null, cropTags: farmer?.cropTags ?? [], crop: farmer?.crop ?? null, storeName: farmer?.store?.name ?? null };
    const vars = resolveVars(src, member.campaign?.endDate ?? null);
    const text = fillWaTemplate(tpl.template, tpl.waVariables, vars);
    const missing = (tpl.waVariables ?? []).filter((k) => !vars[k]).map((k) => VAR_LABEL[k] ?? k);
    return { ok: true, message: text, missing, mobile: farmer?.mobile ?? null, templateName: tpl.name, waReady: waConfig().ready, hasTemplate: !!tpl.waTemplateName };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not prepare the message." };
  }
}

/** Send the WhatsApp message via the Cloud API, log it, and mark the member reached-by-WhatsApp on success. */
export async function sendCampaignWhatsApp(input: { memberId: number; commTemplateId?: number | null; message: string }): Promise<{ ok: boolean; error?: string; providerId?: string }> {
  if (!(await requireManager()).ok) return { ok: false, error: "WhatsApp is available to admins only." };
  const scope = await memberScopeWhere();
  if (scope === "none") return { ok: false, error: "Not authorised." };
  const message = (input.message ?? "").trim();
  if (!message) return { ok: false, error: "Message is empty." };
  try {
    const member = await prisma.campaignMember.findFirst({
      where: { id: input.memberId, ...(scope ?? {}) },
      select: { id: true, farmerId: true, campaignId: true, mediums: true, campaign: { select: { endDate: true } } },
    });
    if (!member) return { ok: false, error: "Member not found or out of your scope." };
    const farmer = await prisma.farmer.findUnique({ where: { id: member.farmerId }, select: { name: true, mobile: true, hniGap: true, village: true, crop: true, cropTags: true, store: { select: { name: true } } } });
    const mobile = farmer?.mobile ?? "";
    if (!mobile) return { ok: false, error: "No phone number on file for this farmer." };

    const tpl = input.commTemplateId
      ? await prisma.commTemplate.findUnique({ where: { id: input.commTemplateId }, select: { waTemplateName: true, waLanguage: true, waVariables: true } })
      : null;
    const useTemplate = !!tpl?.waTemplateName;
    // Template sends need one param per {{n}}, in the comm plan's mapped order — not the whole message text.
    const src: FarmerVarSource = { name: farmer?.name ?? null, mobile: farmer?.mobile ?? null, village: farmer?.village ?? null, hniGap: farmer?.hniGap ?? null, cropTags: farmer?.cropTags ?? [], crop: farmer?.crop ?? null, storeName: farmer?.store?.name ?? null };
    const vars = resolveVars(src, member.campaign?.endDate ?? null);

    const actor = await getActor();
    const res = await sendWhatsApp({
      mobile, message,
      templateName: useTemplate ? tpl!.waTemplateName : null,
      languageCode: tpl?.waLanguage ?? null,
      bodyParams: useTemplate ? positionalParams(tpl!.waVariables, vars) : undefined,
    });

    await prisma.whatsAppLog.create({
      data: {
        farmerId: member.farmerId, campaignId: member.campaignId, memberId: member.id, mobile,
        kind: useTemplate ? "template" : "text", templateName: useTemplate ? tpl!.waTemplateName : null, message,
        ok: res.ok, providerId: res.providerId ?? null, status: res.status ?? null, error: res.error ?? null,
        sentByName: actor.name, sentByCode: actor.code,
      },
    });

    if (res.ok) {
      const mediums = member.mediums.includes("WHATSAPP") ? member.mediums : [...member.mediums.filter((m) => m !== "UNREACHABLE"), "WHATSAPP"];
      await prisma.campaignMember.update({
        where: { id: member.id },
        data: { reached: true, reachedAt: new Date(), mediums, reachedBy: actor.name, reachedByCode: actor.code },
      });
      await logAudit("WhatsApp", "SEND", `Sent campaign WhatsApp ${useTemplate ? "template" : "message"} to ${mobile}`, actor.name);
      revalidatePath("/campaigns");
    }
    return { ok: res.ok, error: res.error, providerId: res.providerId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}
