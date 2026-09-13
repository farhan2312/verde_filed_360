import { PROJECT_STATUS_META } from "@/lib/status";
import type { ProjectStatus } from "@prisma/client";

/** Enum (PLANNED|ACTIVE|COMPLETED) → PROJECT_STATUS_META key (planned|active|completed). */
const ENUM_TO_KEY: Record<ProjectStatus, keyof typeof PROJECT_STATUS_META> = {
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
};

/** Dynamic status chip; neutral grey fallback for an unknown/empty status. */
export function StatusPill({ status }: { status: ProjectStatus | null }) {
  const meta = status ? PROJECT_STATUS_META[ENUM_TO_KEY[status]] : undefined;
  const bg = meta?.bg ?? "#F5F5F5";
  const color = meta?.c ?? "#757575";
  const label = meta?.label ?? "";

  return (
    <span
      className="flex-none rounded-[20px] px-3 py-1 text-[11px] font-semibold"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}
