"use client";

import { useRef, useState, useTransition } from "react";
import { addProjectUpdate } from "@/app/actions/project-detail";
import { EmptyState } from "@/components/ui";

export interface ProjectUpdateItem {
  id: number;
  text: string;
  by: string;
  date: string;
}

export function ActivityLogCard({
  projectId,
  updates,
}: {
  projectId: number;
  updates: ProjectUpdateItem[];
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const post = () => {
    const text = value.trim();
    if (!text || pending) return;
    startTransition(async () => {
      await addProjectUpdate(projectId, text);
      setValue("");
      inputRef.current?.focus();
    });
  };

  return (
    <div className="rounded-[14px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
      <div className="mb-4 text-[14px] font-bold text-[#1A1C1A]">Activity Log</div>

      {/* Add update */}
      <div className="mb-5 flex gap-2.5">
        <input
          ref={inputRef}
          type="text"
          placeholder="Write an update..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") post();
          }}
          className="box-border flex-1 rounded-[10px] border-[1.5px] border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#678722]"
        />
        <button
          type="button"
          onClick={post}
          disabled={pending || !value.trim()}
          className="flex flex-none cursor-pointer items-center rounded-[10px] bg-[#678722] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#516A1B] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[#678722]"
        >
          Post
        </button>
      </div>

      {/* Timeline */}
      {updates.length === 0 ? (
        <EmptyState title="No activity yet" hint="Post the first update above." className="py-8" />
      ) : (
        updates.map((upd, i) => (
          <div
            key={upd.id}
            className="flex gap-3.5 border-b border-[#F5F5F5] py-4 last:border-b-0"
          >
            <div className="flex flex-none flex-col items-center">
              <div className="h-2.5 w-2.5 flex-none rounded-full bg-[#678722]" />
              {i < updates.length - 1 && (
                <div className="mt-1 w-0.5 flex-1 bg-[#E0E0E0]" />
              )}
            </div>
            <div className="flex-1">
              <div className="mb-2 text-[13px] leading-[1.6] text-[#1A1C1A]">
                {upd.text}
              </div>
              <div className="flex gap-3 text-[11px] text-[#BDBDBD]">
                <span className="font-semibold text-[#757575]">{upd.by}</span>
                <span>{upd.date}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
