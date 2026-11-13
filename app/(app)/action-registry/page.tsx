import { getRole } from "@/lib/session";
import { getScope, storeScopeWhere } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { listActions } from "@/app/actions/action-registry";
import { ActionRegistry } from "@/components/actions/ActionRegistry";
import { shortStoreName } from "@/lib/store-utils";

export const dynamic = "force-dynamic";

export default async function ActionRegistryPage({ searchParams }: { searchParams?: { store?: string } }) {
  const [role, scope, actions] = await Promise.all([getRole(), getScope(), listActions()]);
  const sw = storeScopeWhere(scope);
  const storeRows =
    sw === "none"
      ? []
      : await prisma.store.findMany({
          where: sw ?? undefined,
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        });
  const stores = storeRows.map((s) => ({ id: s.id, name: shortStoreName(s.name) || s.name }));
  // ?store=<code> pre-filters to that store - only if it's one the viewer can see.
  const want = searchParams?.store?.trim().toUpperCase();
  const initialStoreId = want ? storeRows.find((s) => s.code.toUpperCase() === want)?.id ?? null : null;

  return (
    <ActionRegistry
      initial={actions}
      role={role}
      myStoreId={scope.storeId}
      stores={stores}
      initialStoreId={initialStoreId}
    />
  );
}
