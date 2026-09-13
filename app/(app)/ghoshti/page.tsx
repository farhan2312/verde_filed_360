import { getRole } from "@/lib/session";
import { listGhoshtis, getGhoshtiStoreOptions } from "@/app/actions/ghoshti";
import { GhoshtiScreen } from "@/components/ghoshti/GhoshtiScreen";

export const dynamic = "force-dynamic";

export default async function GhoshtiPage() {
  const [role, initial, storeOpts] = await Promise.all([
    getRole(),
    listGhoshtis(),
    getGhoshtiStoreOptions(),
  ]);
  return <GhoshtiScreen initial={initial} role={role} storeOptions={storeOpts} />;
}
