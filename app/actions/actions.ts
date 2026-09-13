"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface CreateProjectInput {
  title: string;
  owner?: string;
  due?: string;
  group?: string;
}

/**
 * Create a new Action Planner project. Mirrors the original `createProject`:
 * title is required (silent no-op otherwise), new projects always land in the
 * Planned lane with 0 farmers/updates.
 */
export async function createProjectAction(input: CreateProjectInput) {
  const title = input.title?.trim();
  if (!title) return; // title-only, silent validation (original behaviour)

  try {
    await prisma.project.create({
      data: {
        title,
        status: "PLANNED",
        owner: input.owner?.trim() || null,
        due: input.due?.trim() || null,
        groupName: input.group?.trim() || null,
        source: "DEMO",
      },
    });
    revalidatePath("/actions");
  } catch {
    // DB unavailable pre-seed — swallow so the UI never crashes.
  }
}
