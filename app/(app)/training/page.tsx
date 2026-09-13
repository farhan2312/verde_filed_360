import { getRole } from "@/lib/session";
import { TrainingCenter } from "@/components/training/TrainingCenter";
import { TRAINING, type ViewerRole } from "@/lib/training";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const role = (await getRole()) as ViewerRole; // officer | regional | central | sysadmin
  return <TrainingCenter role={role} topics={TRAINING} />;
}
