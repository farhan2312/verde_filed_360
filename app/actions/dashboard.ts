"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/** Shape of the editable KPI values held in Setting key "kpi.data". */
export interface KpiData {
  visits: string;
  farmers: string;
  convRate: string;
  followups: string;
}

/**
 * Persist the sysadmin-editable KPI card values into Setting key "kpi.data".
 * Mirrors the original `saveEditModal` for the `kpi` edit type, which writes
 * back to `state.kpiData` (visits / farmers / convRate / followups).
 */
export async function saveKpiAction(input: KpiData) {
  const data: KpiData = {
    visits: input.visits?.trim() || "",
    farmers: input.farmers?.trim() || "",
    convRate: input.convRate?.trim() || "",
    followups: input.followups?.trim() || "",
  };

  try {
    await prisma.setting.upsert({
      where: { key: "kpi.data" },
      create: { key: "kpi.data", value: JSON.stringify(data) },
      update: { value: JSON.stringify(data) },
    });
    revalidatePath("/dashboard");
  } catch {
    // DB unavailable pre-seed — swallow so the UI never crashes.
  }
}
