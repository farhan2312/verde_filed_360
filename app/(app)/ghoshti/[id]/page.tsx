import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { getGhoshti } from "@/app/actions/ghoshti";
import { GhoshtiDetail } from "@/components/ghoshti/GhoshtiDetail";

export const dynamic = "force-dynamic";

export default async function GhoshtiDetailPage({ params }: { params: { id: string } }) {
  const id = Number.parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();
  const [role, g] = await Promise.all([getRole(), getGhoshti(id)]);
  if (!g) notFound();
  return <GhoshtiDetail initial={g} role={role} />;
}
