"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/** Keys for the system-configuration block, stored as `Setting` rows. */
export const CONFIG_KEYS = [
  "config.primaryIdLabel",
  "config.visitReasonRequired",
  "config.requireGPS",
  "config.defaultDistrict",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

/** Upsert a single config Setting row and revalidate the settings route. */
export async function updateSettingAction(key: ConfigKey, value: string) {
  if (!(CONFIG_KEYS as readonly string[]).includes(key)) return;
  try {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    await prisma.auditLog.create({
      data: {
        action: "CONFIG",
        entity: "Setting",
        detail: `System setting changed: ${key} → ${value}`,
      },
    });
  } catch {
    // DB unavailable pre-seed — swallow so the UI doesn't crash.
  }
  revalidatePath("/settings");
}
