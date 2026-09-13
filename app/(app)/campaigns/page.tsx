import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { canManage } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { listCampaigns, listProjects, getCropOptions, type CampaignListItem, type ProjectVM } from "@/app/actions/campaigns";
import { listTemplates } from "@/app/actions/whatsapp-templates";
import type { CropOption } from "@/components/campaigns/CampaignsScreen";
import { DEFAULT_COMM_TEMPLATES } from "@/lib/campaign-segments";
import { CampaignsScreen, type CommTemplateVM, type StoreLite, type TemplateVarHint } from "@/components/campaigns/CampaignsScreen";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams?: { forProject?: string } }) {
  const role = await getRole();
  if (!canAccess("campaigns", role)) notFound();
  const manage = canManage(role);

  // Chain: /campaigns?forProject=<id> opens the create form with that project preselected.
  const forProject = Number(searchParams?.forProject);
  const initialProjectId = manage && Number.isInteger(forProject) && forProject > 0 ? forProject : undefined;

  let templates: CommTemplateVM[] = [];
  let campaigns: CampaignListItem[] = [];
  let stores: StoreLite[] = [];
  let projects: ProjectVM[] = [];
  let crops: CropOption[] = [];
  let templateVars: TemplateVarHint[] = [];
  try {
    if ((await prisma.commTemplate.count()) === 0) {
      await prisma.commTemplate.createMany({ data: DEFAULT_COMM_TEMPLATES, skipDuplicates: true });
    }
    const [tpls, camps, sts, projs, crps] = await Promise.all([
      prisma.commTemplate.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] }),
      listCampaigns(),
      prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      manage ? listProjects() : Promise.resolve<ProjectVM[]>([]), // project catalog is central-only; don't leak it to officers/RMs
      getCropOptions(), // crop list for the outreach "wants another crop" dropdown
    ]);
    crops = crps;
    templates = tpls.map((t) => ({
      id: t.id, name: t.name, language: t.language, promoType: t.promoType,
      segment: t.segment, segments: t.segments.length ? t.segments : [t.segment], priority: t.priority, medium: t.medium,
      offer: t.offer, timingLabel: t.timingLabel, template: t.template, dltTemplateId: t.dltTemplateId,
      waTemplateName: t.waTemplateName, waLanguage: t.waLanguage, waVariables: t.waVariables, smsVariables: t.smsVariables,
    }));
    campaigns = camps;
    stores = sts;
    projects = projs;
  } catch {
    // DB unavailable — render an empty shell.
  }

  // Approved-template variable names → let the comm-plan editor label each {{n}} slot. Admin-only and
  // best-effort: a slow/failed Meta API call must never block the campaigns page.
  if (manage) {
    try {
      const t = await listTemplates();
      if (t.ok && t.templates) {
        templateVars = t.templates
          .filter((x) => x.status === "APPROVED")
          .map((x) => ({ name: x.name, language: x.language, labels: x.varLabels ?? [] }));
      }
    } catch { /* ignore — no hints */ }
  }

  return (
    <CampaignsScreen
      templates={templates}
      campaigns={campaigns}
      stores={stores}
      projects={projects}
      canManage={manage}
      initialProjectId={initialProjectId}
      crops={crops}
      templateVars={templateVars}
    />
  );
}
