"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { ChainNext } from "@/components/ChainNext";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  listProjects, createProject, setProjectClusters, deleteProject, extendProject,
  type ProjectVM, type ClusterVM,
} from "@/app/actions/campaigns";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => x.toLocaleString("en-IN");
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  PLANNED: { bg: "#EEF3FB", color: "#1565C0" },
  ACTIVE: { bg: "#F5F9EA", color: "#7DA02E" },
  COMPLETED: { bg: "#F5F5F5", color: "#616161" },
};

export function ProjectsTab({ initial, clusters, initialClusterId }: { initial: ProjectVM[]; clusters: ClusterVM[]; initialClusterId?: number }) {
  const [list, setList] = useState(initial);
  // Chain: arriving via /projects?withCluster=<id> opens the builder with that cluster pre-ticked.
  const [building, setBuilding] = useState(() => initialClusterId != null && clusters.some((c) => c.id === initialClusterId));
  const [editing, setEditing] = useState<ProjectVM | null>(null);
  const [extendingP, setExtendingP] = useState<ProjectVM | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();

  const refresh = () => start(async () => setList(await listProjects()));
  const remove = (id: number) =>
    start(async () => { await deleteProject(id); setList((l) => l.filter((p) => p.id !== id)); });
  const askRemove = async (p: ProjectVM) => {
    if (await confirm({ title: "Delete this project?", confirmLabel: "Delete project", confirmWord: p.name, message: <><b>{p.name}</b> and its campaign links will be permanently removed. This can’t be undone.</> })) remove(p.id);
  };

  return (
    <div>
      {dialog}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] text-[#757575]">
          A project bundles one or more farmer clusters. Run a campaign on the whole project, or on a single cluster inside it.
        </div>
        <button type="button" onClick={() => setBuilding(true)} disabled={clusters.length === 0}
          className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">+ New project</button>
      </div>

      {clusters.length === 0 && (
        <div className="mb-3 rounded-[10px] border border-[#F5CE8E] bg-[#FEF6E9] px-3.5 py-2.5 text-[12.5px] text-[#8D6E00]">
          Build at least one cluster first (Farmer Clusters page) — projects are made from clusters.
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        {list.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[#9E9E9E]">No projects yet — bundle a few clusters into one.</div>
        ) : list.map((p) => {
          const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.PLANNED;
          return (
            <div key={p.id} className="border-b border-[#F5F5F5] px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-[#1A1C1A]">{p.name}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: st.bg, color: st.color }}>{p.status}</span>
                    {p.startDate && <span className="text-[10.5px] font-medium text-[#9E9E9E]">{p.startDate} → {p.endDate}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p.clusters.length === 0 ? (
                      <span className="text-[11.5px] text-[#C62828]">No clusters</span>
                    ) : p.clusters.map((c) => (
                      <span key={c.id} className="rounded-full bg-[#F5F7F5] px-2 py-0.5 text-[10.5px] font-medium text-[#616161]">
                        {c.name} · {n(c.count)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold text-[#7DA02E]">{n(p.audienceCount)}</div>
                  <div className="text-[10.5px] text-[#9E9E9E]">unique farmers</div>
                </div>
                <button type="button" onClick={() => setEditing(p)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#7DA02E] hover:bg-[#F5F9EA]">Edit</button>
                <button type="button" onClick={() => setExtendingP(p)} className="rounded-[8px] bg-[#F5F7F5] px-3 py-1.5 text-[12px] font-semibold text-[#6A1B9A] hover:bg-[#F3E5F5]">Extend</button>
                <button type="button" onClick={() => askRemove(p)} disabled={pending} className="rounded-[8px] bg-[#FDECEA] px-3 py-1.5 text-[12px] font-semibold text-[#C62828] hover:bg-[#F9DCD8] disabled:opacity-50">Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {building && (
        <ProjectBuilder
          clusters={clusters}
          preselect={initialClusterId}
          onClose={() => setBuilding(false)}
          onSaved={() => { setBuilding(false); refresh(); }}
        />
      )}
      {editing && (
        <ProjectBuilder
          clusters={clusters}
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {extendingP && <ExtendProjectModal project={extendingP} onClose={() => setExtendingP(null)} onSaved={() => { setExtendingP(null); refresh(); }} />}
    </div>
  );
}

function ExtendProjectModal({ project, onClose, onSaved }: { project: ProjectVM; onClose: () => void; onSaved: () => void }) {
  const [end, setEnd] = useState(project.endDate ?? "");
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    setErr(null);
    start(async () => { const res = await extendProject(project.id, end); if (res.ok) onSaved(); else setErr(res.error ?? "Failed"); });
  };
  return (
    <Modal open onClose={onClose} className="max-w-[440px]">
      <ModalHeader eyebrow="Extend project" eyebrowColor="#6A1B9A" title={project.name} subtitle={project.endDate ? `Currently ends ${project.endDate}` : "No end date set"} onClose={onClose} />
      <div className="px-5 py-4">
        <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">New end date</label>
        <input type="date" min={project.endDate ?? undefined} className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={end} onChange={(e) => setEnd(e.target.value)} />
        <div className="mt-1 text-[11px] text-[#9E9E9E]">Extending the project lets its campaigns be extended up to the new end.</div>
        {err && <div className="mt-2 text-[12px] text-[#C62828]">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !end} className="rounded-[10px] bg-[#6A1B9A] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? "Extending…" : "Extend"}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Create / edit ── */
function ProjectBuilder({ clusters, project, preselect, onClose, onSaved }: {
  clusters: ClusterVM[]; project?: ProjectVM; preselect?: number; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [picked, setPicked] = useState<number[]>(
    project?.clusters.map((c) => c.id) ?? (preselect != null && clusters.some((c) => c.id === preselect) ? [preselect] : []),
  );
  const [createdId, setCreatedId] = useState<number | null>(null); // chain: project → campaign
  const [startDate, setStart] = useState(project?.startDate ?? "");
  const [endDate, setEnd] = useState(project?.endDate ?? "");
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const reach = useMemo(
    () => clusters.filter((c) => picked.includes(c.id)).reduce((s, c) => s + c.count, 0),
    [picked, clusters],
  );

  const save = () => {
    setErr(null);
    start(async () => {
      if (project) {
        const res = await setProjectClusters(project.id, picked);
        if (res.ok) onSaved(); else setErr(res.error ?? "Failed");
        return;
      }
      const res = await createProject(name, picked, startDate, endDate);
      if (res.ok) {
        // Chain: offer the hop straight into a campaign for this project.
        if (res.id != null) setCreatedId(res.id);
        else onSaved();
      } else setErr(res.error ?? "Failed");
    });
  };

  return (
    <Modal open onClose={createdId != null ? onSaved : onClose} className="max-w-[560px]">
      <ModalHeader
        eyebrow="Step 2 · Project"
        eyebrowColor="#7DA02E"
        title={project ? "Edit project" : "New project"}
        subtitle="Bundle reusable clusters — audience is their live union"
        onClose={createdId != null ? onSaved : onClose}
      />
      <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
        {createdId != null ? (
          <ChainNext message={`Project "${name.trim()}" created`} nextLabel="Next: create a campaign →"
            nextHref={`/campaigns?forProject=${createdId}`} onDone={onSaved} />
        ) : (<>
        {!project && (
          <>
            <label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Name</label>
            <input className="mt-1 mb-3 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kharif Maize Push" />
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div><label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">Start date</label><input type="date" className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={startDate} onChange={(e) => setStart(e.target.value)} /></div>
              <div><label className="text-[11px] font-semibold uppercase text-[#9E9E9E]">End date</label><input type="date" min={startDate || undefined} className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-[13px]" value={endDate} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <div className="mb-3 text-[11px] text-[#9E9E9E]">Campaigns in this project must run within these dates. You can extend the project later.</div>
          </>
        )}

        <div className="mb-1.5 text-[11px] font-semibold uppercase text-[#9E9E9E]">Clusters</div>
        <div className="flex flex-col gap-1.5">
          {clusters.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => toggle(c.id)}
                className="flex items-center justify-between rounded-[10px] border-[1.5px] px-3 py-2 text-left transition-colors"
                style={{ background: on ? "#F5F9EA" : "#fff", borderColor: on ? "#7DA02E" : "#E0E0E0" }}>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold" style={{ color: on ? "#66852A" : "#1A1C1A" }}>{c.name}</div>
                  <div className="truncate text-[11px] text-[#9E9E9E]" title={c.description}>{c.description}</div>
                </div>
                <div className="ml-3 shrink-0 text-[12px] font-bold" style={{ color: on ? "#7DA02E" : "#9E9E9E" }}>{n(c.count)}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-[10px] bg-[#F5F7F5] px-4 py-3">
          <div className="text-[12px] text-[#616161]">{picked.length} cluster{picked.length === 1 ? "" : "s"} · summed reach</div>
          <div className="text-[18px] font-bold text-[#7DA02E]">{n(reach)}</div>
        </div>
        <div className="mt-1 text-[11px] text-[#9E9E9E]">Actual project audience de-duplicates farmers shared across clusters.</div>
        {err && <div className="mt-2 text-[12px] text-[#C62828]">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>
          <button type="button" onClick={save} disabled={saving || (!project && (!name.trim() || !startDate || !endDate)) || picked.length === 0}
            className="rounded-[10px] bg-[#7DA02E] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </button>
        </div>
        </>)}
      </div>
    </Modal>
  );
}
