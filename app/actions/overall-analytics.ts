"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRole } from "@/lib/session";
import { shortStoreName } from "@/lib/store-utils";
import { PRISMA_TO_KEY, type RoleKey } from "@/lib/roles";

/**
 * "Overall" dashboard for the Audit Log page (sysadmin-only). Turns the raw audit trail + domain
 * tables into an adoption/usage picture: who uses the app, for what, and what is not happening.
 *
 * Honest-signal notes (this schema has real gaps — the UI states them):
 *  • No session / page-activity table → no "active time", no session counts, no effort-vs-output.
 *  • No login history or failed-login capture → "sign-ins" = users whose LAST sign-in falls in the
 *    window (User.lastLoginAt), NOT an event count. No user-agent → no device split.
 *  • Activity counts use the AuditLog WRITE-EVENT trail (every create + edit). AuditLog only stores
 *    the actor's NAME, so its role/person filter matches by name; per-person OUTPUTS (visits, ghoshti,
 *    actions) attribute by the real logged-in user's code (Visit.recordedByCode → User.employeeCode,
 *    100% coverage). AuditLog currently instruments Visits (+ sale imports, settings) only.
 *  • Farmers (141k) and Sales (334k) are bulk imports — excluded from in-period "outputs".
 */

const IST = 330 * 60_000; // Asia/Kolkata offset (no DST)
const DAY = 86_400_000;
const DRILL_CAP = 500;

export type WindowKey = "today" | "7d" | "30d" | "90d" | "all";
export interface OverallFilters {
  window: WindowKey;
  role: RoleKey | "all";
  person: number | "all"; // User.id
}

// ── shared shapes ──
export interface Tile { key: string; label: string; value: number; tone: "good" | "bad" | "warn" | "neutral"; sub?: string; naNote?: string }
export interface DayPoint { date: string; created: number; updated: number; total: number }
export interface PersonRow {
  id: number; name: string; code: string | null; role: RoleKey; roleLabel: string; territory: string;
  writeEvents: number; visits: number; ghoshti: number; actionsDone: number;
  openAssigned: number; // denominator: open follow-ups assigned to their store ("tickets assigned")
  active: boolean; neverSignedIn: boolean; dormant: boolean; lastLoginAt: string | null;
  sharedName: boolean; // name is shared by ≥2 accounts → write-events disambiguated by code-visit share
}
export interface OverallData {
  windowLabel: string; generatedMs: number;
  coverage: string[]; // caveats to render loudly, in order
  adoption: Tile[];
  totalWriteEvents: number;
  byDay: DayPoint[];
  heatmap: number[][]; // [weekday 0=Sun..6][hour 0..23]
  heatmapMax: number;
  shape: { key: string; label: string; value: number; instrumented: boolean }[];
  areas: { area: string; events: number; source: string }[];
  people: PersonRow[];
  peopleStats: { metric: string; avg: number; median: number; scored: number }[];
  outputs: Tile[];
  attention: Tile[];
}

// ─────────────────────── filter resolution (built ONCE, passed everywhere) ───────────────────────

interface Population {
  since: Date | null;
  windowLabel: string;
  filterActive: boolean;               // a role or person filter is applied
  users: {
    id: number; name: string; code: string | null; roleKey: RoleKey; roleLabel: string;
    storeId: number | null; zone: string | null; territory: string | null;
    active: boolean; lastLoginAt: Date | null; createdAt: Date;
  }[];
  codes: string[];                     // employeeCodes of the population (for domain tables)
  names: string[];                     // names of the population (for AuditLog.actor)
  storeIds: number[];
}

function sinceFor(w: WindowKey): Date | null {
  if (w === "all") return null;
  const now = new Date();
  if (w === "today") { const ist = new Date(now.getTime() + IST); ist.setUTCHours(0, 0, 0, 0); return new Date(ist.getTime() - IST); }
  const days = w === "7d" ? 7 : w === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * DAY);
}
const WINDOW_LABEL: Record<WindowKey, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" };

async function resolvePopulation(f: OverallFilters): Promise<Population> {
  const since = sinceFor(f.window);
  const where: Prisma.UserWhereInput = { source: "REAL" };
  if (f.role !== "all") where.role = { in: (Object.entries(PRISMA_TO_KEY).filter(([, k]) => k === f.role).map(([p]) => p)) as never };
  if (f.person !== "all") where.id = f.person;

  const rows = await prisma.user.findMany({
    where,
    select: { id: true, name: true, employeeCode: true, role: true, roleLabel: true, storeId: true, zone: true, territory: true, active: true, lastLoginAt: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  const users = rows.map((u) => ({
    id: u.id, name: u.name, code: u.employeeCode, roleKey: PRISMA_TO_KEY[u.role] ?? "officer",
    roleLabel: u.roleLabel || u.role, storeId: u.storeId, zone: u.zone, territory: u.territory,
    active: u.active, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  }));
  return {
    since, windowLabel: WINDOW_LABEL[f.window], filterActive: f.role !== "all" || f.person !== "all",
    users,
    codes: users.map((u) => u.code).filter((c): c is string => !!c),
    names: users.map((u) => u.name),
    storeIds: [...new Set(users.map((u) => u.storeId).filter((x): x is number => x != null))],
  };
}

// where-clause helpers that fold in window + (optional) population scoping
const gte = (since: Date | null) => (since ? { gte: since } : undefined);
const lc = (s: string | null) => (s ?? "").trim().toLowerCase();

/**
 * Attribute name-keyed audit write-events to real accounts. AuditLog stores only the actor's NAME,
 * and several names are shared by ≥2 accounts here — a plain name-match would credit every namesake
 * (e.g. a never-signed-in twin would inherit the other's events). Resolve by the attribution key we
 * chose (recordedByCode): split a shared name's events across its accounts in proportion to each
 * account's code-attributed visit count. Exact-sum (remainder → the largest share).
 */
function allocateWrites(
  users: { id: number; name: string; code: string | null }[],
  writesByName: Map<string, number>,
  visitByCodeMap: Map<string, number>,
): { alloc: Map<number, number>; shared: Set<string>; unattributed: number } {
  const byName = new Map<string, typeof users>();
  for (const u of users) { const k = lc(u.name); byName.set(k, [...(byName.get(k) ?? []), u]); }
  const shared = new Set([...byName.entries()].filter(([, v]) => v.length > 1).map(([k]) => k));
  const alloc = new Map<number, number>();
  let unattributed = 0;
  for (const [name, events] of writesByName) {
    const grp = byName.get(name);
    if (!grp || grp.length === 0) { unattributed += events; continue; }
    if (grp.length === 1) { alloc.set(grp[0].id, (alloc.get(grp[0].id) ?? 0) + events); continue; }
    const weights = grp.map((u) => visitByCodeMap.get(lc(u.code)) ?? 0);
    const sw = weights.reduce((s, w) => s + w, 0);
    const parts = sw > 0 ? weights.map((w) => Math.floor((events * w) / sw)) : grp.map(() => Math.floor(events / grp.length));
    let rem = events - parts.reduce((s, v) => s + v, 0);
    const order = grp.map((_, i) => i).sort((a, b) => (sw > 0 ? weights[b] - weights[a] : 0));
    for (const i of order) { if (rem <= 0) break; parts[i]++; rem--; }
    grp.forEach((u, i) => alloc.set(u.id, (alloc.get(u.id) ?? 0) + parts[i]));
  }
  return { alloc, shared, unattributed };
}

// ─────────────────────────────────── main query ───────────────────────────────────

export async function getOverallAnalytics(f: OverallFilters): Promise<OverallData | null> {
  if ((await getRole()) !== "sysadmin") return null;
  const t0 = Date.now();
  const pop = await resolvePopulation(f);
  const { since, filterActive, users, codes, names } = pop;

  // Audit write-event trail (THE activity signal). One light fetch drives total/day/heatmap/shape/person-writes.
  const auditWhere: Prisma.AuditLogWhereInput = {};
  if (since) auditWhere.createdAt = { gte: since };
  if (filterActive) auditWhere.actor = { in: names };
  const audit = await prisma.auditLog.findMany({ where: auditWhere, select: { createdAt: true, action: true, actor: true, entity: true } });

  // Domain windowed outputs, attributed by code.
  const codeIn = filterActive ? { in: codes } : undefined;
  const [visitCount, visitByCode, ghoshtiCount, ghoshtiByCode, attNew, attExisting, actCreated, actDoneByCode, actDoneCount] = await Promise.all([
    prisma.visit.count({ where: { createdAt: gte(since), ...(codeIn ? { recordedByCode: codeIn } : {}) } }),
    prisma.visit.groupBy({ by: ["recordedByCode"], where: { createdAt: gte(since), recordedByCode: { not: null } }, _count: { _all: true } }),
    prisma.ghoshti.count({ where: { createdAt: gte(since), ...(codeIn ? { createdByCode: codeIn } : {}) } }),
    prisma.ghoshti.groupBy({ by: ["createdByCode"], where: { createdAt: gte(since), createdByCode: { not: null } }, _count: { _all: true } }),
    prisma.ghoshtiAttendee.count({ where: { createdAt: gte(since), isExisting: false, ...(codeIn ? { recordedByCode: codeIn } : {}) } }),
    prisma.ghoshtiAttendee.count({ where: { createdAt: gte(since), isExisting: true, ...(codeIn ? { recordedByCode: codeIn } : {}) } }),
    prisma.action.count({ where: { createdAt: gte(since), ...(codeIn ? { createdByCode: codeIn } : {}) } }),
    prisma.action.groupBy({ by: ["completedByCode"], where: { completedAt: gte(since), completedByCode: { not: null } }, _count: { _all: true } }),
    prisma.action.count({ where: { completedAt: gte(since), ...(codeIn ? { completedByCode: codeIn } : {}) } }),
  ]);

  // Denominator: open follow-ups assigned per store (current state — "tickets assigned").
  const openByStore = await prisma.action.groupBy({ by: ["storeId"], where: { status: "OPEN", storeId: { not: null } }, _count: { _all: true } });
  const openStoreMap = new Map(openByStore.map((r) => [r.storeId as number, r._count._all]));

  // ── bucket the audit trail (IST) ──
  const key = (s: string | null) => (s ?? "").trim().toLowerCase();
  const visitByCodeMap = new Map(visitByCode.map((r) => [key(r.recordedByCode), r._count._all]));
  const ghoshtiByCodeMap = new Map(ghoshtiByCode.map((r) => [key(r.createdByCode), r._count._all]));
  const actDoneMap = new Map(actDoneByCode.map((r) => [key(r.completedByCode), r._count._all]));
  const writesByName = new Map<string, number>();
  const dayMap = new Map<string, { c: number; u: number }>();
  const heat: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const shapeMap = new Map<string, number>();
  const entityMap = new Map<string, number>();
  let minMs = since ? since.getTime() : Infinity;
  for (const a of audit) {
    const ist = new Date(a.createdAt.getTime() + IST);
    const dk = ist.toISOString().slice(0, 10);
    const d = dayMap.get(dk) ?? { c: 0, u: 0 };
    if (a.action === "CREATE") d.c++; else d.u++;
    dayMap.set(dk, d);
    heat[ist.getUTCDay()][ist.getUTCHours()]++;
    shapeMap.set(a.action, (shapeMap.get(a.action) ?? 0) + 1);
    entityMap.set(a.entity ?? "Other", (entityMap.get(a.entity ?? "Other") ?? 0) + 1);
    writesByName.set(key(a.actor), (writesByName.get(key(a.actor)) ?? 0) + 1);
    if (a.createdAt.getTime() < minMs) minMs = a.createdAt.getTime();
  }
  const totalWriteEvents = audit.length;

  // day-by-day dense range (min → now, IST)
  const byDay: DayPoint[] = [];
  if (audit.length) {
    const start = new Date((Number.isFinite(minMs) ? minMs : Date.now()) + IST); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(Date.now() + IST); end.setUTCHours(0, 0, 0, 0);
    for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
      const dk = new Date(t).toISOString().slice(0, 10);
      const d = dayMap.get(dk) ?? { c: 0, u: 0 };
      byDay.push({ date: dk, created: d.c, updated: d.u, total: d.c + d.u });
    }
  }
  const heatmapMax = Math.max(1, ...heat.flat());

  // shape of writing — every action verb present in the trail (sums to the write-event total).
  const SHAPE_LABEL: Record<string, string> = { CREATE: "Create", UPDATE: "Update", DELETE: "Delete", SEND: "Send", IMPORT: "Import", CONFIG: "Config", EXPORT: "Export" };
  const shape = [...shapeMap.entries()].map(([k, v]) => ({ key: k, label: SHAPE_LABEL[k] ?? k, value: v, instrumented: true })).sort((a, b) => b.value - a.value);

  // areas of work — audit entity breakdown (sums to the write-event total).
  const AREA_LABEL: Record<string, string> = { Visit: "Field visits", Farmer: "Farmer records", Campaign: "Campaigns", SMS: "SMS sends", WhatsApp: "WhatsApp sends", Broadcast: "Mass sends", Sale: "Sales imports", Setting: "Settings", Other: "Other" };
  const areas = [...entityMap.entries()].map(([k, v]) => ({ area: AREA_LABEL[k] ?? k, events: v, source: "audit trail" })).sort((a, b) => b.events - a.events);

  // ── per-person rows ──
  const now = Date.now();
  const { alloc: allocWrites, shared: sharedNames } = allocateWrites(users, writesByName, visitByCodeMap);
  const people: PersonRow[] = users.map((u) => {
    const nm = key(u.name); const cd = key(u.code);
    const dormant = !!u.lastLoginAt && u.lastLoginAt.getTime() < now - 30 * DAY;
    return {
      id: u.id, name: u.name, code: u.code, role: u.roleKey, roleLabel: u.roleLabel,
      territory: u.zone || u.territory || "—",
      writeEvents: allocWrites.get(u.id) ?? 0,
      visits: visitByCodeMap.get(cd) ?? 0,
      ghoshti: ghoshtiByCodeMap.get(cd) ?? 0,
      actionsDone: actDoneMap.get(cd) ?? 0,
      openAssigned: u.storeId != null ? (openStoreMap.get(u.storeId) ?? 0) : 0,
      active: u.active,
      neverSignedIn: !u.lastLoginAt,
      dormant,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      sharedName: sharedNames.has(nm),
    };
  }).sort((a, b) => b.writeEvents - a.writeEvents || a.name.localeCompare(b.name));

  const stat = (vals: number[]) => {
    const scored = vals.filter((v) => v > 0).length;
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    const s = [...vals].sort((a, b) => a - b);
    const median = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
    return { avg, median, scored };
  };
  const peopleStats = [
    { metric: "Write-events / person", ...stat(people.map((p) => p.writeEvents)) },
    { metric: "Visits / person", ...stat(people.map((p) => p.visits)) },
    { metric: "Actions done / person", ...stat(people.map((p) => p.actionsDone)) },
  ];

  // ── adoption tiles ──
  const total = users.length;
  const activeAcct = users.filter((u) => u.active).length;
  const neverIn = users.filter((u) => !u.lastLoginAt).length;
  const dormantCt = users.filter((u) => u.lastLoginAt && u.lastLoginAt.getTime() < now - 30 * DAY).length;
  const activeInWindow = users.filter((u) => (allocWrites.get(u.id) ?? 0) > 0 || (u.lastLoginAt && (!since || u.lastLoginAt >= since))).length;
  const signInsInWindow = users.filter((u) => u.lastLoginAt && (!since || u.lastLoginAt >= since)).length;

  const adoption: Tile[] = [
    { key: "total", label: "Accounts", value: total, tone: "neutral", sub: filterActive ? "in this filter" : "real accounts" },
    { key: "activeInWindow", label: "Active in window", value: activeInWindow, tone: activeInWindow > total * 0.5 ? "good" : "warn", sub: "wrote or signed in" },
    { key: "signins", label: "Signed in (window)", value: signInsInWindow, tone: "neutral", sub: "users last-seen in window*" },
    { key: "writeEvents", label: "Write-events", value: totalWriteEvents, tone: totalWriteEvents > 0 ? "good" : "bad", sub: "creates + edits" },
    { key: "visits", label: "Visits produced", value: visitCount, tone: "good", sub: "distinct, in window" },
    { key: "never", label: "Never signed in", value: neverIn, tone: neverIn > 0 ? "bad" : "good", sub: "of the accounts" },
    { key: "dormant", label: "Dormant", value: dormantCt, tone: dormantCt > 0 ? "warn" : "good", sub: "idle >30 days" },
    { key: "inactive", label: "Deactivated", value: total - activeAcct, tone: total - activeAcct > 0 ? "warn" : "good", sub: "account disabled" },
  ];

  // ── outputs (what came out of it, windowed) ──
  const outputs: Tile[] = [
    { key: "o_visits", label: "Visits logged", value: visitCount, tone: "good" },
    { key: "o_ghoshti", label: "Ghoshti meetups", value: ghoshtiCount, tone: "neutral" },
    { key: "o_attNew", label: "New farmers (ghoshti)", value: attNew, tone: "good", sub: "unmatched attendees" },
    { key: "o_attExisting", label: "Existing (ghoshti)", value: attExisting, tone: "neutral" },
    { key: "o_actCreated", label: "Follow-ups created", value: actCreated, tone: "neutral" },
    { key: "o_actDone", label: "Follow-ups completed", value: actDoneCount, tone: "good" },
  ];

  // ── needs attention (CURRENT state — ignores the window) ──
  const attStoreIn = filterActive && pop.storeIds.length ? { in: pop.storeIds } : undefined;
  const [openAct, overdueAct, unreviewed, pendingGhoshti, openBugs] = await Promise.all([
    prisma.action.count({ where: { status: "OPEN", ...(attStoreIn ? { storeId: attStoreIn } : {}) } }),
    prisma.action.count({ where: { status: "OPEN", dueDate: { lt: new Date() }, ...(attStoreIn ? { storeId: attStoreIn } : {}) } }),
    prisma.visit.count({ where: { reviewedAt: null, ...(codeIn ? { recordedByCode: codeIn } : {}) } }),
    prisma.ghoshti.count({ where: { status: "PENDING", ...(attStoreIn ? { storeId: attStoreIn } : {}) } }),
    prisma.bug.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "TESTING"] } } }),
  ]);
  const attention: Tile[] = [
    { key: "a_never", label: "Never signed in", value: neverIn, tone: neverIn > 0 ? "bad" : "good", sub: "accounts unused" },
    { key: "a_dormant", label: "Dormant users", value: dormantCt, tone: dormantCt > 0 ? "warn" : "good", sub: "idle >30 days" },
    { key: "a_overdue", label: "Overdue follow-ups", value: overdueAct, tone: overdueAct > 0 ? "bad" : "good", sub: "past due date" },
    { key: "a_open", label: "Open follow-ups", value: openAct, tone: openAct > 0 ? "warn" : "good" },
    { key: "a_unreviewed", label: "Unreviewed visits", value: unreviewed, tone: unreviewed > 0 ? "warn" : "good", sub: "no RM sign-off" },
    { key: "a_pendingGhoshti", label: "Ghoshti awaiting approval", value: pendingGhoshti, tone: pendingGhoshti > 0 ? "warn" : "good" },
    { key: "a_bugs", label: "Open bug reports", value: openBugs, tone: openBugs > 0 ? "warn" : "good", naNote: filterActive ? "org-wide (bugs carry no owner)" : undefined },
  ];

  const coverage = [
    "No session or time-tracking exists — there is no “active time” or session count, and the day-by-day chart shows records produced only, not effort. Effort that produces nothing cannot be drawn here.",
    "No login history or failed-login capture — “Signed in (window)” counts users whose LAST sign-in falls in the window (User.lastLoginAt), not sign-in events. Failed sign-ins are not recorded.",
    "No user-agent is stored — device / browser split is unavailable.",
    "The audit trail instruments Visits (+ sale imports, settings) only, and stores the actor’s name, not code. Write-events therefore reflect visit activity; per-person outputs (visits, ghoshti, actions) attribute by the real logged-in user’s code.",
    "Farmers and Sales are bulk imports — excluded from in-period outputs.",
  ];

  return {
    windowLabel: pop.windowLabel, generatedMs: Date.now() - t0, coverage,
    adoption, totalWriteEvents, byDay, heatmap: heat, heatmapMax, shape, areas,
    people, peopleStats, outputs, attention,
  };
}

// ─────────────────────────────────── drill-down ───────────────────────────────────

export interface DrillResult { title: string; note?: string; columns: string[]; rows: string[][]; count: number; capped: boolean }

const relDay = (d: Date | null) => {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`;
};
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
const fmtDt = (d: Date | null) => (d ? new Date(d.getTime() + IST).toISOString().slice(0, 16).replace("T", " ") + " IST" : "—");

/** Rows behind a tile — built from the SAME clauses the tile used, so the list can never disagree. */
export async function getOverallDrilldown(tileKey: string, f: OverallFilters): Promise<DrillResult | null> {
  if ((await getRole()) !== "sysadmin") return null;
  const pop = await resolvePopulation(f);
  const { since, filterActive, users, codes, names } = pop;
  const codeIn = filterActive ? { in: codes } : undefined;
  const now = Date.now();

  const userRows = (list: typeof users, sub?: (u: typeof users[number]) => string) => ({
    columns: ["Employee", "Code", "Role", "Territory", "Last sign-in", ...(sub ? ["Note"] : [])],
    rows: list.map((u) => [u.name, u.code ?? "—", u.roleLabel, u.zone || u.territory || "—", u.lastLoginAt ? `${fmtDate(u.lastLoginAt)} (${relDay(u.lastLoginAt)})` : "never", ...(sub ? [sub(u)] : [])]),
  });

  // People-list tiles (from the resolved population — no extra query, exact by construction).
  if (tileKey === "total") { const r = userRows(users); return cap({ title: "Accounts in filter", ...r, count: users.length }); }
  if (tileKey === "never" || tileKey === "a_never") { const l = users.filter((u) => !u.lastLoginAt); const r = userRows(l); return cap({ title: "Never signed in", note: "Accounts that have never logged in.", ...r, count: l.length }); }
  if (tileKey === "dormant" || tileKey === "a_dormant") { const l = users.filter((u) => u.lastLoginAt && u.lastLoginAt.getTime() < now - 30 * DAY); const r = userRows(l); return cap({ title: "Dormant users", note: "Signed in at least once, nothing in the last 30 days.", ...r, count: l.length }); }
  if (tileKey === "inactive") { const l = users.filter((u) => !u.active); const r = userRows(l); return cap({ title: "Deactivated accounts", ...r, count: l.length }); }
  if (tileKey === "signins") { const l = users.filter((u) => u.lastLoginAt && (!since || u.lastLoginAt >= since)); const r = userRows(l, (u) => relDay(u.lastLoginAt)); return cap({ title: "Signed in during window", note: "Users whose LAST sign-in falls in the window (not an event count).", ...r, count: l.length }); }
  if (tileKey === "activeInWindow") {
    // Same allocation the tile uses, so the list can't disagree.
    const auditWhere: Prisma.AuditLogWhereInput = {}; if (since) auditWhere.createdAt = { gte: since }; if (filterActive) auditWhere.actor = { in: names };
    const [acts, vg] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["actor"], where: auditWhere, _count: { _all: true } }),
      prisma.visit.groupBy({ by: ["recordedByCode"], where: { createdAt: gte(since), recordedByCode: { not: null } }, _count: { _all: true } }),
    ]);
    const writesByName = new Map(acts.map((a) => [lc(a.actor), a._count._all]));
    const visitByCodeMap = new Map(vg.map((r) => [lc(r.recordedByCode), r._count._all]));
    const { alloc } = allocateWrites(users, writesByName, visitByCodeMap);
    const l = users.filter((u) => (alloc.get(u.id) ?? 0) > 0 || (u.lastLoginAt && (!since || u.lastLoginAt >= since)));
    const r = userRows(l, (u) => ((alloc.get(u.id) ?? 0) > 0 ? "wrote" : "signed in"));
    return cap({ title: "Active in window", note: "Wrote something (attributed by code) or signed in during the window.", ...r, count: l.length });
  }

  // Audit-event tiles.
  if (tileKey === "writeEvents") {
    const w: Prisma.AuditLogWhereInput = {}; if (since) w.createdAt = { gte: since }; if (filterActive) w.actor = { in: names };
    const count = await prisma.auditLog.count({ where: w });
    const list = await prisma.auditLog.findMany({ where: w, orderBy: { createdAt: "desc" }, take: DRILL_CAP, select: { createdAt: true, action: true, entity: true, actor: true, detail: true } });
    return cap({ title: "Write-events", note: "Every create + edit in the audit trail (window).", columns: ["When", "Action", "Entity", "Actor", "Detail"], rows: list.map((a) => [fmtDt(a.createdAt), a.action, a.entity ?? "—", a.actor ?? "—", a.detail ?? "—"]), count });
  }

  // Domain output tiles.
  if (tileKey === "visits" || tileKey === "o_visits") {
    const w: Prisma.VisitWhereInput = { createdAt: gte(since), ...(codeIn ? { recordedByCode: codeIn } : {}) };
    const count = await prisma.visit.count({ where: w });
    const list = await prisma.visit.findMany({ where: w, orderBy: { createdAt: "desc" }, take: DRILL_CAP, select: { createdAt: true, officerName: true, recordedByCode: true, type: true, mainCrop: true } });
    return cap({ title: "Visits logged", columns: ["When", "Officer", "Code", "Type", "Crop"], rows: list.map((v) => [fmtDate(v.createdAt), v.officerName ?? "—", v.recordedByCode ?? "—", v.type ?? "—", v.mainCrop ?? "—"]), count });
  }
  if (tileKey === "o_ghoshti") {
    const w: Prisma.GhoshtiWhereInput = { createdAt: gte(since), ...(codeIn ? { createdByCode: codeIn } : {}) };
    const count = await prisma.ghoshti.count({ where: w });
    const list = await prisma.ghoshti.findMany({ where: w, orderBy: { createdAt: "desc" }, take: DRILL_CAP, select: { date: true, storeName: true, topic: true, status: true, createdByName: true } });
    return cap({ title: "Ghoshti meetups", columns: ["Date", "Store", "Topic", "Status", "Organiser"], rows: list.map((g) => [fmtDate(g.date), g.storeName ?? "—", g.topic ?? "—", g.status, g.createdByName ?? "—"]), count });
  }
  if (tileKey === "o_attNew" || tileKey === "o_attExisting") {
    const isExisting = tileKey === "o_attExisting";
    const w: Prisma.GhoshtiAttendeeWhereInput = { createdAt: gte(since), isExisting, ...(codeIn ? { recordedByCode: codeIn } : {}) };
    const count = await prisma.ghoshtiAttendee.count({ where: w });
    const list = await prisma.ghoshtiAttendee.findMany({ where: w, orderBy: { createdAt: "desc" }, take: DRILL_CAP, select: { createdAt: true, mobile: true, name: true, recordedByName: true } });
    return cap({ title: isExisting ? "Existing farmers (ghoshti)" : "New farmers (ghoshti)", columns: ["When", "Mobile", "Name", "Recorded by"], rows: list.map((a) => [fmtDate(a.createdAt), a.mobile, a.name ?? "—", a.recordedByName ?? "—"]), count });
  }
  if (tileKey === "o_actCreated" || tileKey === "o_actDone") {
    const done = tileKey === "o_actDone";
    const w: Prisma.ActionWhereInput = done
      ? { completedAt: gte(since), ...(codeIn ? { completedByCode: codeIn } : {}) }
      : { createdAt: gte(since), ...(codeIn ? { createdByCode: codeIn } : {}) };
    const count = await prisma.action.count({ where: w });
    const list = await prisma.action.findMany({ where: w, orderBy: done ? { completedAt: "desc" } : { createdAt: "desc" }, take: DRILL_CAP, select: { createdAt: true, completedAt: true, reason: true, status: true, createdByName: true, completedByName: true } });
    return cap({ title: done ? "Follow-ups completed" : "Follow-ups created", columns: ["When", "Reason", "Status", "By"], rows: list.map((a) => [fmtDate(done ? a.completedAt : a.createdAt), a.reason ?? "—", a.status, (done ? a.completedByName : a.createdByName) ?? "—"]), count });
  }

  // Needs-attention tiles.
  const attStoreIn = filterActive && pop.storeIds.length ? { in: pop.storeIds } : undefined;
  if (tileKey === "a_overdue" || tileKey === "a_open") {
    const w: Prisma.ActionWhereInput = { status: "OPEN", ...(tileKey === "a_overdue" ? { dueDate: { lt: new Date() } } : {}), ...(attStoreIn ? { storeId: attStoreIn } : {}) };
    const count = await prisma.action.count({ where: w });
    const list = await prisma.action.findMany({ where: w, orderBy: { dueDate: "asc" }, take: DRILL_CAP, select: { dueDate: true, reason: true, createdByName: true, storeId: true } });
    const sMap = await storeNames(list.map((a) => a.storeId));
    return cap({ title: tileKey === "a_overdue" ? "Overdue follow-ups" : "Open follow-ups", note: "Current state — not limited to the window.", columns: ["Due", "Reason", "Store", "Created by"], rows: list.map((a) => [`${fmtDate(a.dueDate)} (${relDay(a.dueDate)})`, a.reason ?? "—", a.storeId != null ? sMap.get(a.storeId) ?? "—" : "—", a.createdByName ?? "—"]), count });
  }
  if (tileKey === "a_unreviewed") {
    const w: Prisma.VisitWhereInput = { reviewedAt: null, ...(codeIn ? { recordedByCode: codeIn } : {}) };
    const count = await prisma.visit.count({ where: w });
    const list = await prisma.visit.findMany({ where: w, orderBy: { createdAt: "desc" }, take: DRILL_CAP, select: { createdAt: true, officerName: true, type: true } });
    return cap({ title: "Unreviewed visits", note: "Current state — no RM sign-off. Not limited to the window.", columns: ["When", "Officer", "Type"], rows: list.map((v) => [fmtDate(v.createdAt), v.officerName ?? "—", v.type ?? "—"]), count });
  }
  if (tileKey === "a_pendingGhoshti") {
    const w: Prisma.GhoshtiWhereInput = { status: "PENDING", ...(attStoreIn ? { storeId: attStoreIn } : {}) };
    const count = await prisma.ghoshti.count({ where: w });
    const list = await prisma.ghoshti.findMany({ where: w, orderBy: { createdAt: "desc" }, take: DRILL_CAP, select: { date: true, storeName: true, topic: true, createdByName: true } });
    return cap({ title: "Ghoshti awaiting approval", note: "Current state — not limited to the window.", columns: ["Date", "Store", "Topic", "Organiser"], rows: list.map((g) => [fmtDate(g.date), g.storeName ?? "—", g.topic ?? "—", g.createdByName ?? "—"]), count });
  }
  if (tileKey === "a_bugs") {
    const count = await prisma.bug.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "TESTING"] } } });
    const list = await prisma.bug.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS", "TESTING"] } }, orderBy: { createdAt: "desc" }, take: DRILL_CAP, select: { createdAt: true, title: true, severity: true, status: true, reporter: true } });
    return cap({ title: "Open bug reports", note: "Org-wide — bug reports carry no owner, so the person/role filter does not apply.", columns: ["When", "Title", "Severity", "Status", "Reporter"], rows: list.map((b) => [fmtDate(b.createdAt), b.title, b.severity, b.status, b.reporter ?? "—"]), count });
  }

  return null;
}

function cap(r: { title: string; note?: string; columns: string[]; rows: string[][]; count: number }): DrillResult {
  const rows = r.rows.slice(0, DRILL_CAP);
  return { title: r.title, note: r.note, columns: r.columns, rows, count: r.count, capped: rows.length < r.count };
}

async function storeNames(ids: (number | null)[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter((x): x is number => x != null))];
  if (!uniq.length) return new Map();
  const rows = await prisma.store.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(rows.map((s) => [s.id, shortStoreName(s.name) || s.name]));
}

/** Person options for the filter dropdown (real accounts). */
export async function getOverallPeopleOptions(): Promise<{ id: number; name: string; code: string | null; role: RoleKey }[]> {
  if ((await getRole()) !== "sysadmin") return [];
  const rows = await prisma.user.findMany({ where: { source: "REAL" }, select: { id: true, name: true, employeeCode: true, role: true }, orderBy: { name: "asc" } });
  return rows.map((u) => ({ id: u.id, name: u.name, code: u.employeeCode, role: PRISMA_TO_KEY[u.role] ?? "officer" }));
}
