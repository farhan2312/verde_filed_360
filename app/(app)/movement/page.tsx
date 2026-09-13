import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { canAccess } from "@/lib/roles";
import { getMovementOverview, getMovers, getStoreLeaderboard, type MovementOverview, type MoverRow, type DeadRow, type StoreRow } from "@/app/actions/movement";
import { MovementDashboard } from "@/components/movement/MovementDashboard";

export const dynamic = "force-dynamic";

export default async function MovementPage() {
  const role = await getRole();
  if (!canAccess("movement", role)) notFound();

  let overview: MovementOverview = { asof: null, kpis: { units: 0, rev: 0, products: 0, bills: 0, stores: 0 }, trend: [], categories: [] };
  let movers: { fast: MoverRow[]; dead: DeadRow[] } = { fast: [], dead: [] };
  let stores: StoreRow[] = [];
  try {
    [overview, movers, stores] = await Promise.all([getMovementOverview(), getMovers(), getStoreLeaderboard()]);
  } catch {
    // DB unavailable — render empty shell.
  }

  return <MovementDashboard overview={overview} movers={movers} stores={stores} />;
}
