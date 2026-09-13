"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPersona } from "@/lib/session";
import type { ProjectStatus } from "@prisma/client";

/** Post a new activity-log update to a project (newest-first via createdAt desc). */
export async function addProjectUpdate(projectId: number, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const persona = await getPersona();
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });

  try {
    await prisma.projectUpdate.create({
      data: {
        projectId,
        text: trimmed,
        by: persona.name,
        date,
      },
    });
    revalidatePath(`/actions/${projectId}`);
  } catch {
    // DB unavailable — no-op so the UI doesn't crash pre-seed.
  }
}

/** Change a project's status (Set Active / Complete). */
export async function setProjectStatus(projectId: number, status: ProjectStatus) {
  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { status },
    });
    revalidatePath(`/actions/${projectId}`);
  } catch {
    // DB unavailable — no-op.
  }
}
