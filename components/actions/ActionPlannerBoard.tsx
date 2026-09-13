"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { createProjectAction } from "@/app/actions/actions";

/* ─────────────────────────── Types ─────────────────────────── */

export interface ProjectDTO {
  id: number;
  title: string;
  group: string;
  owner: string;
  due: string;
  status: "active" | "planned" | "completed";
  farmerCount: number;
  updateCount: number;
}

export interface ClusterOption {
  value: string;
  label: string;
}

interface Draft {
  title: string;
  owner: string;
  due: string;
  group: string;
}

/* ─────────────────────── Lane config (single source of truth) ─────────────────────── */

type Lane = {
  status: ProjectDTO["status"];
  label: string;
  dot: string; // dot/border accent hex
  numColor: string; // farmers-number color hex
  showUpdates: boolean;
  showDue: boolean;
  dim: boolean;
};

const LANES: Lane[] = [
  { status: "active", label: "Active Projects", dot: "#7DA02E", numColor: "#7DA02E", showUpdates: true, showDue: true, dim: false },
  { status: "planned", label: "Planned", dot: "#D4881F", numColor: "#D4881F", showUpdates: false, showDue: true, dim: false },
  { status: "completed", label: "Completed", dot: "#7B1FA2", numColor: "#7B1FA2", showUpdates: true, showDue: false, dim: true },
];

const EMPTY_DRAFT: Draft = { title: "", owner: "", due: "", group: "" };

/* ─────────────────────────── Board ─────────────────────────── */

export function ActionPlannerBoard({
  projects,
  clusterOptions,
}: {
  projects: ProjectDTO[];
  clusterOptions: ClusterOption[];
}) {
  const router = useRouter();
  const [showNewProject, setShowNewProject] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pending, startTransition] = useTransition();

  const toggleNewProject = () => setShowNewProject((v) => !v);

  const setField = (field: keyof Draft, value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const createProject = () => {
    if (!draft.title.trim()) return; // title-only, silent guard
    const payload = { ...draft };
    startTransition(async () => {
      await createProjectAction(payload);
      setDraft(EMPTY_DRAFT);
      setShowNewProject(false);
      router.refresh();
    });
  };

  return (
    <div className="animate-fadeUp">
      {/* Header row */}
      <div className="mb-[22px] flex items-center justify-between">
        <div className="flex items-center gap-4">
          {LANES.map((lane) => (
            <div
              key={lane.status}
              className={cn(
                "flex items-center gap-[6px] text-[14px]",
                lane.status === "active" ? "font-bold" : "font-semibold",
              )}
              style={{ color: lane.dot }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: lane.dot }} />
              {lane.label.replace(" Projects", "")}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleNewProject}
          className="cursor-pointer rounded-[10px] bg-[#7DA02E] px-[22px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#66852A] active:scale-[0.97]"
        >
          + New Action
        </button>
      </div>

      {/* New Project Form */}
      {showNewProject && (
        <NewProjectForm
          draft={draft}
          clusterOptions={clusterOptions}
          pending={pending}
          onChange={setField}
          onCancel={toggleNewProject}
          onCreate={createProject}
        />
      )}

      {/* Three lanes */}
      {LANES.map((lane, i) => (
        <ProjectLane
          key={lane.status}
          lane={lane}
          projects={projects.filter((p) => p.status === lane.status)}
          last={i === LANES.length - 1}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────── New Project Form ─────────────────────────── */

const inputCls =
  "box-border w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] px-[14px] py-[10px] text-[13px] outline-none focus:border-[#7DA02E]";
const labelCls = "mb-[5px] text-[11px] font-semibold text-[#757575]";

function NewProjectForm({
  draft,
  clusterOptions,
  pending,
  onChange,
  onCancel,
  onCreate,
}: {
  draft: Draft;
  clusterOptions: ClusterOption[];
  pending: boolean;
  onChange: (field: keyof Draft, value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="mb-5 rounded-[14px] border-2 border-dashed border-[#7DA02E] bg-white p-6 shadow-sm">
      <div className="mb-4 text-[15px] font-bold text-[#1A1C1A]">Create New Project / Action</div>
      <div className="mb-[14px] grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        <div>
          <div className={labelCls}>Project Title *</div>
          <input
            type="text"
            placeholder="e.g. Kharif Spray Drive — Mathura"
            value={draft.title}
            onChange={(e) => onChange("title", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <div className={labelCls}>Action Owner *</div>
          <input
            type="text"
            placeholder="e.g. Raj Kumar"
            value={draft.owner}
            onChange={(e) => onChange("owner", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <div className={labelCls}>Due Date</div>
          <input
            type="date"
            value={draft.due}
            onChange={(e) => onChange("due", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <div className={labelCls}>Farmer Cluster</div>
          <select
            value={draft.group}
            onChange={(e) => onChange("group", e.target.value)}
            className={cn(inputCls, "bg-white")}
          >
            <option value="">— Select Farmer Cluster —</option>
            {clusterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-[10px]">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-[10px] border-[1.5px] border-[#E0E0E0] px-5 py-[9px] text-[12px] font-semibold text-[#757575] transition-colors hover:border-[#C62828] hover:text-[#C62828]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={pending}
          className="cursor-pointer rounded-[10px] bg-[#7DA02E] px-6 py-[9px] text-[12px] font-semibold text-white transition-colors hover:bg-[#66852A] disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create Project"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Lane ─────────────────────────── */

function ProjectLane({
  lane,
  projects,
  last,
}: {
  lane: Lane;
  projects: ProjectDTO[];
  last: boolean;
}) {
  return (
    <div className={last ? undefined : "mb-6"}>
      <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.8px] text-[#9E9E9E]">
        {lane.label}
      </div>
      <div className="flex flex-col gap-3">
        {projects.length === 0 ? (
          <div className="text-[12px] text-[#BDBDBD]">No projects</div>
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} lane={lane} />)
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Card ─────────────────────────── */

function MetricStat({
  value,
  label,
  valueColor,
  big,
  minW,
}: {
  value: React.ReactNode;
  label: string;
  valueColor: string;
  big?: boolean;
  minW?: boolean;
}) {
  return (
    <div className={cn("text-center", minW && "min-w-[70px]")}>
      <div
        className={cn("font-bold", big ? "text-[18px]" : "text-[12px] font-semibold")}
        style={{ color: valueColor }}
      >
        {value}
      </div>
      <div className="text-[10px] text-[#BDBDBD]">{label}</div>
    </div>
  );
}

function ProjectCard({ project, lane }: { project: ProjectDTO; lane: Lane }) {
  return (
    <Link
      href={`/actions/${project.id}`}
      className={cn(
        "flex cursor-pointer items-center gap-5 rounded-[14px] border border-black/[0.03] bg-white px-6 py-5 shadow-sm transition-shadow hover:shadow-md",
        lane.dim && "opacity-80 hover:opacity-100",
      )}
      style={{ borderLeft: `4px solid ${lane.dot}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[15px] font-bold text-[#1A1C1A]">{project.title}</div>
        <div className="text-[12px] text-[#9E9E9E]">{project.group}</div>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <MetricStat value={project.farmerCount} label="Farmers" valueColor={lane.numColor} big />
        {lane.showUpdates && (
          <MetricStat value={project.updateCount} label="Updates" valueColor="#424242" big />
        )}
        <MetricStat value={project.owner} label="Owner" valueColor="#424242" minW />
        {lane.showDue && (
          <MetricStat value={project.due} label="Due" valueColor="#E65100" minW />
        )}
      </div>
    </Link>
  );
}
