import { prisma } from "@/lib/prisma";
import { parseCriteria, scopedCriteriaWhere, type ClusterCriteria } from "@/lib/cluster-rules";
import { segMeta } from "@/lib/campaign-segments";
import { cropLabel } from "@/lib/crops";
import { tagLabel } from "@/lib/crop-pest";
import { shortStoreName } from "@/lib/store-utils";

/* ─────────────────────── Clusters a farmer belongs to ─────────────────────── */

export interface FarmerClusterVM {
  id: number; name: string; description: string; mode: string;
  attributes: { label: string; value: string }[]; // the cluster's defining criteria
}

const kInr = (n: number) => (n >= 1000 ? `₹${(n / 1000).toLocaleString("en-IN")}K` : `₹${n}`);

/** Which clusters does this farmer belong to? Dynamic clusters resolve their rule live; static use the frozen id set. */
export async function getFarmerClusters(farmerId: number): Promise<FarmerClusterVM[]> {
  const clusters = await prisma.cluster.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, description: true, criteria: true, mode: true, farmerIds: true },
  });
  if (!clusters.length) return [];

  // Membership: static → frozen id list; dynamic → live match of the criteria against this farmer id.
  const matched: { c: (typeof clusters)[number]; crit: ClusterCriteria | null }[] = [];
  for (const c of clusters) {
    const crit = parseCriteria(c.criteria);
    if (c.mode === "dynamic" && crit) {
      const hit = await prisma.farmer.count({ where: { AND: [scopedCriteriaWhere(crit), { id: farmerId }] } });
      if (hit > 0) matched.push({ c, crit });
    } else if (c.farmerIds.includes(farmerId)) {
      matched.push({ c, crit });
    }
  }
  if (!matched.length) return [];

  // Resolve any store ids referenced by the matched clusters' criteria in one query.
  const storeIds = [...new Set(matched.flatMap((m) => m.crit?.storeIds ?? []))];
  const storeName = new Map(
    (storeIds.length ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : [])
      .map((s) => [s.id, shortStoreName(s.name) || s.name]),
  );

  const attrsOf = (crit: ClusterCriteria | null): { label: string; value: string }[] => {
    if (!crit) return [];
    const a: { label: string; value: string }[] = [];
    if (crit.storeIds?.length) a.push({ label: "Stores", value: crit.storeIds.map((id) => storeName.get(id) ?? `#${id}`).join(", ") });
    if (crit.zones?.length) a.push({ label: "Regions", value: crit.zones.join(", ") });
    else if (crit.zone) a.push({ label: "Region", value: crit.zone });
    if (crit.villages?.length) a.push({ label: "Villages", value: crit.villages.join(", ") });
    if (crit.valueSegments?.length) a.push({ label: "Value tier", value: crit.valueSegments.map((s) => segMeta(s).label).join(", ") });
    if (crit.lifecycleSegments?.length) a.push({ label: "Lifecycle", value: crit.lifecycleSegments.map((s) => segMeta(s).label).join(", ") });
    if (crit.campaignSegments?.length) a.push({ label: "Segment", value: crit.campaignSegments.map((s) => segMeta(s).label).join(", ") });
    const crops = [...new Set([...(crit.cropTags ?? []), ...(crit.salesCrops ?? []), ...(crit.visitCrops ?? []), ...(crit.crop ? [crit.crop] : [])])];
    if (crops.length) a.push({ label: "Crops", value: crops.map(cropLabel).join(", ") });
    if (crit.pestTags?.length) a.push({ label: "Pests", value: crit.pestTags.map(tagLabel).join(", ") });
    if (crit.spendMin != null || crit.spendMax != null) a.push({ label: "12-mo spend", value: `${crit.spendMin != null ? kInr(crit.spendMin) : "₹0"} – ${crit.spendMax != null ? kInr(crit.spendMax) : "any"}` });
    if (crit.leadStatus) a.push({ label: "Lead status", value: crit.leadStatus });
    if (crit.category) a.push({ label: "Category", value: crit.category });
    if (crit.whatsappOptIn) a.push({ label: "WhatsApp", value: "Opted in" });
    return a;
  };

  return matched.map(({ c, crit }) => ({
    id: c.id, name: c.name, description: c.description ?? "", mode: c.mode,
    attributes: attrsOf(crit),
  }));
}

/* ─────────────────────── Campaign contact timeline ─────────────────────── */

export interface ContactEvent {
  at: string;        // ISO
  kind: string;      // SMS | WhatsApp | Call | In-person | Unreachable | Outreach
  detail: string;    // message text / response + comment
  status: string;    // delivery status / outcome
  by: string;        // the Verde Agrotech employee who did/recorded it
  campaign: string;  // campaign name (or "—")
}

const trunc = (s: string | null, n = 160) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const MED: Record<string, string> = { CALL: "Call", WHATSAPP: "WhatsApp", SMS: "SMS", IN_PERSON: "In-person", UNREACHABLE: "Unreachable" };
const RESP: Record<string, string> = { INTERESTED: "Interested", NOT_INTERESTED: "Not interested", OTHER_CROP: "Other crop" };

/** Merged, time-sorted log of every campaign contact for a farmer: SMS + WhatsApp sends + call/in-person marks. */
export async function getFarmerContactTimeline(farmerId: number, limit = 120): Promise<ContactEvent[]> {
  const [sms, wa, members] = await Promise.all([
    prisma.smsLog.findMany({ where: { farmerId }, orderBy: { createdAt: "desc" }, take: 200, select: { createdAt: true, message: true, status: true, deliveryStatus: true, ok: true, sentByName: true, sentByCode: true, campaignId: true } }),
    prisma.whatsAppLog.findMany({ where: { farmerId }, orderBy: { createdAt: "desc" }, take: 200, select: { createdAt: true, message: true, status: true, ok: true, sentByName: true, sentByCode: true, campaignId: true, kind: true } }),
    prisma.campaignMember.findMany({ where: { farmerId, reachedAt: { not: null } }, select: { reachedAt: true, mediums: true, response: true, responseCrop: true, comment: true, reachedBy: true, reachedByCode: true, campaignId: true } }),
  ]);

  const campIds = [...new Set([...sms.map((s) => s.campaignId), ...wa.map((w) => w.campaignId), ...members.map((m) => m.campaignId)].filter((x): x is number => x != null))];
  const campName = new Map((campIds.length ? await prisma.campaign.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]));
  const who = (n: string | null, c: string | null) => (n ? `${n}${c ? ` (${c})` : ""}` : "");

  const events: ContactEvent[] = [];
  for (const s of sms) events.push({ at: s.createdAt.toISOString(), kind: "SMS", detail: trunc(s.message), status: s.deliveryStatus || s.status || (s.ok ? "Sent" : "Failed"), by: who(s.sentByName, s.sentByCode), campaign: s.campaignId != null ? campName.get(s.campaignId) ?? "—" : "—" });
  for (const w of wa) events.push({ at: w.createdAt.toISOString(), kind: "WhatsApp", detail: trunc(w.message), status: w.status || (w.ok ? "Sent" : "Failed"), by: who(w.sentByName, w.sentByCode), campaign: w.campaignId != null ? campName.get(w.campaignId) ?? "—" : "—" });
  for (const m of members) {
    // SMS/WA marks are already covered by the logs above — only surface the non-message channels here.
    const meds = (m.mediums ?? []).filter((x) => x === "CALL" || x === "IN_PERSON" || x === "UNREACHABLE");
    const hasResp = !!m.response;
    if (!meds.length && !hasResp && !m.comment) continue;
    const kind = meds.length ? meds.map((x) => MED[x] ?? x).join(" + ") : "Outreach";
    const bits = [m.response ? RESP[m.response] ?? m.response : "", m.response === "OTHER_CROP" && m.responseCrop ? `(${cropLabel(m.responseCrop)})` : "", m.comment ?? ""].filter(Boolean);
    events.push({ at: (m.reachedAt as Date).toISOString(), kind, detail: trunc(bits.join(" · ")), status: meds.includes("UNREACHABLE") ? "Unreachable" : hasResp || meds.length ? "Reached" : "", by: who(m.reachedBy, m.reachedByCode), campaign: m.campaignId != null ? campName.get(m.campaignId) ?? "—" : "—" });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events.slice(0, limit);
}
