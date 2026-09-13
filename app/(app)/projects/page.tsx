import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { listProjects, listClustersWithCounts, type ProjectVM, type ClusterVM } from "@/app/actions/campaigns";
import { ProjectsTab } from "@/components/campaigns/ProjectsTab";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams?: { withCluster?: string } }) {
  const role = await getRole();
  if (!canAccess("projects", role)) notFound();

  // Chain: /projects?withCluster=<id> opens the builder with that cluster pre-ticked.
  const withCluster = Number(searchParams?.withCluster);
  const initialClusterId = Number.isInteger(withCluster) && withCluster > 0 ? withCluster : undefined;

  let projects: ProjectVM[] = [];
  let clusters: ClusterVM[] = [];
  try {
    [projects, clusters] = await Promise.all([listProjects(), listClustersWithCounts()]);
  } catch {
    // DB unavailable — render an empty shell.
  }

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <ProjectsTab initial={projects} clusters={clusters} initialClusterId={initialClusterId} />
    </div>
  );
}
