"use server";

// WhatsApp opt-in analysis (WhatsApp page → "📈 Opt-in analysis" tab). Sysadmin-only, like the inbox.
//
// The opt-in QR on the New Visit form is one generic code, so an opt-in carries no officer/store tag.
// Attribution is inferred:
//   1. VISIT   — the number opted in within −12h…+24h of a visit to that farmer (farmer mobile or the
//                visit's WhatsApp number): credited to the officer who filled that visit, at the visit's store.
//   2. FARMER  — a registered farmer (matched by mobile NOW, so farmers registered after they messaged
//                still count) but no visit near the opt-in: credited to the farmer's home store.
//   3. UNREGISTERED — the number matches no farmer: no store (a lead to register).
//
// MULTI-RM (Verde-only): a store can have SEVERAL regional managers. `Store.rmUserIds` is authoritative;
// `Store.regionalManager` is only a comma-joined display label, so it is NOT a grouping key — rolling up
// by that string would file a shared store under a phantom "Asha R, Vikram S" row and under neither of
// its actual managers. The RM roll-up therefore resolves stores per REGIONAL *user id* via
// `lib/rm-stores.ts` (the same rule as row-level scope), which means a shared store legitimately appears
// under both of its managers and the RM column's totals can exceed the campaign total. That is correct:
// each manager is answerable for that store.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/scope";
import { allRmStores } from "@/lib/rm-stores";
import { shortStoreName } from "@/lib/store-utils";
import { segMeta, VALUE_SEGMENTS, LIFECYCLE_SEGMENTS } from "@/lib/campaign-segments";
import { buildStyledWorkbookB64, type StyledCell } from "@/lib/xlsx-styled";

const HOUR = 3_600_000, DAY = 86_400_000;
const BEFORE_VISIT_MS = 12 * HOUR, AFTER_VISIT_MS = 24 * HOUR;
const UNASSIGNED_RM = "— No RM assigned";
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export type OptInOrigin = "VISIT" | "FARMER" | "UNREGISTERED";
export type StoreStatus = "NONE" | "BELOW" | "ABOVE" | "TOP";
export interface OptInStoreRow {
  id: number | null; name: string; code: string; region: string;
  rm: string;              // display label only — may name several managers
  rmIds: number[];         // REGIONAL User ids — the real grouping/filter key
  rmNames: string[];       // one per rmIds entry, same order
  officers: number;
  farmers: number; withMobile: number;
  opted: number;           // opt-ins attributed to this store (all time)
  optedPeriod: number;     // … in the selected period
  fromVisits: number;      // … of which came during a field visit (all time)
  rate: number;            // opt-ins per 1,000 farmers with a mobile
  visits: number;          // visits in the period
  eligibleVisits: number;  // … to farmers not already opted in
  convertedVisits: number; // … that produced an opt-in
  conv: number;            // converted ÷ eligible (%)
  hni: number; hniOpted: number;
  potential: number;       // extra opt-ins if the store matched the top-quartile rate
  lastOptIn: string | null;
  status: StoreStatus;
}
export interface OptInOfficerRow {
  key: string; name: string; code: string; store: string; region: string;
  visits: number; eligibleVisits: number; converted: number; conv: number;
  credited: number;        // opt-ins credited all time
  lastOptIn: string | null; lastVisit: string | null;
}
export interface OptInRollRow { id: number | null; label: string; stores: number; withMobile: number; opted: number; optedPeriod: number; rate: number; visits: number; eligibleVisits: number; converted: number; conv: number; zeroStores: number }
export interface OptInSegRow { key: string; label: string; color: string; total: number; opted: number }
export interface OptInListRow { mobile: string; name: string; optInAt: string; firstMessage: string; origin: OptInOrigin; farmerId: number | null; farmerName: string; store: string; officer: string; linked: boolean; messages: number }
export interface OptInAnalytics {
  periodDays: number | null; since: string; generatedAt: string;
  kpi: {
    total: number; inPeriod: number; prevPeriod: number | null;
    registered: number; unregistered: number; unlinked: number; fromVisits: number;
    farmersWithMobile: number; rate: number;
    visits: number; eligibleVisits: number; convertedVisits: number; conv: number;
    engaged: number; active30: number; replied: number;
    buyersAfter: number; salesAfter: number;
    storesTotal: number; storesZero: number; officersActive: number; officersZero: number;
  };
  benchmark: { medianRate: number; topRate: number; medianConv: number };
  daily: { date: string; visit: number; farmer: number; unregistered: number }[];
  hours: number[]; weekdays: number[];
  language: { english: number; hindi: number; other: number };
  stores: OptInStoreRow[]; officers: OptInOfficerRow[]; regions: OptInRollRow[]; rms: OptInRollRow[];
  segments: { value: OptInSegRow[]; lifecycle: OptInSegRow[] };
  campaigns: { id: number; name: string; test: number; opted: number }[];
  list: OptInListRow[];
}

async function sysadminOnly(): Promise<boolean> {
  const { role } = await getScope();
  return role === "sysadmin";
}

async function build(periodDays: number | null) {
  const now = new Date();
  const optIns = await prisma.whatsAppOptIn.findMany({ orderBy: { optInAt: "asc" } });
  const first = optIns[0]?.optInAt ?? now;
  // "All time" = since the first opt-in (≈ when the QR went live); visits before that couldn't convert.
  const since = periodDays ? new Date(now.getTime() - periodDays * DAY) : new Date(first.getTime() - DAY);
  const prevSince = periodDays ? new Date(since.getTime() - periodDays * DAY) : null;
  const inPeriod = (d: Date) => d >= since;

  const mobiles = optIns.map((o) => o.mobile);
  const [stores, farmersByMobile, users, rmStores] = await Promise.all([
    prisma.store.findMany({ select: { id: true, code: true, name: true, zone: true, regionalManager: true, status: true } }),
    mobiles.length ? prisma.farmer.findMany({ where: { mobile: { in: mobiles } }, select: { id: true, name: true, mobile: true, storeId: true, valueSegment: true, lifecycleSegment: true } }) : Promise.resolve([]),
    prisma.user.findMany({ where: { role: { in: ["ASR", "STORE_MANAGER"] }, active: true }, select: { name: true, employeeCode: true, storeId: true } }),
    allRmStores(), // multi-RM: store → managers, by user id
  ]);
  // Store → its regional managers (a store may have none, one, or several).
  const rmByStore = new Map<number, { id: number; name: string }[]>();
  for (const rm of rmStores) for (const sid of rm.storeIds) (rmByStore.get(sid) ?? rmByStore.set(sid, []).get(sid)!).push({ id: rm.userId, name: rm.name });

  const storeBy = new Map(stores.map((s) => [s.id, s]));
  const sName = (id: number | null | undefined) => (id != null ? shortStoreName(storeBy.get(id)?.name) || storeBy.get(id)?.name || "—" : "Unassigned");
  const sRegion = (id: number | null | undefined) => (id != null ? (storeBy.get(id)?.zone ?? "").trim() : "");
  const fByMobile = new Map(farmersByMobile.map((f) => [f.mobile!, f]));
  const optedFarmerIds = farmersByMobile.map((f) => f.id);

  // Visits that could explain an opt-in (to these farmers, or naming the number as their WhatsApp).
  const attribVisits = mobiles.length ? await prisma.visit.findMany({
    where: { OR: [...(optedFarmerIds.length ? [{ farmerId: { in: optedFarmerIds } }] : []), { whatsappNumber: { in: mobiles } }] },
    select: { id: true, farmerId: true, whatsappNumber: true, createdAt: true, recordedBy: true, recordedByCode: true, officerName: true, storeId: true },
  }) : [];
  const farmerMobile = new Map(farmersByMobile.map((f) => [f.id, f.mobile!]));
  const visitsByMobile = new Map<string, typeof attribVisits>();
  for (const v of attribVisits) {
    const ms = new Set([v.farmerId != null ? farmerMobile.get(v.farmerId) : undefined, v.whatsappNumber ?? undefined].filter((x): x is string => !!x));
    for (const m of ms) (visitsByMobile.get(m) ?? visitsByMobile.set(m, []).get(m)!).push(v);
  }
  const officerKey = (v: { recordedByCode: string | null; recordedBy: string | null; officerName: string | null }) => (v.recordedByCode || v.recordedBy || v.officerName || "Unknown").trim();
  const officerName = (v: { recordedBy: string | null; officerName: string | null }) => (v.recordedBy || v.officerName || "Unknown").trim();

  // Classify every opt-in.
  type Att = { o: (typeof optIns)[number]; origin: OptInOrigin; storeId: number | null; visitId: number | null; officer: string | null; officerLabel: string | null; farmer: (typeof farmersByMobile)[number] | null };
  const att: Att[] = optIns.map((o) => {
    const farmer = fByMobile.get(o.mobile) ?? null;
    const t = o.optInAt.getTime();
    const near = (visitsByMobile.get(o.mobile) ?? [])
      .filter((v) => t >= v.createdAt.getTime() - BEFORE_VISIT_MS && t <= v.createdAt.getTime() + AFTER_VISIT_MS)
      .sort((a, b) => Math.abs(a.createdAt.getTime() - t) - Math.abs(b.createdAt.getTime() - t))[0];
    if (near) return { o, origin: "VISIT", storeId: near.storeId ?? farmer?.storeId ?? null, visitId: near.id, officer: officerKey(near), officerLabel: officerName(near), farmer };
    if (farmer) return { o, origin: "FARMER", storeId: farmer.storeId, visitId: null, officer: null, officerLabel: null, farmer };
    return { o, origin: "UNREGISTERED", storeId: null, visitId: null, officer: null, officerLabel: null, farmer: null };
  });
  const optInByMobile = new Map(optIns.map((o) => [o.mobile, o.optInAt.getTime()]));
  const convertedVisitIds = new Set(att.map((a) => a.visitId).filter((x): x is number => x != null));

  // Visits in the period (conversion denominators). A visit is "eligible" unless the farmer had already opted in.
  const periodVisits = await prisma.visit.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, farmerId: true, whatsappNumber: true, createdAt: true, recordedBy: true, recordedByCode: true, officerName: true, storeId: true },
  });
  const pvFarmerIds = [...new Set(periodVisits.map((v) => v.farmerId).filter((x): x is number => x != null))];
  const pvMobile = new Map<number, string | null>();
  for (let i = 0; i < pvFarmerIds.length; i += 10000) {
    const rows = await prisma.farmer.findMany({ where: { id: { in: pvFarmerIds.slice(i, i + 10000) } }, select: { id: true, mobile: true } });
    for (const r of rows) pvMobile.set(r.id, r.mobile);
  }
  const eligible = (v: (typeof periodVisits)[number]) => {
    const ms = [v.farmerId != null ? pvMobile.get(v.farmerId) : null, v.whatsappNumber].filter((x): x is string => !!x);
    return !ms.some((m) => { const t = optInByMobile.get(m); return t != null && t < v.createdAt.getTime() - BEFORE_VISIT_MS; });
  };

  // ── Store base ──
  const [farmerG, mobileG, hniG, valueG, lifeG] = await Promise.all([
    prisma.farmer.groupBy({ by: ["storeId"], _count: { _all: true } }),
    prisma.farmer.groupBy({ by: ["storeId"], where: { mobile: { not: null } }, _count: { _all: true } }),
    prisma.farmer.groupBy({ by: ["storeId"], where: { valueSegment: "HNI" }, _count: { _all: true } }),
    prisma.farmer.groupBy({ by: ["valueSegment"], _count: { _all: true } }),
    prisma.farmer.groupBy({ by: ["lifecycleSegment"], _count: { _all: true } }),
  ]);
  const cnt = (g: { storeId: number | null; _count: { _all: number } }[]) => new Map(g.map((r) => [r.storeId, r._count._all]));
  const farmersBy = cnt(farmerG), mobileBy = cnt(mobileG), hniBy = cnt(hniG);
  const officersBy = new Map<number, number>();
  for (const u of users) if (u.storeId != null) officersBy.set(u.storeId, (officersBy.get(u.storeId) ?? 0) + 1);

  type Acc = { opted: number; optedPeriod: number; fromVisits: number; visits: number; eligible: number; converted: number; hniOpted: number; last: Date | null };
  const blank = (): Acc => ({ opted: 0, optedPeriod: 0, fromVisits: 0, visits: 0, eligible: 0, converted: 0, hniOpted: 0, last: null });
  const sAcc = new Map<number | null, Acc>();
  const getS = (id: number | null) => sAcc.get(id) ?? sAcc.set(id, blank()).get(id)!;
  for (const a of att) {
    const s = getS(a.storeId);
    s.opted++; if (inPeriod(a.o.optInAt)) s.optedPeriod++;
    if (a.origin === "VISIT") s.fromVisits++;
    if (a.farmer?.valueSegment === "HNI") s.hniOpted++;
    if (!s.last || a.o.optInAt > s.last) s.last = a.o.optInAt;
  }
  // Officer accumulators.
  type OAcc = { name: string; code: string; stores: Map<number | null, number>; visits: number; eligible: number; converted: number; credited: number; lastOptIn: Date | null; lastVisit: Date | null };
  const oAcc = new Map<string, OAcc>();
  const getO = (key: string, name: string, code: string) => oAcc.get(key) ?? oAcc.set(key, { name, code, stores: new Map(), visits: 0, eligible: 0, converted: 0, credited: 0, lastOptIn: null, lastVisit: null }).get(key)!;
  for (const v of periodVisits) {
    const s = getS(v.storeId);
    const el = eligible(v), conv = convertedVisitIds.has(v.id);
    s.visits++; if (el) s.eligible++; if (conv) s.converted++;
    const o = getO(officerKey(v), officerName(v), v.recordedByCode ?? "");
    o.visits++; if (el) o.eligible++; if (conv) o.converted++;
    o.stores.set(v.storeId, (o.stores.get(v.storeId) ?? 0) + 1);
    if (!o.lastVisit || v.createdAt > o.lastVisit) o.lastVisit = v.createdAt;
  }
  for (const a of att) {
    if (a.origin !== "VISIT" || !a.officer) continue;
    const o = getO(a.officer, a.officerLabel ?? a.officer, /^[A-Z]{1,4}\d/i.test(a.officer) ? a.officer : "");
    o.credited++;
    if (a.storeId != null && !o.stores.size) o.stores.set(a.storeId, 1);
    if (!o.lastOptIn || a.o.optInAt > o.lastOptIn) o.lastOptIn = a.o.optInAt;
  }

  const pct = (x: number, t: number) => (t > 0 ? Math.round((x / t) * 1000) / 10 : 0);
  const per1k = (x: number, t: number) => (t > 0 ? Math.round((x / t) * 10000) / 10 : 0);
  const quant = (xs: number[], q: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
  const activeStores = stores.filter((s) => (s.status ?? "").toUpperCase() !== "INACTIVE" && (mobileBy.get(s.id) ?? 0) > 0);
  const rates = activeStores.map((s) => per1k(sAcc.get(s.id)?.opted ?? 0, mobileBy.get(s.id) ?? 0));
  const medianRate = quant(rates, 0.5), topRate = quant(rates, 0.75);
  const convs = activeStores.map((s) => { const a = sAcc.get(s.id); return a && a.eligible >= 10 ? pct(a.converted, a.eligible) : null; }).filter((x): x is number => x != null);
  const medianConv = quant(convs, 0.5);

  const storeRows: OptInStoreRow[] = activeStores.map((s): OptInStoreRow => {
    const a = sAcc.get(s.id) ?? blank();
    const withMobile = mobileBy.get(s.id) ?? 0;
    const rate = per1k(a.opted, withMobile);
    const managers = rmByStore.get(s.id) ?? [];
    return {
      id: s.id, name: shortStoreName(s.name) || s.name, code: s.code, region: (s.zone ?? "").trim(),
      // Prefer the linked accounts; fall back to the legacy label for a store imported with a name but no account.
      rm: managers.length ? managers.map((m) => m.name).join(", ") : (s.regionalManager ?? "").trim(),
      rmIds: managers.map((m) => m.id), rmNames: managers.map((m) => m.name),
      officers: officersBy.get(s.id) ?? 0,
      farmers: farmersBy.get(s.id) ?? 0, withMobile, opted: a.opted, optedPeriod: a.optedPeriod, fromVisits: a.fromVisits, rate,
      visits: a.visits, eligibleVisits: a.eligible, convertedVisits: a.converted, conv: pct(a.converted, a.eligible),
      hni: hniBy.get(s.id) ?? 0, hniOpted: a.hniOpted,
      potential: Math.max(0, Math.round((withMobile * topRate) / 1000) - a.opted),
      lastOptIn: a.last ? a.last.toISOString() : null,
      status: a.opted === 0 ? "NONE" : rate >= topRate ? "TOP" : rate >= medianRate ? "ABOVE" : "BELOW",
    };
  }).sort((x, y) => y.potential - x.potential || y.withMobile - x.withMobile);

  const officerRows: OptInOfficerRow[] = [...oAcc.entries()].map(([key, o]) => {
    const topStore = [...o.stores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      key, name: o.name, code: o.code, store: sName(topStore), region: sRegion(topStore),
      visits: o.visits, eligibleVisits: o.eligible, converted: o.converted, conv: pct(o.converted, o.eligible), credited: o.credited,
      lastOptIn: o.lastOptIn ? o.lastOptIn.toISOString() : null, lastVisit: o.lastVisit ? o.lastVisit.toISOString() : null,
    };
  }).sort((a, b) => b.visits - a.visits || b.credited - a.credited);

  /**
   * Roll stores up into buckets. `keysOf` returns EVERY bucket a store belongs to, because a Verde store
   * with two regional managers must count under both — returning a single key would hide it from one of
   * them (or invent a combined "A, B" row that is nobody's responsibility).
   */
  const roll = (keysOf: (r: OptInStoreRow) => { id: number | null; label: string }[]): OptInRollRow[] => {
    const m = new Map<string, OptInRollRow>();
    for (const r of storeRows) {
      for (const { id, label } of keysOf(r)) {
        const k = `${id ?? ""}|${label}`;
        const x = m.get(k) ?? m.set(k, { id, label, stores: 0, withMobile: 0, opted: 0, optedPeriod: 0, rate: 0, visits: 0, eligibleVisits: 0, converted: 0, conv: 0, zeroStores: 0 }).get(k)!;
        x.stores++; x.withMobile += r.withMobile; x.opted += r.opted; x.optedPeriod += r.optedPeriod; x.visits += r.visits; x.eligibleVisits += r.eligibleVisits; x.converted += r.convertedVisits;
        if (r.opted === 0) x.zeroStores++;
      }
    }
    return [...m.values()].map((x) => ({ ...x, rate: per1k(x.opted, x.withMobile), conv: pct(x.converted, x.eligibleVisits) })).sort((a, b) => a.rate - b.rate || b.withMobile - a.withMobile);
  };

  // Daily trend (IST), hour-of-day and weekday (period).
  const periodAtt = att.filter((a) => inPeriod(a.o.optInAt));
  const dayMap = new Map<string, { visit: number; farmer: number; unregistered: number }>();
  for (let d = new Date(Math.max(since.getTime(), first.getTime() - DAY)); d <= now; d = new Date(d.getTime() + DAY)) dayMap.set(istDay(d), { visit: 0, farmer: 0, unregistered: 0 });
  const hours = new Array<number>(24).fill(0), weekdays = new Array<number>(7).fill(0);
  for (const a of periodAtt) {
    const k = istDay(a.o.optInAt);
    const e = dayMap.get(k) ?? dayMap.set(k, { visit: 0, farmer: 0, unregistered: 0 }).get(k)!;
    if (a.origin === "VISIT") e.visit++; else if (a.origin === "FARMER") e.farmer++; else e.unregistered++;
    const ist = new Date(a.o.optInAt.getTime() + 330 * 60_000);
    hours[ist.getUTCHours()]++; weekdays[(ist.getUTCDay() + 6) % 7]++; // Mon = 0
  }
  const daily = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));

  const language = { english: 0, hindi: 0, other: 0 };
  for (const a of periodAtt) {
    const t = a.o.firstMessage ?? "";
    if (/[ऀ-ॿ]/.test(t)) language.hindi++; else if (/Verde Agrotech|product updates/i.test(t)) language.english++; else language.other++;
  }

  // Segment coverage: share of each value / lifecycle segment that has opted in.
  const optedFarmers = att.map((a) => a.farmer).filter((f): f is NonNullable<typeof f> => !!f);
  const segRows = (keys: readonly string[], g: { key: string | null; n: number }[], pick: (f: (typeof optedFarmers)[number]) => string | null): OptInSegRow[] =>
    keys.map((k) => { const m = segMeta(k); return { key: k, label: m.label, color: m.color, total: g.find((x) => x.key === k)?.n ?? 0, opted: optedFarmers.filter((f) => pick(f) === k).length }; });
  const segments = {
    value: segRows(VALUE_SEGMENTS, valueG.map((r) => ({ key: r.valueSegment, n: r._count._all })), (f) => f.valueSegment),
    lifecycle: segRows(LIFECYCLE_SEGMENTS, lifeG.map((r) => ({ key: r.lifecycleSegment, n: r._count._all })), (f) => f.lifecycleSegment),
  };

  // Purchases after opting in (registered farmers) — is the opted-in base buying?
  const optAt = new Map(att.filter((a) => a.farmer).map((a) => [a.farmer!.id, a.o.optInAt]));
  const lines = optAt.size ? await prisma.saleLine.findMany({ where: { farmerId: { in: [...optAt.keys()] }, source: "REAL", soldAt: { gte: first } }, select: { farmerId: true, soldAt: true, basic: true } }) : [];
  const buyers = new Set<number>(); let salesAfter = 0;
  for (const l of lines) { const t = l.farmerId != null ? optAt.get(l.farmerId) : undefined; if (t && l.soldAt && l.soldAt >= t) { buyers.add(l.farmerId!); salesAfter += l.basic ?? 0; } }

  // Engagement + replies.
  const replied = (await prisma.whatsAppMessage.groupBy({ by: ["mobile"], where: { direction: "OUT" } })).length;
  const active30 = optIns.filter((o) => o.lastInboundAt && o.lastInboundAt.getTime() > now.getTime() - 30 * DAY).length;

  // Active campaigns: how much of each TEST group is reachable on WhatsApp.
  const [camps, testG, optG] = await Promise.all([
    prisma.campaign.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.campaignMember.groupBy({ by: ["campaignId"], where: { group: "TEST", campaign: { status: "ACTIVE" } }, _count: { _all: true } }),
    optedFarmerIds.length ? prisma.campaignMember.groupBy({ by: ["campaignId"], where: { group: "TEST", campaign: { status: "ACTIVE" }, farmerId: { in: optedFarmerIds } }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  const optByC = new Map(optG.map((r) => [r.campaignId, r._count._all]));
  const campaigns = camps.map((c) => ({ id: c.id, name: c.name, test: testG.find((g) => g.campaignId === c.id)?._count._all ?? 0, opted: optByC.get(c.id) ?? 0 })).filter((c) => c.test > 0).sort((a, b) => b.test - a.test);

  const list: OptInListRow[] = [...att].reverse().map((a) => ({
    mobile: a.o.mobile, name: a.o.name ?? "", optInAt: a.o.optInAt.toISOString(), firstMessage: a.o.firstMessage ?? "", origin: a.origin,
    farmerId: a.farmer?.id ?? null, farmerName: a.farmer?.name ?? "", store: a.storeId != null ? sName(a.storeId) : "", officer: a.officerLabel ?? "",
    linked: a.o.farmerId != null, messages: a.o.messageCount,
  }));

  const totalVisits = periodVisits.length, eligibleVisits = periodVisits.filter(eligible).length, convertedVisits = periodVisits.filter((v) => convertedVisitIds.has(v.id)).length;
  const farmersWithMobile = activeStores.reduce((s, x) => s + (mobileBy.get(x.id) ?? 0), 0);
  const officersActive = officerRows.filter((o) => o.visits > 0).length;
  const data: OptInAnalytics = {
    periodDays, since: istDay(since), generatedAt: now.toISOString(),
    kpi: {
      total: optIns.length, inPeriod: periodAtt.length,
      prevPeriod: prevSince ? att.filter((a) => a.o.optInAt >= prevSince && a.o.optInAt < since).length : null,
      registered: att.filter((a) => a.farmer).length, unregistered: att.filter((a) => !a.farmer).length,
      unlinked: att.filter((a) => a.farmer && a.o.farmerId == null).length, fromVisits: att.filter((a) => a.origin === "VISIT").length,
      farmersWithMobile, rate: per1k(att.filter((a) => a.farmer).length, farmersWithMobile),
      visits: totalVisits, eligibleVisits, convertedVisits, conv: pct(convertedVisits, eligibleVisits),
      engaged: optIns.filter((o) => o.messageCount > 1).length, active30, replied,
      buyersAfter: buyers.size, salesAfter: Math.round(salesAfter),
      storesTotal: storeRows.length, storesZero: storeRows.filter((s) => s.opted === 0).length,
      officersActive, officersZero: officerRows.filter((o) => o.visits >= 5 && o.credited === 0).length,
    },
    benchmark: { medianRate, topRate, medianConv },
    daily, hours, weekdays, language,
    stores: storeRows, officers: officerRows,
    regions: roll((r) => [{ id: null, label: r.region || "—" }]),
    // One row per MANAGER (never per comma-joined label): a store with two RMs counts under both.
    rms: roll((r) => (r.rmIds.length ? r.rmIds.map((id, i) => ({ id, label: r.rmNames[i] })) : [{ id: null, label: r.rm || UNASSIGNED_RM }])),
    segments, campaigns, list,
  };
  return { data, att };
}

/** Opt-in analysis for the WhatsApp page. `periodDays` = 7 / 30 / 90, or null for all time. */
export async function getOptInAnalytics(periodDays: number | null): Promise<OptInAnalytics | null> {
  if (!(await sysadminOnly())) return null;
  const p = periodDays && [7, 30, 90].includes(periodDays) ? periodDays : null;
  return (await build(p)).data;
}

/** Link opt-ins whose number now matches a farmer (registered after they messaged) — sets the farmer's opt-in flag. */
export async function linkUnmatchedOptIns(): Promise<{ ok: boolean; linked?: number; error?: string }> {
  if (!(await sysadminOnly())) return { ok: false, error: "System Admin only." };
  const unlinked = await prisma.whatsAppOptIn.findMany({ where: { farmerId: null }, select: { id: true, mobile: true, optInAt: true } });
  if (!unlinked.length) return { ok: true, linked: 0 };
  const farmers = await prisma.farmer.findMany({ where: { mobile: { in: unlinked.map((u) => u.mobile) } }, select: { id: true, mobile: true } });
  const byMobile = new Map(farmers.map((f) => [f.mobile!, f.id]));
  let linked = 0;
  for (const u of unlinked) {
    const fid = byMobile.get(u.mobile);
    if (!fid) continue;
    await prisma.$transaction([
      prisma.whatsAppOptIn.update({ where: { id: u.id }, data: { farmerId: fid } }),
      prisma.farmer.updateMany({ where: { id: fid, whatsappOptIn: false }, data: { whatsappOptIn: true, whatsappOptInAt: u.optInAt } }),
    ]);
    linked++;
  }
  revalidatePath("/whatsapp");
  return { ok: true, linked };
}

/** Excel: stores, regions, RMs, officers and every opt-in with its attribution. */
export async function exportOptInAnalyticsXlsx(periodDays: number | null): Promise<{ ok: boolean; filename?: string; b64?: string; error?: string }> {
  if (!(await sysadminOnly())) return { ok: false, error: "System Admin only." };
  const p = periodDays && [7, 30, 90].includes(periodDays) ? periodDays : null;
  const { data: d } = await build(p);
  const per = p ? `last ${p} days` : "since the first opt-in";
  const STATUS: Record<StoreStatus, string> = { NONE: "No opt-ins yet", BELOW: "Below median", ABOVE: "Above median", TOP: "Top 25%" };
  const ORIGIN: Record<OptInOrigin, string> = { VISIT: "During a field visit", FARMER: "Registered farmer (not during a visit)", UNREGISTERED: "Not a registered farmer" };
  const ts = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ") : "");
  const storeSheet: StyledCell[][] = [
    ["Store", "Code", "Region", "RM", "Officers", "Farmers", "Farmers with mobile", "Opt-ins (all time)", `Opt-ins (${per})`, "Opt-ins during visits", "Opt-ins per 1,000 farmers with mobile",
      `Visits (${per})`, "Visits to farmers not yet opted in", "Visits that produced an opt-in", "Visit → opt-in conversion %", "HNI farmers", "HNI opted in",
      `Potential (extra opt-ins at the top-quartile rate of ${d.benchmark.topRate} per 1,000)`, "Last opt-in (IST)", "Status"],
    ...d.stores.map((s) => [s.name, s.code, s.region, s.rm, s.officers, s.farmers, s.withMobile, s.opted, s.optedPeriod, s.fromVisits, s.rate, s.visits, s.eligibleVisits, s.convertedVisits, s.conv, s.hni, s.hniOpted, s.potential, ts(s.lastOptIn), STATUS[s.status]]),
  ];
  const rollSheet = (first: string, rows: OptInRollRow[]): StyledCell[][] => [
    [first, "Stores", "Stores with no opt-ins", "Farmers with mobile", "Opt-ins (all time)", `Opt-ins (${per})`, "Opt-ins per 1,000 farmers with mobile", `Visits (${per})`, "Eligible visits", "Visits that produced an opt-in", "Conversion %"],
    ...rows.map((r) => [r.label, r.stores, r.zeroStores, r.withMobile, r.opted, r.optedPeriod, r.rate, r.visits, r.eligibleVisits, r.converted, r.conv]),
  ];
  const officerSheet: StyledCell[][] = [
    ["Officer", "Code", "Main store", "Region", `Visits (${per})`, "Visits to farmers not yet opted in", "Visits that produced an opt-in", "Conversion %", "Opt-ins credited (all time)", "Last opt-in (IST)", "Last visit (IST)"],
    ...d.officers.map((o) => [o.name, o.code, o.store, o.region, o.visits, o.eligibleVisits, o.converted, o.conv, o.credited, ts(o.lastOptIn), ts(o.lastVisit)]),
  ];
  const listSheet: StyledCell[][] = [
    ["Mobile", "WhatsApp name", "Opted in (IST)", "How", "Farmer", "Store", "Officer (visit)", "Linked to farmer record", "Messages", "First message"],
    ...d.list.map((r) => [r.mobile, r.name, ts(r.optInAt), ORIGIN[r.origin], r.farmerName, r.store, r.officer, r.farmerId == null ? "No farmer" : r.linked ? "Yes" : "Not yet (matches by mobile)", r.messages, r.firstMessage]),
  ];
  const b64 = await buildStyledWorkbookB64([
    { name: "Stores", rows: storeSheet, leftCols: [0, 1, 2, 3, 18, 19], wrapHeaders: true },
    { name: "Regions", rows: rollSheet("Region", d.regions), leftCols: [0], wrapHeaders: true },
    // A store with several RMs is counted under each of them, so this sheet's totals exceed the Stores sheet.
    { name: "RMs", rows: rollSheet("RM (a shared store counts under each)", d.rms), leftCols: [0], wrapHeaders: true },
    { name: "Officers", rows: officerSheet, leftCols: [0, 1, 2, 3, 9, 10], wrapHeaders: true },
    { name: "Opt-ins", rows: listSheet, leftCols: [0, 1, 2, 3, 4, 5, 6, 7], wrapCols: [9], wrapHeaders: true },
  ]);
  return { ok: true, filename: `whatsapp-optin-analysis-${new Date().toISOString().slice(0, 10)}.xlsx`, b64 };
}
