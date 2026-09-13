"use client";

import { useTransition } from "react";
import type { ProjectStatus } from "@prisma/client";
import { setProjectStatus } from "@/app/actions/project-detail";
import { StatusPill } from "./StatusPill";

export interface ProjectHeader {
  id: number;
  title: string;
  status: ProjectStatus | null;
  owner: string;
  due: string;
  group: string;
}

export function ProjectHeaderCard({ project }: { project: ProjectHeader }) {
  const [pending, startTransition] = useTransition();

  const change = (status: ProjectStatus) =>
    startTransition(() => {
      void setProjectStatus(project.id, status);
    });

  return (
    <div className="rounded-[14px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1 pr-3 text-[18px] font-bold leading-[1.3] text-[#1A1C1A]">
          {project.title}
        </div>
        <StatusPill status={project.status} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-[13px]">
          <span className="text-[#9E9E9E]">Owner</span>
          <span className="font-semibold text-[#1A1C1A]">{project.owner}</span>
        </div>
        <div className="flex justify-between text-[13px]">
          <span className="text-[#9E9E9E]">Due Date</span>
          <span className="font-semibold text-[#E65100]">{project.due}</span>
        </div>
        <div className="flex justify-between text-[13px]">
          <span className="text-[#9E9E9E]">Farmer Cluster</span>
          <span className="max-w-[200px] text-right font-semibold text-[#1A1C1A]">
            {project.group}
          </span>
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-t border-[#F0F0F0] pt-3.5">
        <button
          type="button"
          onClick={() => change("ACTIVE")}
          disabled={pending || project.status === "ACTIVE"}
          className="flex-1 cursor-pointer rounded-lg bg-[#F3F8E6] px-4 py-[7px] text-center text-[11px] font-semibold text-[#678722] transition-colors hover:bg-[#E4EFC9] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[#F3F8E6]"
        >
          Set Active
        </button>
        <button
          type="button"
          onClick={() => change("COMPLETED")}
          disabled={pending || project.status === "COMPLETED"}
          className="flex-1 cursor-pointer rounded-lg bg-[#F3E5F5] px-4 py-[7px] text-center text-[11px] font-semibold text-[#7B1FA2] transition-colors hover:bg-[#E1BEE7] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[#F3E5F5]"
        >
          Complete
        </button>
      </div>
    </div>
  );
}
