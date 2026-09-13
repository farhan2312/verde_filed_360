import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { listCampaigns, getCampaignMembers, getCropOptions } from "@/app/actions/campaigns";
import { OutreachMatrix } from "@/components/campaigns/OutreachMatrix";
import type { CommTemplateVM } from "@/components/campaigns/CampaignsScreen";

export const dynamic = "force-dynamic";

/** Full-page outreach matrix for one campaign — every farmer on a single line. */
export default async function OutreachMatrixPage({ params }: { params: { id: string } }) {
  const role = await getRole();
  if (!canAccess("campaigns", role)) notFound();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // listCampaigns is role-scoped (officer→store, RM→zone) — an out-of-scope campaign 404s.
  const camps = await listCampaigns();
  const campaign = camps.find((c) => c.id === id);
  if (!campaign) notFound();

  const [members, crops] = await Promise.all([
    getCampaignMembers(id), // scoped, TEST group only
    getCropOptions(), // crop list for the "wants another crop" dropdown
  ]);

  // The comm-plan scripts tagged to this campaign (by name) — the outreach left panel.
  let scripts: CommTemplateVM[] = [];
  if (campaign.commPlans.length > 0) {
    const rows = await prisma.commTemplate.findMany({
      where: { name: { in: campaign.commPlans } },
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    });
    scripts = rows.map((t) => ({
      id: t.id, name: t.name, language: t.language, promoType: t.promoType,
      segment: t.segment, segments: t.segments.length ? t.segments : [t.segment], priority: t.priority, medium: t.medium,
      offer: t.offer, timingLabel: t.timingLabel, template: t.template, dltTemplateId: t.dltTemplateId,
    }));
  }

  return <OutreachMatrix campaign={campaign} initial={members} scripts={scripts} crops={crops} />;
}
